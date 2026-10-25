const cheerio = require('cheerio');
const BaseProvider = require('./base');
const { fetchHtml } = require('../utils/http');

class OnePiecePowerAnimeProvider extends BaseProvider {
  constructor() {
    super('One Piece Power Anime', 'https://onepiecepower.com', {
      id: 'onepiecepower-anime',
      type: 'anime',
      languages: ['it', 'en'],
      isBuiltIn: true
    });
    this.id = 'onepiecepower-anime';
    this.type = 'anime';
    this.languages = ['it', 'en'];
    this.isBuiltIn = true;
    this.animeListCache = null;
  }

  /**
   * Fetches and caches the complete anime catalog from /anime18/lista-anime2
   */
  async getCatalog() {
    if (this.animeListCache) {
      return this.animeListCache;
    }

    const html = await fetchHtml(`${this.baseUrl}/anime18/lista-anime2`);
    const $ = cheerio.load(html);
    const list = [];

    // 1. One Piece main anime entries
    list.push({
      title: 'One Piece (Sub ITA)',
      url: `${this.baseUrl}/anime18/onepiece/subita2/lista-episodi`,
      language: 'it',
      audio: 'subita',
      source: 'onepiecepower'
    });
    list.push({
      title: 'One Piece (ITA Doppiato)',
      url: `${this.baseUrl}/anime18/onepiece/ita3/lista-episodi`,
      language: 'it',
      audio: 'ita',
      source: 'onepiecepower'
    });
    list.push({
      title: 'One Piece (English Sub)',
      url: `${this.baseUrl}/anime18/one-piece-eng/episode-list`,
      language: 'en',
      audio: 'sub',
      source: 'onepiecepower'
    });
    list.push({
      title: 'One Piece Movie / Film',
      url: `${this.baseUrl}/anime18/one-piece-movie/episodi/lista-movie`,
      language: 'it',
      audio: 'both',
      source: 'onepiecepower'
    });
    list.push({
      title: 'One Piece Special',
      url: `${this.baseUrl}/anime18/onepiece/special/lista-special`,
      language: 'it',
      audio: 'both',
      source: 'onepiecepower'
    });

    // 2. Parse all catalog links from table / links
    $('a').each((_, el) => {
      let href = $(el).attr('href');
      let text = $(el).text().trim();
      if (!href || !text) return;

      // Filter out non-anime navigational / ad links
      if (
        href.includes('lista-anime') ||
        href.includes('login') ||
        href.includes('vip') ||
        href.includes('guide') ||
        href.includes('amazon') ||
        href.includes('telegram') ||
        href.includes('play.google') ||
        href.startsWith('mailto:') ||
        href.startsWith('javascript:')
      ) {
        return;
      }

      if (href.includes('episodi') || href.includes('lista') || href.includes('movie') || href.includes('special')) {
        if (text.toLowerCase().includes('one piece')) return; // already added above

        let fullUrl = href;
        if (!fullUrl.startsWith('http')) {
          fullUrl = `${this.baseUrl}/anime18/${href.replace(/^\.\.\/\.\.\//, '')}`;
        }

        const isIta = text.includes('ITA') || text.includes('Ita');
        const isSub = text.includes('SUB') || text.includes('Sub');
        let audio = 'both';
        if (isSub && !text.includes('ITA/')) audio = 'subita';
        else if (isIta && !isSub) audio = 'ita';

        list.push({
          title: text,
          url: fullUrl,
          language: 'it',
          audio,
          source: 'onepiecepower'
        });
      }
    });

    this.animeListCache = list;
    return list;
  }

  /**
   * Search anime by title or keywords
   * @param {string} query 
   * @param {string|null} lang 
   */
  async search(query, lang = null) {
    const catalog = await this.getCatalog();
    const clean = (query || '').toLowerCase().trim();

    return catalog.filter(a => {
      if (lang && lang !== 'all' && a.language !== lang) return false;
      if (!clean) return true;
      return a.title.toLowerCase().includes(clean);
    });
  }

  /**
   * Pick a random anime from catalog
   */
  async getRandomAnime(lang = null) {
    const catalog = await this.getCatalog();
    const filtered = lang && lang !== 'all' ? catalog.filter(a => a.language === lang) : catalog;
    if (filtered.length === 0) return null;
    const idx = Math.floor(Math.random() * filtered.length);
    return filtered[idx];
  }

