const BaseProvider = require('./base');
const { fetchJson } = require('../utils/http');

class MangaDexProvider extends BaseProvider {
  constructor() {
    super('MangaDex (Global Multi-Language)', 'https://api.mangadex.org');
  }

  /**
   * Search manga on MangaDex
   */
  async search(query, lang = null) {
    const cleanQuery = encodeURIComponent(query.trim());
    const url = `${this.baseUrl}/manga?title=${cleanQuery}&limit=25&includes[]=author&order[relevance]=desc`;
    const res = await fetchJson(url);

    if (!res || !res.data) return [];

    return res.data.map(item => {
      const attrs = item.attributes;
      const title = attrs.title.en || attrs.title['ja-ro'] || Object.values(attrs.title)[0] || 'Unknown Title';
      
      const authorRel = item.relationships ? item.relationships.find(r => r.type === 'author') : null;
      const author = authorRel && authorRel.attributes ? authorRel.attributes.name : '';
      
      const tags = (attrs.tags || []).slice(0, 3).map(t => t.attributes && t.attributes.name && t.attributes.name.en).filter(Boolean).join(', ');

      return {
        id: item.id,
        title,
        url: `${this.baseUrl}/manga/${item.id}`,
        author,
        genres: tags,
        source: 'mangadex',
        language: lang || 'en'
      };
    });
  }

  /**
   * Get all chapters in the specified language (or all languages if null)
   */
  async getChapters(mangaUrl, lang = null) {
    const mangaId = mangaUrl.split('/manga/')[1];
    let allChapters = [];
    let offset = 0;
    const limit = 100;

    const langParam = lang && lang !== 'all' ? `&translatedLanguage[]=${lang}` : '';

    while (offset < 300) {
      const url = `${this.baseUrl}/chapter?manga=${mangaId}${langParam}&order[chapter]=asc&limit=${limit}&offset=${offset}`;
      const res = await fetchJson(url);
      if (!res || !res.data || res.data.length === 0) break;

      res.data.forEach(ch => {
        const cAttr = ch.attributes;
        const chapNum = cAttr.chapter ? `Chapter ${cAttr.chapter}` : 'Chapter';
        const chapTitle = cAttr.title ? `: ${cAttr.title}` : '';
        const chapterLang = (cAttr.translatedLanguage || 'en').toUpperCase();
        const isExternal = Boolean(cAttr.externalUrl);

        allChapters.push({
          id: ch.id,
          title: `[${chapterLang}] ${chapNum}${chapTitle}${isExternal ? ' 🌐 (MangaPlus Official)' : ''}`,
          url: `${this.baseUrl}/chapter/${ch.id}`,
          number: cAttr.chapter || 0,
          externalUrl: cAttr.externalUrl || null,
          pagesCount: cAttr.pages || 0
        });
      });

      if (res.data.length < limit) break;
      offset += limit;
    }

    return allChapters;
  }

  /**
   * Get image pages for a specific chapter or fallback to external URL
   */
  async getChapterPages(chapterUrl) {
    const chapterId = chapterUrl.split('/chapter/')[1];

    // First fetch chapter details to check if it's an external publisher link
    const chData = await fetchJson(`${this.baseUrl}/chapter/${chapterId}`);
    if (chData && chData.data && chData.data.attributes && chData.data.attributes.externalUrl) {
      const extUrl = chData.data.attributes.externalUrl;
      return {
        title: `Chapter ${chapterId}`,
        chapterUrl,
        externalUrl: extUrl,
        pages: []
      };
    }

    const serverUrl = `${this.baseUrl}/at-home/server/${chapterId}`;
    const res = await fetchJson(serverUrl);

    if (!res || !res.baseUrl || !res.chapter) {
      throw new Error('Unable to retrieve chapter images from MangaDex (external release)');
    }

    const host = res.baseUrl;
    const hash = res.chapter.hash;
    const files = res.chapter.data || [];

    const pages = files.map(file => `${host}/data/${hash}/${file}`);

    return {
      title: `Chapter ${chapterId}`,
      chapterUrl,
      pages
    };
  }
}

module.exports = MangaDexProvider;
