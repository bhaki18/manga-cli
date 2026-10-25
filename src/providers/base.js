const cheerio = require('cheerio');
const { fetchHtml, fetchJson, checkUrlExists, downloadToFile } = require('../utils/http');

/**
 * Base Provider class
 */
class BaseProvider {
  constructor(name, baseUrl, options = {}) {
    this.name = name;
    this.baseUrl = baseUrl;
    this.id = options.id || (name ? name.toLowerCase().replace(/[^a-z0-9_-]/g, '-') : 'custom-provider');
    this.type = options.type || 'manga'; // 'manga' | 'anime'
    this.languages = options.languages || ['all'];
    this.isBuiltIn = options.isBuiltIn || false;
  }

  // Built-in HTTP and scraping helpers available to all providers
  async fetchHtml(url, referer = null) {
    return fetchHtml(url, referer || this.baseUrl);
  }

  async fetchJson(url, referer = null) {
    return fetchJson(url, referer || this.baseUrl);
  }

  async checkUrlExists(url, referer = null) {
    return checkUrlExists(url, referer || this.baseUrl);
  }

  async downloadToFile(url, destPath, referer = null) {
    return downloadToFile(url, destPath, referer || this.baseUrl);
  }

  get cheerio() {
    return cheerio;
  }

  /**
   * Get catalog of available titles
   * @param {string|null} lang
   * @returns {Promise<Array<{ id: string, title: string, url: string, source: string, language?: string }>>}
   */
  async getCatalog(lang = null) {
    if (typeof this.search === 'function') {
      try {
        return await this.search('', lang);
      } catch (err) {
        return [];
      }
    }
    return [];
  }

  /**
   * Search titles by keyword and optional language filter
   * @param {string} query
   * @param {string|null} lang
   * @returns {Promise<Array<{ id: string, title: string, url: string, source: string, language?: string }>>}
   */
  async search(query, lang = null) {
    throw new Error('search() must be implemented');
  }
}

/**
 * Base Manga Provider class
 */
class BaseMangaProvider extends BaseProvider {
  constructor(name, baseUrl, options = {}) {
    super(name, baseUrl, { ...options, type: 'manga' });
    this.type = 'manga';
  }

  /**
   * Get all chapters of a manga
   * @param {string} mangaUrl
   * @param {string|null} lang
   * @returns {Promise<Array<{ id: string, title: string, url: string, number?: number|string }>>}
   */
  async getChapters(mangaUrl, lang = null) {
    throw new Error('getChapters() must be implemented');
  }

  /**
   * Extract or generate page image URLs for a specific chapter
   * @param {string} chapterUrl
   * @returns {Promise<{ title?: string, chapterTitle?: string, pages: Array<string>, externalUrl?: string }>}
   */
  async getChapterPages(chapterUrl) {
    throw new Error('getChapterPages() must be implemented');
  }
}

/**
 * Base Anime Provider class
 */
class BaseAnimeProvider extends BaseProvider {
  constructor(name, baseUrl, options = {}) {
    super(name, baseUrl, { ...options, type: 'anime' });
    this.type = 'anime';
  }

  /**
   * Get all episodes of an anime series
   * @param {string} animeUrl
   * @returns {Promise<Array<{ id: string, title: string, url: string }>>}
   */
  async getEpisodes(animeUrl) {
    throw new Error('getEpisodes() must be implemented');
  }

  /**
   * Extract or resolve streaming video URL for an episode
   * @param {string} episodeUrl
   * @param {'subita'|'ita'|string} preferredAudio
   * @returns {Promise<{ streamUrl: string|null, options?: object, availableAudios?: string[] }>}
   */
  async getEpisodeStream(episodeUrl, preferredAudio = 'subita') {
    throw new Error('getEpisodeStream() must be implemented');
  }
}

BaseProvider.BaseProvider = BaseProvider;
BaseProvider.BaseMangaProvider = BaseMangaProvider;
BaseProvider.BaseAnimeProvider = BaseAnimeProvider;
BaseProvider.cheerio = cheerio;
BaseProvider.http = { fetchHtml, fetchJson, checkUrlExists, downloadToFile };

module.exports = BaseProvider;
