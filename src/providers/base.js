/**
 * Base Manga Provider class
 */
class BaseProvider {
  constructor(name, baseUrl) {
    this.name = name;
    this.baseUrl = baseUrl;
  }

  /**
   * Search manga by title or keyword
   * @param {string} query
   * @returns {Promise<Array<{ title: string, url: string, info?: string }>>}
   */
  async search(query) {
    throw new Error('search() must be implemented');
  }

  /**
   * Get all chapters of a manga
   * @param {string} mangaUrl
   * @returns {Promise<Array<{ id: string, title: string, url: string, number: number|string }>>}
   */
  async getChapters(mangaUrl) {
    throw new Error('getChapters() must be implemented');
  }

  /**
   * Extract or generate page image URLs for a specific chapter
   * @param {string} chapterUrl
   * @returns {Promise<{ mangaTitle: string, chapterTitle: string, pages: Array<string> }>}
   */
  async getChapterPages(chapterUrl) {
    throw new Error('getChapterPages() must be implemented');
  }
}

module.exports = BaseProvider;
