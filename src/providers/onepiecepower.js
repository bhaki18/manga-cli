const cheerio = require('cheerio');
const BaseProvider = require('./base');
const { fetchHtml, checkUrlExists } = require('../utils/http');

class OnePiecePowerProvider extends BaseProvider {
  constructor() {
    super('One Piece Power', 'https://onepiecepower.com');
    this.mangaListCache = null;
  }

  /**
   * Fetches the entire manga catalog from /manga8/lista-manga2
   */
  async getCatalog() {
    if (this.mangaListCache) {
      return this.mangaListCache;
    }

    const html = await fetchHtml(`${this.baseUrl}/manga8/lista-manga2`);
    const $ = cheerio.load(html);
    const mangaList = [];

    // Always include One Piece as primary entry
    mangaList.push({
      title: 'One Piece (ITA)',
      url: `${this.baseUrl}/manga8/onepiece/volumi/lista-capitoli`,
      author: 'Eiichiro Oda',
      genres: 'Avventura, Shounen, Azione',
      altTitle: 'One Piece'
    });

    $('a').each((_, el) => {
      const href = $(el).attr('href');
      if (href && href.includes('lista-capitoli')) {
        let title = $(el).text().trim();
        const alt = $(el).attr('data-alternative-title') || '';
        const author = $(el).attr('data-author') || '';
        const genres = $(el).attr('data-genres') || '';

        if (!title) return;

        let fullUrl = href;
        if (!fullUrl.startsWith('http')) {
          fullUrl = fullUrl.startsWith('/') 
            ? `${this.baseUrl}${fullUrl}`
            : `${this.baseUrl}/manga8/${fullUrl}`;
        }

        mangaList.push({
          title,
          url: fullUrl,
          author,
          genres,
          altTitle: alt
        });
      }
    });

    this.mangaListCache = mangaList;
    return mangaList;
  }

  /**
   * Search manga by keyword
   */
  async search(query) {
    const catalog = await this.getCatalog();
    const cleanQuery = query.toLowerCase().trim();

    return catalog.filter(m => {
      const matchTitle = m.title.toLowerCase().includes(cleanQuery);
      const matchAlt = m.altTitle && m.altTitle.toLowerCase().includes(cleanQuery);
      const matchAuthor = m.author && m.author.toLowerCase().includes(cleanQuery);
      return matchTitle || matchAlt || matchAuthor;
    });
  }

