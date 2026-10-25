const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const BaseProvider = require('./base');
const { BaseMangaProvider, BaseAnimeProvider, cheerio, http } = BaseProvider;

const OnePiecePowerProvider = require('./onepiecepower');
const MangaDexProvider = require('./mangadex');
const MangapillProvider = require('./mangapill');
const OnePiecePowerAnimeProvider = require('./onepiecepower-anime');

const CONFIG_DIR = process.env.MANGA_CLI_CONFIG_DIR || 
  (process.env.XDG_CONFIG_HOME 
    ? path.join(process.env.XDG_CONFIG_HOME, 'manga-cli') 
    : path.join(os.homedir(), '.config', 'manga-cli'));

const PROVIDERS_DIR = path.join(CONFIG_DIR, 'providers');

class ProviderManager {
  constructor() {
    this.mangaProviders = new Map();
    this.animeProviders = new Map();
    this.errors = [];

    this.ensureDir();
    this.loadBuiltInProviders();
    this.loadCustomProviders();
  }

  ensureDir() {
    if (!fs.existsSync(PROVIDERS_DIR)) {
      try {
        fs.mkdirSync(PROVIDERS_DIR, { recursive: true });
      } catch (err) {
        // Ignored if cannot create directory
      }
    }
  }

  getUserProvidersDir() {
    this.ensureDir();
    return PROVIDERS_DIR;
  }

  loadBuiltInProviders() {
    const opp = new OnePiecePowerProvider();
    const md = new MangaDexProvider();
    const mp = new MangapillProvider();
    const oppAnime = new OnePiecePowerAnimeProvider();

    this.mangaProviders.set(opp.id, opp);
    this.mangaProviders.set(md.id, md);
    this.mangaProviders.set(mp.id, mp);

    this.animeProviders.set(oppAnime.id, oppAnime);
  }

  loadCustomProviders() {
    if (!fs.existsSync(PROVIDERS_DIR)) return;

    let files = [];
    try {
      files = fs.readdirSync(PROVIDERS_DIR).filter(f => f.endsWith('.js') && !f.startsWith('.'));
    } catch {
      return;
    }

    for (const file of files) {
      const fullPath = path.join(PROVIDERS_DIR, file);
      try {
        // Clear require cache to allow dynamic reloading
        delete require.cache[require.resolve(fullPath)];
        let mod = require(fullPath);

        // Support factory functions: module.exports = ({ BaseMangaProvider, ... }) => ...
        if (typeof mod === 'function' && !(mod.prototype && mod.prototype.search)) {
          mod = mod({
            BaseProvider,
            BaseMangaProvider,
            BaseAnimeProvider,
            cheerio,
            ...http
          });
        }

        let instance;
        if (typeof mod === 'function') {
          instance = new mod();
        } else if (mod && typeof mod === 'object') {
          instance = mod;
        }

        if (!instance || typeof instance.search !== 'function') {
          this.errors.push({ file, error: 'Provider must implement search() method' });
          continue;
        }

        const fileSlug = path.basename(file, '.js').toLowerCase();
        if (!instance.id) instance.id = fileSlug;
        if (!instance.name) instance.name = fileSlug;
        if (!instance.languages || !Array.isArray(instance.languages)) {
          instance.languages = ['all'];
        }
        instance.isCustom = true;
        instance.filePath = fullPath;

        if (!instance.type) {
          if (typeof instance.getEpisodes === 'function' || typeof instance.getEpisodeStream === 'function') {
            instance.type = 'anime';
          } else {
            instance.type = 'manga';
          }
        }

        if (instance.type === 'anime') {
          this.animeProviders.set(instance.id, instance);
        } else {
          this.mangaProviders.set(instance.id, instance);
        }
      } catch (err) {
        this.errors.push({ file, error: err.message });
      }
    }
  }

  getAllProviders() {
    return [
      ...Array.from(this.mangaProviders.values()),
      ...Array.from(this.animeProviders.values())
    ];
  }

  getMangaProviders() {
    return Array.from(this.mangaProviders.values());
  }

  getAnimeProviders() {
    return Array.from(this.animeProviders.values());
  }

  getMangaProvider(id) {
    if (!id) return this.mangaProviders.get('onepiecepower');
    const cleanId = String(id).toLowerCase().trim();
    if (this.mangaProviders.has(cleanId)) {
      return this.mangaProviders.get(cleanId);
    }
    // Partial or name match fallback
    for (const [key, prov] of this.mangaProviders.entries()) {
      if (key.includes(cleanId) || prov.name.toLowerCase().includes(cleanId)) {
        return prov;
      }
    }
    return this.mangaProviders.get('onepiecepower');
  }

