const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

/**
 * Community Anime Provider for AnimeWorld (animeworld.ac)
 * High quality Italian anime streaming (SUB ITA & ITA) with direct MP4 extraction
 */
module.exports = ({ BaseAnimeProvider, cheerio, fetchHtml }) => {
  return class AnimeWorldProvider extends BaseAnimeProvider {
    constructor() {
      super('AnimeWorld', 'https://www.animeworld.ac', {
        id: 'animeworld',
        languages: ['it'],
      });
      this.cookieFile = path.join(os.tmpdir(), 'manga-cli-animeworld-cookie.txt');
    }

    /**
     * 1. Cerca anime nel catalogo AnimeWorld
     * @param {string} query Titolo dell'anime
     * @param {string|null} lang
     * @returns {Promise<Array<{ id: string, title: string, url: string, audio: 'ita'|'subita', language: string }>>}
     */
    async search(query, lang = null) {
      try {
        const cleanQuery = encodeURIComponent(query.trim());
        const searchUrl = `${this.baseUrl}/filter?keyword=${cleanQuery}`;
        const html = await this.fetchHtml(searchUrl);
        const $ = this.cheerio.load(html);
        const results = [];

        $('.film-list .item').each((_, el) => {
          const a = $(el).find('a.name');
          const href = a.attr('href');
          const title = a.text().trim();

          if (href && title) {
            const isIta = title.toLowerCase().includes('(ita)');
            const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;

            results.push({
              id: href,
              title,
              url: fullUrl,
              audio: isIta ? 'ita' : 'subita',
              language: 'it',
              source: 'animeworld'
            });
          }
        });

        return results;
      } catch (err) {
        return [];
      }
    }

    /**
     * Recupera il catalogo AnimeWorld (dalla lista alfabetica /az-list)
     */
    async getCatalog() {
      try {
        const html = await this.fetchHtml(`${this.baseUrl}/az-list`);
        const $ = this.cheerio.load(html);
        const results = [];

        $('.film-list .item, .items .item, .content .item, .inner').each((_, el) => {
          const a = $(el).find('a.name');
          const href = a.attr('href');
          const title = a.text().trim();

          if (href && title) {
            const isIta = title.toLowerCase().includes('(ita)');
            const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;

            results.push({
              id: href,
              title,
              url: fullUrl,
              audio: isIta ? 'ita' : 'subita',
              language: 'it',
              source: 'animeworld'
            });
          }
        });

        return results;
      } catch (err) {
        return [];
      }
    }

    /**
     * 2. Estrae tutti gli episodi della serie
     * @param {string} animeUrl
     * @returns {Promise<Array<{ id: string, title: string, url: string, dataId?: string }>>}
     */
    async getEpisodes(animeUrl) {
      try {
        const html = await this.fetchHtml(animeUrl);
        const $ = this.cheerio.load(html);
        const episodes = [];

        $('.range .episode a').each((_, el) => {
          const href = $(el).attr('href');
          const epNum = $(el).attr('data-episode-num') || $(el).attr('data-num') || $(el).text().trim();
          const dataId = $(el).attr('data-id');

          if (href && epNum) {
            episodes.push({
              id: epNum,
              title: `Episodio ${epNum}`,
              url: href.startsWith('http') ? href : `${this.baseUrl}${href}`,
              dataId
            });
          }
        });

        return episodes;
      } catch (err) {
        return [];
      }
    }

    /**
     * 3. Risolve lo stream video MP4 diretto dell'episodio
     * @param {string} episodeUrl
     * @param {'subita'|'ita'|string} preferredAudio
     * @returns {Promise<{ streamUrl: string|null, availableAudios: string[] }>}
     */
    async getEpisodeStream(episodeUrl, preferredAudio = 'subita') {
      return new Promise((resolve) => {
        // Step A: recupera la pagina dell'episodio salvando i cookie di sessione
        execFile('curl', [
          '-s', '-L',
          '-c', this.cookieFile,
          '-b', this.cookieFile,
          '-A', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          episodeUrl
        ], { maxBuffer: 10 * 1024 * 1024 }, (err, html) => {
          if (err || !html) {
            return resolve({ streamUrl: null, availableAudios: ['subita'] });
          }

          // Estrai il CSRF token e il data-id dell'episodio
          const csrfMatch = html.match(/content="([^"]+)"[^>]+name="csrf-token"/i) || 
                            html.match(/name="csrf-token"[^>]+content="([^"]+)"/i);
          const csrf = csrfMatch ? csrfMatch[1] : '';

          const idMatch = html.match(/data-id="([a-zA-Z0-9_-]+)"[^>]+class="[^"]*player-box/i) || 
                          html.match(/class="[^"]*player-box[^"]*"[^>]+data-id="([a-zA-Z0-9_-]+)"/i);
          const dataId = idMatch ? idMatch[1] : episodeUrl.split('/').pop();

          if (!dataId) {
            return resolve({ streamUrl: null, availableAudios: ['subita'] });
          }

          // Step B: chiama l'API interna di AnimeWorld per ottenere l'URL diretto del video
          execFile('curl', [
            '-s', '-L',
            '-b', this.cookieFile,
            '-A', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            '-H', `csrf-token: ${csrf}`,
            '-H', 'x-requested-with: XMLHttpRequest',
            '-H', `referer: ${episodeUrl}`,
            `${this.baseUrl}/api/episode/info?id=${dataId}`
          ], (err2, jsonText) => {
            if (err2 || !jsonText) {
              return resolve({ streamUrl: null, availableAudios: ['subita'] });
            }

            try {
              const data = JSON.parse(jsonText);
              const streamUrl = data.grabber || data.target || null;
              resolve({
                streamUrl,
                availableAudios: ['subita']
              });
            } catch {
              resolve({ streamUrl: null, availableAudios: ['subita'] });
            }
          });
        });
      });
    }
  };
};