  /**
   * Get all chapters from a manga's chapter list page
   */
  async getChapters(mangaUrl) {
    const html = await fetchHtml(mangaUrl);
    const $ = cheerio.load(html);
    const chapters = [];

    $('a[href*="reader/"]').each((_, el) => {
      let href = $(el).attr('href');
      const title = $(el).text().replace(/\s+/g, ' ').trim();
      
      let fullUrl = href;
      if (!fullUrl.startsWith('http')) {
        if (fullUrl.startsWith('/')) {
          fullUrl = `${this.baseUrl}${fullUrl}`;
        } else {
          // Relative to current page
          const cleanMangaUrl = mangaUrl.replace(/\/lista-capitoli.*$/, '');
          fullUrl = `${cleanMangaUrl}/${href.replace(/^\.\//, '')}`;
        }
      }

      // Extract chapter number
      const match = href.match(/reader\/([^/?#]+)/);
      const capId = match ? match[1] : '';

      if (capId && !chapters.some(c => c.url === fullUrl)) {
        chapters.push({
          id: capId,
          title: title || `Capitolo ${capId}`,
          url: fullUrl
        });
      }
    });

    return chapters;
  }

  /**
   * Extract or generate page image URLs for a specific chapter
   */
  async getChapterPages(chapterUrl) {
    const html = await fetchHtml(chapterUrl);
    const $ = cheerio.load(html);

    // Look for script content containing getPageLink, volText/vol, etc.
    let scriptContent = '';
    $('script').each((_, el) => {
      const text = $(el).html() || '';
      if (text.includes('getPageLink')) {
        scriptContent = text;
      }
    });

    // Detect baseUrl
    let cleanUrl = chapterUrl.split('?')[0];
    const baseUrl = cleanUrl.split('reader/')[0];
    const rawCap = cleanUrl.split('reader/')[1].split('/')[0].split('.php')[0];

    // Check if it's One Piece format: const vol = "099" + "/"; or "002" + "/";
    const opVolMatch = scriptContent.match(/const\s+vol\s*=\s*["']([^"']+)["']/);
    // Or standard format: const volText = "02";
    const stdVolMatch = scriptContent.match(/const\s+volText\s*=\s*["']([^"']+)["']/);

    let candidateGenerators = [];

    if (opVolMatch) {
      let rawVol = opVolMatch[1];
      if (!rawVol.endsWith('/')) rawVol += '/';

      let capWithSlash = rawCap.endsWith('/') ? rawCap : rawCap + '/';
      let capNum = capWithSlash.includes('-') 
        ? capWithSlash.replace(/^0/, '') 
        : (parseInt(capWithSlash, 10) < 10 ? capWithSlash.padStart(3, '0') : capWithSlash);

      candidateGenerators.push((pageNum) => {
        let p = pageNum < 10 ? '0' + pageNum : '' + pageNum;
        return `${baseUrl}volume${rawVol}${capNum}${p}.jpg`;
      });
    }

    if (stdVolMatch) {
      const vol = stdVolMatch[1];
      candidateGenerators.push((pageNum) => {
        let formattedCap = rawCap.includes('-') 
          ? rawCap.replace(/^0/, '') 
          : (parseFloat(rawCap) < 100 ? (rawCap.startsWith('0') ? rawCap.substring(1) : rawCap) : rawCap);
        let formattedPage = pageNum < 10 ? '0' + pageNum : '' + pageNum;
        return `${baseUrl}volume${vol}/capitolo${formattedCap}/${formattedPage}.jpg`;
      });
    }

    // Fallbacks
    candidateGenerators.push((pageNum) => {
      let p = pageNum < 10 ? '0' + pageNum : '' + pageNum;
      return `${baseUrl}volume${rawCap}/capitolo${rawCap}/${p}.jpg`;
    });
    candidateGenerators.push((pageNum) => {
      let p = pageNum < 10 ? '0' + pageNum : '' + pageNum;
      return `${baseUrl}capitolo${rawCap}/${p}.jpg`;
    });

    // Detect which generator actually works on page 1
    let workingGenerator = null;
    for (const gen of candidateGenerators) {
      const testPage1 = gen(1);
      const exists = await checkUrlExists(testPage1, chapterUrl);
      if (exists) {
        workingGenerator = gen;
        break;
      }
    }

    if (!workingGenerator) {
      workingGenerator = candidateGenerators[0];
    }

    // Fast batched parallel discovery (10 pages per batch)
    const pages = [];
    let current = 1;
    let keepChecking = true;
    const batchSize = 10;

    while (keepChecking && current <= 150) {
      const batchNumbers = Array.from({ length: batchSize }, (_, i) => current + i);
      const batchUrls = batchNumbers.map(n => workingGenerator(n));

      const batchResults = await Promise.all(
        batchUrls.map(url => checkUrlExists(url, chapterUrl))
      );

      for (let i = 0; i < batchResults.length; i++) {
        if (batchResults[i]) {
          pages.push(batchUrls[i]);
        } else {
          keepChecking = false;
          break;
        }
      }

      current += batchSize;
    }

    const title = $('title').text().replace(/\|.*$/, '').trim();

    return {
      title: title || `Chapter ${rawCap}`,
      chapterUrl,
      pages,
      getPageLinkFn: workingGenerator
    };
  }
}

module.exports = OnePiecePowerProvider;