  getAnimeProvider(id) {
    if (!id) return this.animeProviders.get('onepiecepower-anime');
    const cleanId = String(id).toLowerCase().trim();
    if (this.animeProviders.has(cleanId)) {
      return this.animeProviders.get(cleanId);
    }
    for (const [key, prov] of this.animeProviders.entries()) {
      if (key.includes(cleanId) || prov.name.toLowerCase().includes(cleanId)) {
        return prov;
      }
    }
    return this.animeProviders.get('onepiecepower-anime');
  }

  async searchManga(query, lang = null, sourceFilter = null) {
    let providers = this.getMangaProviders();

    if (sourceFilter) {
      const cleanFilter = String(sourceFilter).toLowerCase();
      providers = providers.filter(p => 
        p.id.toLowerCase() === cleanFilter || 
        p.name.toLowerCase().includes(cleanFilter)
      );
    } else if (lang) {
      const cleanLang = lang.toLowerCase();
      providers = providers.filter(p => {
        if (cleanLang === 'all') return true;
        return p.languages.includes(cleanLang) || p.languages.includes('all');
      });
    }

    if (providers.length === 0) {
      return [];
    }

    const searchPromises = providers.map(async (provider) => {
      try {
        const items = await provider.search(query, lang);
        if (!Array.isArray(items)) return [];
        return items.map(item => ({
          ...item,
          source: item.source || provider.id,
          sourceName: provider.name,
          language: item.language || lang || (provider.languages[0] !== 'all' ? provider.languages[0] : 'en')
        }));
      } catch (err) {
        return [];
      }
    });

    const settled = await Promise.allSettled(searchPromises);
    const results = [];
    for (const res of settled) {
      if (res.status === 'fulfilled' && Array.isArray(res.value)) {
        results.push(...res.value);
      }
    }
    return results;
  }

  async searchAnime(query, lang = null, sourceFilter = null) {
    let providers = this.getAnimeProviders();

    if (sourceFilter) {
      const cleanFilter = String(sourceFilter).toLowerCase();
      providers = providers.filter(p => 
        p.id.toLowerCase() === cleanFilter || 
        p.name.toLowerCase().includes(cleanFilter)
      );
    } else if (lang) {
      const cleanLang = lang.toLowerCase();
      providers = providers.filter(p => {
        if (cleanLang === 'all') return true;
        return p.languages.includes(cleanLang) || p.languages.includes('all');
      });
    }

    if (providers.length === 0) {
      return [];
    }

    const searchPromises = providers.map(async (provider) => {
      try {
        const items = await provider.search(query, lang);
        if (!Array.isArray(items)) return [];
        return items.map(item => ({
          ...item,
          source: item.source || provider.id,
          sourceName: provider.name,
          language: item.language || lang || (provider.languages[0] !== 'all' ? provider.languages[0] : 'it'),
          audio: item.audio || 'both'
        }));
      } catch (err) {
        return [];
      }
    });

    const settled = await Promise.allSettled(searchPromises);
    const results = [];
    for (const res of settled) {
      if (res.status === 'fulfilled' && Array.isArray(res.value)) {
        results.push(...res.value);
      }
    }
    return results;
  }

  /**
   * Retrieves the manga catalog (either all providers or a specific provider)
   */
  async getMangaCatalog(sourceFilter = null, lang = null) {
    let providers = this.getMangaProviders();

    if (sourceFilter) {
      const cleanFilter = String(sourceFilter).toLowerCase().trim();
      providers = providers.filter(p => 
        p.id.toLowerCase() === cleanFilter || 
        p.name.toLowerCase().includes(cleanFilter)
      );
    } else if (lang) {
      const cleanLang = lang.toLowerCase();
      providers = providers.filter(p => {
        if (cleanLang === 'all') return true;
        return p.languages.includes(cleanLang) || p.languages.includes('all');
      });
    }

    if (providers.length === 0) {
      return [];
    }

    const promises = providers.map(async (provider) => {
      try {
        let items = [];
        if (typeof provider.getCatalog === 'function') {
          items = await provider.getCatalog(lang);
        } else if (typeof provider.search === 'function') {
          items = await provider.search('', lang);
        }
        if (!Array.isArray(items)) return [];
        return items.map(item => ({
          ...item,
          type: 'manga',
          source: item.source || provider.id,
          sourceName: provider.name,
          language: item.language || lang || (provider.languages[0] !== 'all' ? provider.languages[0] : 'en')
        }));
      } catch (err) {
        return [];
      }
    });

    const settled = await Promise.allSettled(promises);
    const results = [];
    for (const res of settled) {
      if (res.status === 'fulfilled' && Array.isArray(res.value)) {
        results.push(...res.value);
      }
    }
    return results;
  }