  /**
   * Get all episodes for an anime series
   * @param {string} animeUrl 
   */
  async getEpisodes(animeUrl) {
    const html = await fetchHtml(animeUrl);
    const $ = cheerio.load(html);
    const episodes = [];

    const baseUrlParts = animeUrl.split('/');
    baseUrlParts.pop();
    const dirUrl = baseUrlParts.join('/');

    // 1. Try table rows first (contains cleanly formatted titles and episode links)
    $('table tr').each((_, el) => {
      const link = $(el).find('a[href*="pagine/"]').first();
      if (link.length > 0) {
        const rawHref = link.attr('href');
        let fullUrl = rawHref;
        if (!fullUrl.startsWith('http')) {
          fullUrl = `${dirUrl}/${rawHref.replace(/^\.\//, '')}`;
        }

        let title = $(el).text().replace(/\s+/g, ' ').trim();
        const epMatch = fullUrl.match(/pagine\/(?:[^\/]+\/)?(\d+)/);
        const epNum = epMatch ? epMatch[1] : '';

        if (!title && epNum) {
          title = `Episodio ${parseInt(epNum, 10)}`;
        }

        episodes.push({
          id: epNum || fullUrl,
          title,
          url: fullUrl
        });
      }
    });

    // 2. Fallback to any a[href*="pagine/"] if no table rows matched
    if (episodes.length === 0) {
      $('a[href*="pagine/"]').each((_, el) => {
        const rawHref = $(el).attr('href');
        let fullUrl = rawHref;
        if (!fullUrl.startsWith('http')) {
          fullUrl = `${dirUrl}/${rawHref.replace(/^\.\//, '')}`;
        }
        let title = $(el).text().trim() || $(el).parent().text().replace(/\s+/g, ' ').trim();
        const epMatch = fullUrl.match(/pagine\/(?:[^\/]+\/)?(\d+)/);
        const epNum = epMatch ? epMatch[1] : '';
        if (!title && epNum) {
          title = `Episodio ${parseInt(epNum, 10)}`;
        }
        episodes.push({
          id: epNum || fullUrl,
          title,
          url: fullUrl
        });
      });
    }

    return episodes;
  }

  /**
   * Resolves the video stream for an episode page
   * @param {string} episodeUrl 
   * @param {'subita'|'ita'} preferredAudio 
   * @returns {Promise<{ streamUrl: string|null, options: { ita: string|null, subita: string|null, direct: string|null }, availableAudios: string[] }>}
   */
  async getEpisodeStream(episodeUrl, preferredAudio = 'subita') {
    const html = await fetchHtml(episodeUrl);
    const $ = cheerio.load(html);

    let streamOptions = {
      ita: null,
      subita: null,
      direct: null
    };

    // 1. Check Schema.org video object
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html());
        const u = data.contentUrl || data.embedUrl;
        if (u && u.includes('.mp4')) {
          streamOptions.direct = u;
          if (u.includes('/subita/')) streamOptions.subita = u;
          if (u.includes('/ita/')) streamOptions.ita = u;
        }
      } catch {}
    });

    // 2. Check inline scripts for videoUrl or dynamic concatenated source
    $('script').each((_, el) => {
      const s = $(el).html() || '';

      // Pattern A: Concatenation with + type + e.g. 'https://serverfile.club/anime/...' + type + '...'
      const concatMatch = s.match(/['"](https?:\/\/(?:serverfile|stream)[^'"]+)['"]\s*\+\s*type\s*\+\s*['"]([^'"]+)['"]/);
      if (concatMatch) {
        streamOptions.ita = concatMatch[1] + 'ita' + concatMatch[2];
        streamOptions.subita = concatMatch[1] + 'subita' + concatMatch[2];
      }

      // Pattern B: videoUrl: "..."
      const vMatch = s.match(/videoUrl\s*:\s*["']([^"']+\.mp4[^"']*)["']/);
      if (vMatch) {
        streamOptions.direct = vMatch[1];
        if (vMatch[1].includes('/subita/')) streamOptions.subita = vMatch[1];
        if (vMatch[1].includes('/ita/')) streamOptions.ita = vMatch[1];
      }

      // Pattern C: direct serverfile.club mp4
      if (!streamOptions.direct && !streamOptions.ita && !streamOptions.subita) {
        const sfcMatch = s.match(/["'](https?:\/\/serverfile\.club\/[^"']+\.mp4)["']/);
        if (sfcMatch) {
          streamOptions.direct = sfcMatch[1];
          if (sfcMatch[1].includes('/subita/')) streamOptions.subita = sfcMatch[1];
          if (sfcMatch[1].includes('/ita/')) streamOptions.ita = sfcMatch[1];
        }
      }
    });

    // 3. Fallback to video tags
    if (!streamOptions.direct && !streamOptions.ita && !streamOptions.subita) {
      const vid = $('video source').attr('src') || $('video').attr('src');
      if (vid) {
        streamOptions.direct = vid;
        if (vid.includes('/subita/')) streamOptions.subita = vid;
        if (vid.includes('/ita/')) streamOptions.ita = vid;
      }
    }

    // Determine available audios
    const availableAudios = [];
    if (streamOptions.ita) availableAudios.push('ita');
    if (streamOptions.subita) availableAudios.push('subita');

    // Pick stream based on preference
    let selectedUrl = null;
    if (preferredAudio === 'ita' && streamOptions.ita) {
      selectedUrl = streamOptions.ita;
    } else if (preferredAudio === 'subita' && streamOptions.subita) {
      selectedUrl = streamOptions.subita;
    } else {
      selectedUrl = streamOptions.subita || streamOptions.ita || streamOptions.direct;
    }

    return {
      streamUrl: selectedUrl,
      options: streamOptions,
      availableAudios
    };
  }
}

module.exports = OnePiecePowerAnimeProvider;
