const cheerio = require('cheerio');
const BaseProvider = require('./base');
const { fetchHtml } = require('../utils/http');

class MangapillProvider extends BaseProvider {
  constructor() {
    super('Mangapill (Global Free English)', 'https://mangapill.com');
  }

  /**
   * Search manga on Mangapill
   */
  async search(query, lang = null) {
    // Mangapill is English-only, so skip if searching strictly for another non-English language
    if (lang && lang !== 'en' && lang !== 'all') {
      return [];
    }

    try {
      const cleanQuery = encodeURIComponent(query.trim());
      const html = await fetchHtml(`${this.baseUrl}/search?q=${cleanQuery}`);
      const $ = cheerio.load(html);
      const results = [];

      $('div.flex.flex-col.justify-end').each((_, el) => {
        const a = $(el).find('a').first();
        const href = a.attr('href');
        const title = $(el).find('.font-black').text().trim();
        const genres = $(el).find('.text-xs').map((_, b) => $(b).text().trim()).get().join(', ');

        if (href && title) {
          results.push({
            id: href,
            title,
            url: href.startsWith('http') ? href : `${this.baseUrl}${href}`,
            genres,
            source: 'mangapill',
            language: 'en'
          });
        }
      });

      return results;
    } catch (err) {
      return [];
    }
  }

  /**
   * Get all chapters for a manga
   */
  async getChapters(mangaUrl, lang = null) {
    const html = await fetchHtml(mangaUrl);
    const $ = cheerio.load(html);
    const chapters = [];

    $('a[href*="/chapters/"]').each((_, el) => {
      const href = $(el).attr('href');
      const title = $(el).text().trim();

      if (href) {
        chapters.push({
          id: href.split('/chapters/')[1],
          title: `[EN] ${title}`,
          url: href.startsWith('http') ? href : `${this.baseUrl}${href}`
        });
      }
    });

    // Invert order so Chapter 1 comes first
    return chapters.reverse();
  }

  /**
   * Get all page image URLs for a chapter
   */
  async getChapterPages(chapterUrl) {
    const html = await fetchHtml(chapterUrl);
    const $ = cheerio.load(html);
    const pages = [];

    $('img.js-page').each((_, el) => {
      const src = $(el).attr('data-src') || $(el).attr('src');
      if (src) {
        pages.push(src);
      }
    });

    const title = $('title').text().replace(/ - Mangapill$/, '').trim();

    return {
      title,
      chapterUrl,
      pages
    };
  }
}

module.exports = MangapillProvider;