  /**
   * Retrieves the anime catalog (either all providers or a specific provider)
   */
  async getAnimeCatalog(sourceFilter = null, lang = null) {
    let providers = this.getAnimeProviders();

    if (sourceFilter) {
      const cleanFilter = String(sourceFilter).toLowerCase().trim();
      providers = providers.filter(p => 
        p.id.toLowerCase() === cleanFilter || 
        p.name.toLowerCase().includes(cleanFilter)
      );
    } else if (lang) {
      const cleanLang = lang.toLowerCase();
      providers = providers.filter(p => {
        if (cleanLang === 'all') return true;
        return p.languages.includes(cleanLang) || p.languages.includes('all');
      });
    }

    if (providers.length === 0) {
      return [];
    }

    const promises = providers.map(async (provider) => {
      try {
        let items = [];
        if (typeof provider.getCatalog === 'function') {
          items = await provider.getCatalog(lang);
        } else if (typeof provider.search === 'function') {
          items = await provider.search('', lang);
        }
        if (!Array.isArray(items)) return [];
        return items.map(item => ({
          ...item,
          type: 'anime',
          source: item.source || provider.id,
          sourceName: provider.name,
          language: item.language || lang || (provider.languages[0] !== 'all' ? provider.languages[0] : 'it')
        }));
      } catch (err) {
        return [];
      }
    });

    const settled = await Promise.allSettled(promises);
    const results = [];
    for (const res of settled) {
      if (res.status === 'fulfilled' && Array.isArray(res.value)) {
        results.push(...res.value);
      }
    }
    return results;
  }

  /**
   * Retrieves full catalog (Manga and/or Anime) according to options
   * @param {{ type?: 'all'|'manga'|'anime', source?: string|null, lang?: string|null }} options
   */
  async getFullCatalog({ type = 'all', source = null, lang = null } = {}) {
    const catalog = { manga: [], anime: [] };

    // If a source is specified and type is 'all', check which type(s) this source belongs to
    if (source && type === 'all') {
      const cleanSource = String(source).toLowerCase().trim();
      const hasManga = this.getMangaProviders().some(p => p.id.toLowerCase() === cleanSource || p.name.toLowerCase().includes(cleanSource));
      const hasAnime = this.getAnimeProviders().some(p => p.id.toLowerCase() === cleanSource || p.name.toLowerCase().includes(cleanSource));

      if (hasManga && !hasAnime) {
        catalog.manga = await this.getMangaCatalog(source, lang);
      } else if (hasAnime && !hasManga) {
        catalog.anime = await this.getAnimeCatalog(source, lang);
      } else {
        catalog.manga = await this.getMangaCatalog(source, lang);
        catalog.anime = await this.getAnimeCatalog(source, lang);
      }
      return catalog;
    }

    if (type === 'manga' || type === 'all') {
      catalog.manga = await this.getMangaCatalog(source, lang);
    }
    if (type === 'anime' || type === 'all') {
      catalog.anime = await this.getAnimeCatalog(source, lang);
    }

    return catalog;
  }

  addProviderFromFileOrUrl(fileOrUrl) {
    this.ensureDir();
    const isUrl = fileOrUrl.startsWith('http://') || fileOrUrl.startsWith('https://');

    if (isUrl) {
      const urlObj = new URL(fileOrUrl);
      let filename = path.basename(urlObj.pathname);
      if (!filename.endsWith('.js')) {
        filename = `${filename || 'custom-source'}.js`;
      }
      const targetPath = path.join(PROVIDERS_DIR, filename);

      // Fetch code with curl
      const code = execFileSync('curl', ['-s', '-L', fileOrUrl], { encoding: 'utf-8' });
      if (!code || code.trim().length === 0) {
        throw new Error(`Failed to download provider code from: ${fileOrUrl}`);
      }
      fs.writeFileSync(targetPath, code, 'utf-8');
      return { targetPath, filename };
    } else {
      const resolved = path.resolve(fileOrUrl);
      if (!fs.existsSync(resolved)) {
        throw new Error(`Source file not found at: ${resolved}`);
      }
      const filename = path.basename(resolved);
      const targetPath = path.join(PROVIDERS_DIR, filename);
      fs.copyFileSync(resolved, targetPath);
      return { targetPath, filename };
    }
  }

  removeProvider(idOrName) {
    this.ensureDir();
    const clean = idOrName.toLowerCase().replace(/\.js$/, '');
    const files = fs.readdirSync(PROVIDERS_DIR);

    for (const file of files) {
      const name = path.basename(file, '.js').toLowerCase();
      if (name === clean || file.toLowerCase() === `${clean}.js`) {
        const targetPath = path.join(PROVIDERS_DIR, file);
        fs.unlinkSync(targetPath);
        return { success: true, file, targetPath };
      }
    }
    return { success: false, file: idOrName };
  }

  createTemplate(name, type = 'manga') {
    this.ensureDir();
    const cleanSlug = (name || 'my-source')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/^-+|-+$/g, '') || 'my-source';

    const filename = `${cleanSlug}.js`;
    const targetPath = path.join(PROVIDERS_DIR, filename);

    if (fs.existsSync(targetPath)) {
      throw new Error(`A provider file already exists at: ${targetPath}`);
    }

    const templateContent = type === 'anime'
      ? `/**
 * Custom Anime Provider for manga-cli
 * File: ${filename}
 */
module.exports = ({ BaseAnimeProvider, cheerio, fetchHtml, fetchJson }) => {
  return class CustomAnimeProvider extends BaseAnimeProvider {
    constructor() {
      super('${name || 'My Anime Source'}', 'https://example.com', {
        id: '${cleanSlug}',
        languages: ['it'], // List of supported language codes: 'it', 'en', 'es', etc.
      });
    }

    /**
     * 1. Search anime by title
     * @param {string} query Search keyword
     * @param {string|null} lang Filter language (e.g. 'it')
     * @returns {Promise<Array<{ id: string, title: string, url: string, audio?: 'ita'|'subita'|'both' }>>}
     */
    async search(query, lang = null) {
      // Example using HTML scraping:
      // const html = await this.fetchHtml(\`\${this.baseUrl}/search?q=\${encodeURIComponent(query)}\`);
      // const $ = this.cheerio.load(html);
      // const results = [];
      // $('.anime-item').each((_, el) => {
      //   results.push({
      //     id: $(el).find('a').attr('href'),
      //     title: $(el).find('.title').text().trim(),
      //     url: $(el).find('a').attr('href'),
      //     audio: 'subita'
      //   });
      // });
      // return results;

      return [];
    }

    /**
     * 2. Get list of episodes for an anime series
     * @param {string} animeUrl The url returned from search
     * @returns {Promise<Array<{ id: string, title: string, url: string }>>}
     */
    async getEpisodes(animeUrl) {
      // const html = await this.fetchHtml(animeUrl);
      // const $ = this.cheerio.load(html);
      // const episodes = [];
      // $('.episode-item a').each((_, el) => {
      //   episodes.push({
      //     id: $(el).text().trim(),
      //     title: \`Episodio \${$(el).text().trim()}\`,
      //     url: $(el).attr('href')
      //   });
      // });
      // return episodes;

      return [];
    }

    /**
     * 3. Resolve the direct MP4 / HLS streaming URL for an episode
     * @param {string} episodeUrl
     * @param {'subita'|'ita'|string} preferredAudio
     * @returns {Promise<{ streamUrl: string|null, options?: { ita?: string, subita?: string }, availableAudios?: string[] }>}
     */
    async getEpisodeStream(episodeUrl, preferredAudio = 'subita') {
      // const html = await this.fetchHtml(episodeUrl);
      // const $ = this.cheerio.load(html);
      // const streamUrl = $('video source').attr('src') || $('video').attr('src');
      // return {
      //   streamUrl,
      //   availableAudios: ['subita']
      // };

      return { streamUrl: null };
    }
  };
};
`
      : `/**
 * Custom Manga Provider for manga-cli
 * File: ${filename}
 */
module.exports = ({ BaseMangaProvider, cheerio, fetchHtml, fetchJson }) => {
  return class CustomMangaProvider extends BaseMangaProvider {
    constructor() {
      super('${name || 'My Manga Source'}', 'https://example.com', {
        id: '${cleanSlug}',
        languages: ['it', 'en'], // List of supported languages: 'it', 'en', 'es', etc.
      });
    }

    /**
     * 1. Search manga by title
     * @param {string} query Search keyword
     * @param {string|null} lang Filter language (e.g. 'it')
     * @returns {Promise<Array<{ id: string, title: string, url: string, author?: string, genres?: string }>>}
     */
    async search(query, lang = null) {
      // Example using HTML scraping:
      // const html = await this.fetchHtml(\`\${this.baseUrl}/search?q=\${encodeURIComponent(query)}\`);
      // const $ = this.cheerio.load(html);
      // const results = [];
      // $('.manga-card').each((_, el) => {
      //   results.push({
      //     id: $(el).find('a').attr('href'),
      //     title: $(el).find('.title').text().trim(),
      //     url: $(el).find('a').attr('href'),
      //     author: $(el).find('.author').text().trim()
      //   });
      // });
      // return results;

      return [];
    }

    /**
     * 2. Get list of chapters for a manga
     * @param {string} mangaUrl The url returned from search
     * @param {string|null} lang
     * @returns {Promise<Array<{ id: string, title: string, url: string, number?: number|string }>>}
     */
    async getChapters(mangaUrl, lang = null) {
      // const html = await this.fetchHtml(mangaUrl);
      // const $ = this.cheerio.load(html);
      // const chapters = [];
      // $('.chapter-row a').each((_, el) => {
      //   chapters.push({
      //     id: $(el).attr('href'),
      //     title: $(el).text().trim(),
      //     url: $(el).attr('href')
      //   });
      // });
      // return chapters;

      return [];
    }

    /**
     * 3. Extract all page image URLs for a specific chapter
     * @param {string} chapterUrl
     * @returns {Promise<{ title?: string, pages: Array<string> }>}
     */
    async getChapterPages(chapterUrl) {
      // const html = await this.fetchHtml(chapterUrl);
      // const $ = this.cheerio.load(html);
      // const pages = [];
      // $('.chapter-pages img').each((_, el) => {
      //   const src = $(el).attr('src') || $(el).attr('data-src');
      //   if (src) pages.push(src);
      // });
      // return { pages };

      return { pages: [] };
    }
  };
};
`;

    fs.writeFileSync(targetPath, templateContent, 'utf-8');
    return { targetPath, filename };
  }

  reload() {
    this.mangaProviders.clear();
    this.animeProviders.clear();
    this.errors = [];
    this.loadBuiltInProviders();
    this.loadCustomProviders();
  }

  getCommunityCatalog() {
    const registryPath = path.join(__dirname, 'community', 'index.json');
    if (!fs.existsSync(registryPath)) return [];
    try {
      const raw = fs.readFileSync(registryPath, 'utf-8');
      const list = JSON.parse(raw);
      return list.map(item => {
        const isInstalled = this.mangaProviders.has(item.id) || this.animeProviders.has(item.id);
        return {
          ...item,
          isInstalled
        };
      });
    } catch {
      return [];
    }
  }

  installCommunitySource(id) {
    this.ensureDir();
    const catalog = this.getCommunityCatalog();
    const entry = catalog.find(c => c.id.toLowerCase() === id.toLowerCase() || c.name.toLowerCase() === id.toLowerCase());
    if (!entry) {
      throw new Error(`Source "${id}" not found in community catalog`);
    }

    const srcPath = path.join(__dirname, 'community', entry.file);
    if (!fs.existsSync(srcPath)) {
      throw new Error(`Source file ${entry.file} not found in community store`);
    }

    const destPath = path.join(PROVIDERS_DIR, entry.file);
    fs.copyFileSync(srcPath, destPath);
    this.reload();
    return {
      success: true,
      entry,
      destPath
    };
  }

  updateCommunitySources() {
    this.ensureDir();
    const catalog = this.getCommunityCatalog();
    const updated = [];

    for (const item of catalog) {
      const destPath = path.join(PROVIDERS_DIR, item.file);
      if (fs.existsSync(destPath)) {
        const srcPath = path.join(__dirname, 'community', item.file);
        if (fs.existsSync(srcPath)) {
          fs.copyFileSync(srcPath, destPath);
          updated.push(item);
        }
      }
    }

    this.reload();
    return updated;
  }
}

module.exports = ProviderManager;
