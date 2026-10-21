const fs = require('fs');
const path = require('path');
const os = require('os');

const STATE_DIR = process.env.MANGA_CLI_STATE_DIR || 
  (process.env.XDG_STATE_HOME 
    ? path.join(process.env.XDG_STATE_HOME, 'manga-cli') 
    : path.join(os.homedir(), '.local', 'state', 'manga-cli'));

const HISTORY_FILE = path.join(STATE_DIR, 'history.json');

function ensureDir() {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
}

function loadHistory() {
  try {
    ensureDir();
    if (!fs.existsSync(HISTORY_FILE)) {
      return {};
    }
    const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveHistory(data) {
  try {
    ensureDir();
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    // Silent fail if state directory is not writable
  }
}

function extractNumber(str) {
  if (str === null || str === undefined) return null;
  const s = String(str).trim();
  if (s.startsWith('http://') || s.startsWith('https://')) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  const prefixMatch = s.match(/(?:ep(?:isodio)?|ch(?:apter)?|cap(?:itolo)?)\s*[:#.]?\s*(\d+(?:\.\d+)?)/i);
  if (prefixMatch) return parseFloat(prefixMatch[1]);
  const leadingMatch = s.match(/^(\d+(?:\.\d+)?)/);
  if (leadingMatch) return parseFloat(leadingMatch[1]);
  const generalMatch = s.match(/\b(\d+(?:\.\d+)?)\b/);
  if (generalMatch) return parseFloat(generalMatch[1]);
  return null;
}

function isChapterRead(mangaKey, chapterId, chapterUrl) {
  if (!mangaKey) return false;
  const history = loadHistory();
  const targetKey = findHistoryKey(mangaKey, 'manga') || mangaKey;
  const manga = history[targetKey] || history[mangaKey];
  if (!manga || !Array.isArray(manga.readChapters)) return false;

  const key1 = String(chapterId || '').trim();
  const key2 = String(chapterUrl || '').trim();
  const num1 = extractNumber(key1);

  return manga.readChapters.some(entry => {
    if (typeof entry === 'string') {
      const eNum = extractNumber(entry);
      return entry === key1 || entry === key2 || (num1 !== null && eNum !== null && num1 === eNum);
    }
    const entryNum = extractNumber(entry.id) || extractNumber(entry.title);
    return entry.id === key1 || entry.url === key2 || (num1 !== null && entryNum !== null && num1 === entryNum);
  });
}

function markChapterRead(mangaKey, mangaTitle, chapter, mangaMetadata = {}) {
  if (!mangaKey || !chapter) return;
  const history = loadHistory();
  if (!history[mangaKey]) {
    history[mangaKey] = {
      title: mangaTitle || mangaKey,
      url: mangaMetadata.url || mangaKey,
      source: mangaMetadata.source || null,
      language: mangaMetadata.language || null,
      lastReadAt: new Date().toISOString(),
      readChapters: []
    };
  }

  history[mangaKey].lastReadAt = new Date().toISOString();
  history[mangaKey].title = mangaTitle || history[mangaKey].title;
  if (mangaMetadata.url) history[mangaKey].url = mangaMetadata.url;
  if (mangaMetadata.source) history[mangaKey].source = mangaMetadata.source;
  if (mangaMetadata.language) history[mangaKey].language = mangaMetadata.language;

  const chapterId = String(chapter.id || '').trim();
  const chapterUrl = String(chapter.url || '').trim();
  const chapterTitle = String(chapter.title || '').trim();
  const chapterNum = extractNumber(chapter.number || chapterId);

  const alreadyRead = history[mangaKey].readChapters.some(entry => {
    if (typeof entry === 'string') {
      const eNum = extractNumber(entry);
      return entry === chapterId || entry === chapterUrl || (chapterNum !== null && eNum !== null && chapterNum === eNum);
    }
    const eNum = extractNumber(entry.id) || extractNumber(entry.title);
    return (chapterId && entry.id === chapterId) || (chapterUrl && entry.url === chapterUrl) || (chapterNum !== null && eNum !== null && chapterNum === eNum);
  });

  if (!alreadyRead) {
    history[mangaKey].readChapters.push({
      id: chapterId,
      url: chapterUrl,
      title: chapterTitle,
      readAt: new Date().toISOString()
    });
  }

  saveHistory(history);
}

function getLastReadManga() {
  const history = loadHistory();
  const entries = Object.entries(history).filter(([, val]) => val.mediaType !== 'anime');
  if (entries.length === 0) return null;

  // Sort descending by lastReadAt
  entries.sort((a, b) => {
    const timeA = new Date(a[1].lastReadAt || 0).getTime();
    const timeB = new Date(b[1].lastReadAt || 0).getTime();
    return timeB - timeA;
  });

  const [mangaKey, mangaData] = entries[0];
  if (!mangaData.readChapters || mangaData.readChapters.length === 0) {
    return null;
  }

  return {
    mangaKey,
    ...mangaData
  };
}


function getLastReadChapter(mangaKey) {
  if (!mangaKey) return null;
  const history = loadHistory();
  const targetKey = findHistoryKey(mangaKey, 'manga') || mangaKey;
  const manga = history[targetKey] || history[mangaKey];
  if (!manga || !Array.isArray(manga.readChapters) || manga.readChapters.length === 0) {
    return null;
  }
  const chapters = [...manga.readChapters];
  chapters.sort((a, b) => {
    const nA = extractNumber(a.id) || extractNumber(a.title) || 0;
    const nB = extractNumber(b.id) || extractNumber(b.title) || 0;
    return nA - nB;
  });
  return chapters[chapters.length - 1];
}

/**
 * Finds the chapter that comes immediately after the last read chapter in the chapter list.
 * If the last read chapter was the very last one (or no next chapter exists),
 * it returns the last read chapter itself.
 * If nothing was read or no match is found, returns null.
 */
function getNextChapterToRead(mangaKey, chapters) {
  if (!mangaKey || !Array.isArray(chapters) || chapters.length === 0) return null;
  const lastRead = getLastReadChapter(mangaKey);
  if (!lastRead) return null;

  const lastId = String(lastRead.id || '').trim();
  const lastUrl = String(lastRead.url || '').trim();
  const lastNum = extractNumber(lastId) || extractNumber(lastRead.title);

  // Find index of the last read chapter in the provided chapter list
  const lastIdx = chapters.findIndex(c => {
    const cId = String(c.id || '').trim();
    const cUrl = String(c.url || '').trim();
    const cNum = extractNumber(c.number || cId) || extractNumber(c.title);
    return (lastId && cId === lastId) || 
           (lastUrl && cUrl === lastUrl) || 
           (lastNum !== null && cNum !== null && cNum === lastNum);
  });

  if (lastIdx === -1) {
    // If exact chapter is not found by ID/URL, look at all read chapters and take the highest index
    let highestIdx = -1;
    for (let i = 0; i < chapters.length; i++) {
      if (isChapterRead(mangaKey, chapters[i].id, chapters[i].url)) {
        highestIdx = i;
      }
    }
    if (highestIdx !== -1) {
      if (highestIdx + 1 < chapters.length) {
        return { chapter: chapters[highestIdx + 1], isNext: true, prevChapter: chapters[highestIdx] };
      }
      return { chapter: chapters[highestIdx], isNext: false, prevChapter: chapters[highestIdx] };
    }
    return null;
  }

  // Next chapter exists?
  if (lastIdx + 1 < chapters.length) {
    return { chapter: chapters[lastIdx + 1], isNext: true, prevChapter: chapters[lastIdx] };
  }

  // Otherwise stay on the last read chapter
  return { chapter: chapters[lastIdx], isNext: false, prevChapter: chapters[lastIdx] };
}

// ==========================================
// ANIME HISTORY SUPPORT
// ==========================================

function getAnimeStorageKey(animeKey) {
  return String(animeKey || '').startsWith('anime:') ? animeKey : `anime:${animeKey}`;
}

function isEpisodeWatched(animeKey, episodeId, episodeUrl) {
  if (!animeKey) return false;
  const storageKey = findHistoryKey(animeKey, 'anime') || getAnimeStorageKey(animeKey);
  const history = loadHistory();
  const anime = history[storageKey] || history[animeKey];
  if (!anime || !Array.isArray(anime.watchedEpisodes)) return false;

  const key1 = String(episodeId || '').trim();
  const key2 = String(episodeUrl || '').trim();
  const num1 = extractNumber(key1);

  return anime.watchedEpisodes.some(entry => {
    if (typeof entry === 'string') {
      const eNum = extractNumber(entry);
      return entry === key1 || entry === key2 || (num1 !== null && eNum !== null && num1 === eNum);
    }
    const entryNum = extractNumber(entry.id) || extractNumber(entry.title);
    return entry.id === key1 || entry.url === key2 || (num1 !== null && entryNum !== null && num1 === entryNum);
  });
}

function markEpisodeWatched(animeKey, animeTitle, episode, animeMetadata = {}) {
  if (!animeKey || !episode) return;
  const storageKey = findHistoryKey(animeKey, 'anime') || getAnimeStorageKey(animeKey);
  const history = loadHistory();
  if (!history[storageKey]) {
    history[storageKey] = {
      mediaType: 'anime',
      title: animeTitle || animeKey,
      url: animeMetadata.url || animeKey,
      source: animeMetadata.source || 'onepiecepower',
      language: animeMetadata.language || 'it',
      lastWatchedAt: new Date().toISOString(),
      watchedEpisodes: []
    };
  }

  history[storageKey].mediaType = 'anime';
  history[storageKey].lastWatchedAt = new Date().toISOString();
  history[storageKey].title = animeTitle || history[storageKey].title;
  if (animeMetadata.url) history[storageKey].url = animeMetadata.url;
  if (animeMetadata.source) history[storageKey].source = animeMetadata.source;
  if (animeMetadata.language) history[storageKey].language = animeMetadata.language;

  const epId = String(episode.id || '').trim();
  const epUrl = String(episode.url || '').trim();
  const epTitle = String(episode.title || '').trim();
  const epNum = extractNumber(episode.number || epId) || extractNumber(epTitle);

  const alreadyWatched = history[storageKey].watchedEpisodes.some(entry => {
    if (typeof entry === 'string') {
      const eNum = extractNumber(entry);
      return entry === epId || entry === epUrl || (epNum !== null && eNum !== null && epNum === eNum);
    }
    const eNum = extractNumber(entry.id) || extractNumber(entry.title);
    return (epId && entry.id === epId) || (epUrl && entry.url === epUrl) || (epNum !== null && eNum !== null && epNum === eNum);
  });

  if (!alreadyWatched) {
    history[storageKey].watchedEpisodes.push({
      id: epId,
      url: epUrl,
      title: epTitle,
      watchedAt: new Date().toISOString()
    });
  }

  saveHistory(history);
}

function getLastWatchedAnime() {
  const history = loadHistory();
  const entries = Object.entries(history).filter(([key, val]) => key.startsWith('anime:') || val.mediaType === 'anime');
  if (entries.length === 0) return null;

  entries.sort((a, b) => {
    const timeA = new Date(a[1].lastWatchedAt || a[1].lastReadAt || 0).getTime();
    const timeB = new Date(b[1].lastWatchedAt || b[1].lastReadAt || 0).getTime();
    return timeB - timeA;
  });

  const [storageKey, animeData] = entries[0];
  if (!animeData.watchedEpisodes || animeData.watchedEpisodes.length === 0) {
    return null;
  }

  return {
    animeKey: storageKey.replace(/^anime:/, ''),
    storageKey,
    ...animeData
  };
}

function getLastWatchedEpisode(animeKey) {
  if (!animeKey) return null;
  const storageKey = findHistoryKey(animeKey, 'anime') || getAnimeStorageKey(animeKey);
  const history = loadHistory();
  const anime = history[storageKey] || history[animeKey];
  if (!anime || !Array.isArray(anime.watchedEpisodes) || anime.watchedEpisodes.length === 0) {
    return null;
  }
  const episodes = [...anime.watchedEpisodes];
  episodes.sort((a, b) => {
    const nA = extractNumber(a.id) || extractNumber(a.title) || 0;
    const nB = extractNumber(b.id) || extractNumber(b.title) || 0;
    return nA - nB;
  });
  return episodes[episodes.length - 1];
}

function getNextEpisodeToWatch(animeKey, episodes) {
  if (!animeKey || !Array.isArray(episodes) || episodes.length === 0) return null;
  const lastWatched = getLastWatchedEpisode(animeKey);
  if (!lastWatched) return null;

  const lastId = String(lastWatched.id || '').trim();
  const lastUrl = String(lastWatched.url || '').trim();
  const lastNum = extractNumber(lastId) || extractNumber(lastWatched.title);

  const lastIdx = episodes.findIndex(e => {
    const eId = String(e.id || '').trim();
    const eUrl = String(e.url || '').trim();
    const eNum = extractNumber(e.number || eId) || extractNumber(e.title);
    return (lastId && eId === lastId) || 
           (lastUrl && eUrl === lastUrl) || 
           (lastNum !== null && eNum !== null && eNum === lastNum);
  });

  if (lastIdx === -1) {
    let highestIdx = -1;
    for (let i = 0; i < episodes.length; i++) {
      if (isEpisodeWatched(animeKey, episodes[i].id, episodes[i].url)) {
        highestIdx = i;
      }
    }
    if (highestIdx !== -1) {
      if (highestIdx + 1 < episodes.length) {
        return { episode: episodes[highestIdx + 1], isNext: true, prevEpisode: episodes[highestIdx] };
      }
      return { episode: episodes[highestIdx], isNext: false, prevEpisode: episodes[highestIdx] };
    }
    return null;
  }

  if (lastIdx + 1 < episodes.length) {
    return { episode: episodes[lastIdx + 1], isNext: true, prevEpisode: episodes[lastIdx] };
  }

  return { episode: episodes[lastIdx], isNext: false, prevEpisode: episodes[lastIdx] };
}

function clearHistory(type = 'all') {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return;
    if (type === 'all') {
      fs.unlinkSync(HISTORY_FILE);
      return;
    }
    const history = loadHistory();
    const newHistory = {};
    for (const [key, val] of Object.entries(history)) {
      const isAnime = key.startsWith('anime:') || val.mediaType === 'anime';
      if (type === 'manga' && isAnime) {
        newHistory[key] = val;
      } else if (type === 'anime' && !isAnime) {
        newHistory[key] = val;
      }
    }
    saveHistory(newHistory);
  } catch {}
}

function getAllHistory() {
  const history = loadHistory();
  const list = [];

  for (const [key, val] of Object.entries(history)) {
    const isAnime = key.startsWith('anime:') || val.mediaType === 'anime';
    const cleanKey = key.replace(/^anime:/, '');

    if (isAnime) {
      const episodes = Array.isArray(val.watchedEpisodes) ? [...val.watchedEpisodes] : [];
      episodes.sort((a, b) => {
        const nA = extractNumber(a.id) || extractNumber(a.title) || 0;
        const nB = extractNumber(b.id) || extractNumber(b.title) || 0;
        return nA - nB;
      });
      const lastEp = episodes[episodes.length - 1];
      list.push({
        type: 'anime',
        key: cleanKey,
        storageKey: key,
        title: val.title || cleanKey,
        url: val.url || cleanKey,
        source: val.source || 'onepiecepower',
        language: val.language || 'it',
        audio: val.audio || 'both',
        count: episodes.length,
        lastAccessedAt: val.lastWatchedAt || val.lastReadAt || null,
        lastItem: lastEp ? (lastEp.title || `Episodio ${lastEp.id}`) : null
      });
    } else {
      const chapters = Array.isArray(val.readChapters) ? [...val.readChapters] : [];
      chapters.sort((a, b) => {
        const nA = extractNumber(a.id) || extractNumber(a.title) || 0;
        const nB = extractNumber(b.id) || extractNumber(b.title) || 0;
        return nA - nB;
      });
      const lastCh = chapters[chapters.length - 1];
      list.push({
        type: 'manga',
        key: cleanKey,
        storageKey: key,
        title: val.title || cleanKey,
        url: val.url || cleanKey,
        source: val.source || 'onepiecepower',
        language: val.language || 'it',
        count: chapters.length,
        lastAccessedAt: val.lastReadAt || null,
        lastItem: lastCh ? (lastCh.title || `Capitolo ${lastCh.id}`) : null
      });
    }
  }

  list.sort((a, b) => {
    const timeA = new Date(a.lastAccessedAt || 0).getTime();
    const timeB = new Date(b.lastAccessedAt || 0).getTime();
    return timeB - timeA;
  });

  return list;
}

function findHistoryKey(keyOrTitle, type = null) {
  const history = loadHistory();
  const search = String(keyOrTitle || '').toLowerCase().trim();
  if (!search) return null;

  for (const [key, val] of Object.entries(history)) {
    const isAnime = key.startsWith('anime:') || val.mediaType === 'anime';
    if (type === 'anime' && !isAnime) continue;
    if (type === 'manga' && isAnime) continue;

    const cleanKey = key.replace(/^anime:/, '').toLowerCase();
    const title = String(val.title || '').toLowerCase();
    const url = String(val.url || '').toLowerCase();

    if (cleanKey === search || key.toLowerCase() === search || title === search || url === search || title.includes(search)) {
      return key;
    }
  }
  return null;
}

function removeHistoryEntry(keyOrTitle, type = null) {
  const history = loadHistory();
  const targetKey = findHistoryKey(keyOrTitle, type);
  if (!targetKey || !history[targetKey]) {
    if (history[keyOrTitle]) {
      delete history[keyOrTitle];
      saveHistory(history);
      return true;
    }
    return false;
  }

  delete history[targetKey];
  saveHistory(history);
  return true;
}

function setMangaProgress(mangaKey, mangaTitle, chapterNum, mangaMetadata = {}) {
  const targetKey = findHistoryKey(mangaKey, 'manga') || mangaKey;
  const history = loadHistory();
  const num = extractNumber(chapterNum);
  if (num === null) return null;
  const safeNum = String(num);
  const title = mangaTitle || (history[targetKey] && history[targetKey].title) || mangaKey;

  if (!history[targetKey]) {
    history[targetKey] = {
      title,
      url: mangaMetadata.url || mangaKey,
      source: mangaMetadata.source || 'onepiecepower',
      language: mangaMetadata.language || 'it',
      lastReadAt: new Date().toISOString(),
      readChapters: []
    };
  }

  // Filter out any chapters with number > num so progress is reset to num
  const existingChapters = (history[targetKey].readChapters || []).filter(c => {
    const cNum = extractNumber(c.id) || extractNumber(c.title);
    if (cNum === null) return true;
    return cNum < num;
  });

  existingChapters.push({
    id: safeNum,
    url: mangaMetadata.url || (history[targetKey] && history[targetKey].url) || '',
    title: `Capitolo ${safeNum}`,
    readAt: new Date().toISOString()
  });

  // Sort ascending by chapter number
  existingChapters.sort((a, b) => {
    const nA = extractNumber(a.id) || extractNumber(a.title) || 0;
    const nB = extractNumber(b.id) || extractNumber(b.title) || 0;
    return nA - nB;
  });

  history[targetKey].readChapters = existingChapters;
  history[targetKey].lastReadAt = new Date().toISOString();
  saveHistory(history);
  return history[targetKey];
}

function setAnimeProgress(animeKey, animeTitle, episodeNum, animeMetadata = {}) {
  const storageKey = findHistoryKey(animeKey, 'anime') || getAnimeStorageKey(animeKey);
  const history = loadHistory();
  const num = extractNumber(episodeNum);
  if (num === null) return null;
  const safeNum = String(num);
  const title = animeTitle || (history[storageKey] && history[storageKey].title) || animeKey;

  if (!history[storageKey]) {
    history[storageKey] = {
      mediaType: 'anime',
      title,
      url: animeMetadata.url || animeKey,
      source: animeMetadata.source || 'onepiecepower',
      language: animeMetadata.language || 'it',
      audio: animeMetadata.audio || 'both',
      lastWatchedAt: new Date().toISOString(),
      watchedEpisodes: []
    };
  }

  // Filter out any episodes with number > num so progress is reset to num
  const existingEpisodes = (history[storageKey].watchedEpisodes || []).filter(e => {
    const eNum = extractNumber(e.id) || extractNumber(e.title);
    if (eNum === null) return true;
    return eNum < num;
  });

  existingEpisodes.push({
    id: safeNum,
    url: animeMetadata.url || (history[storageKey] && history[storageKey].url) || '',
    title: `Episodio ${safeNum}`,
    watchedAt: new Date().toISOString()
  });

  // Sort ascending by episode number
  existingEpisodes.sort((a, b) => {
    const nA = extractNumber(a.id) || extractNumber(a.title) || 0;
    const nB = extractNumber(b.id) || extractNumber(b.title) || 0;
    return nA - nB;
  });

  history[storageKey].watchedEpisodes = existingEpisodes;
  history[storageKey].lastWatchedAt = new Date().toISOString();
  saveHistory(history);
  return history[storageKey];
}

function unmarkChapter(mangaKey, chapterOrChapters) {
  const targetKey = findHistoryKey(mangaKey, 'manga') || mangaKey;
  const history = loadHistory();
  if (!history[targetKey] || !Array.isArray(history[targetKey].readChapters)) return 0;

  const toRemoveList = Array.isArray(chapterOrChapters) ? chapterOrChapters : [chapterOrChapters];
  if (toRemoveList.length === 0) return 0;

  const initialLen = history[targetKey].readChapters.length;

  history[targetKey].readChapters = history[targetKey].readChapters.filter(existing => {
    return !toRemoveList.some(item => {
      if (typeof item === 'object' && item !== null) {
        if (item.url && existing.url && item.url === existing.url) return true;
        if (item.id && existing.id && String(item.id).trim() === String(existing.id).trim()) return true;
        if (item.title && existing.title && item.title === existing.title) return true;
        const nR = extractNumber(item.number || item.id) || extractNumber(item.title);
        const nE = extractNumber(existing.id) || extractNumber(existing.title);
        if (nR !== null && nE !== null && nR === nE) return true;
        return false;
      }
      const s = String(item || '').trim();
      if (!s) return false;
      if (existing.url && existing.url === s) return true;
      if (existing.id && String(existing.id).trim() === s) return true;
      if (existing.title && existing.title === s) return true;
      const sNum = extractNumber(s);
      const eNum = extractNumber(existing.id) || extractNumber(existing.title);
      return sNum !== null && eNum !== null && sNum === eNum;
    });
  });

  const countRemoved = initialLen - history[targetKey].readChapters.length;
  if (countRemoved > 0) {
    history[targetKey].readChapters.sort((a, b) => {
      const nA = extractNumber(a.id) || extractNumber(a.title) || 0;
      const nB = extractNumber(b.id) || extractNumber(b.title) || 0;
      return nA - nB;
    });
    history[targetKey].lastReadAt = new Date().toISOString();
    saveHistory(history);
  }

  return countRemoved;
}

function unmarkEpisode(animeKey, episodeOrEpisodes) {
  const storageKey = findHistoryKey(animeKey, 'anime') || getAnimeStorageKey(animeKey);
  const history = loadHistory();
  if (!history[storageKey] || !Array.isArray(history[storageKey].watchedEpisodes)) return 0;

  const toRemoveList = Array.isArray(episodeOrEpisodes) ? episodeOrEpisodes : [episodeOrEpisodes];
  if (toRemoveList.length === 0) return 0;

  const initialLen = history[storageKey].watchedEpisodes.length;

  history[storageKey].watchedEpisodes = history[storageKey].watchedEpisodes.filter(existing => {
    return !toRemoveList.some(item => {
      if (typeof item === 'object' && item !== null) {
        if (item.url && existing.url && item.url === existing.url) return true;
        if (item.id && existing.id && String(item.id).trim() === String(existing.id).trim()) return true;
        if (item.title && existing.title && item.title === existing.title) return true;
        const nR = extractNumber(item.id) || extractNumber(item.title);
        const nE = extractNumber(existing.id) || extractNumber(existing.title);
        if (nR !== null && nE !== null && nR === nE) return true;
        return false;
      }
      const s = String(item || '').trim();
      if (!s) return false;
      if (existing.url && existing.url === s) return true;
      if (existing.id && String(existing.id).trim() === s) return true;
      if (existing.title && existing.title === s) return true;
      const sNum = extractNumber(s);
      const eNum = extractNumber(existing.id) || extractNumber(existing.title);
      return sNum !== null && eNum !== null && sNum === eNum;
    });
  });

  const countRemoved = initialLen - history[storageKey].watchedEpisodes.length;
  if (countRemoved > 0) {
    history[storageKey].watchedEpisodes.sort((a, b) => {
      const nA = extractNumber(a.id) || extractNumber(a.title) || 0;
      const nB = extractNumber(b.id) || extractNumber(b.title) || 0;
      return nA - nB;
    });
    history[storageKey].lastWatchedAt = new Date().toISOString();
    saveHistory(history);
  }

  return countRemoved;
}

function markAllMangaChaptersUpTo(mangaKey, mangaTitle, chapters, targetNum, mangaMetadata = {}) {
  const targetKey = findHistoryKey(mangaKey, 'manga') || mangaKey;
  const history = loadHistory();
  const num = extractNumber(targetNum);
  if (num === null) return 0;
  const title = mangaTitle || (history[targetKey] && history[targetKey].title) || mangaKey;

  if (!history[targetKey]) {
    history[targetKey] = {
      title,
      url: mangaMetadata.url || mangaKey,
      source: mangaMetadata.source || 'onepiecepower',
      language: mangaMetadata.language || 'it',
      lastReadAt: new Date().toISOString(),
      readChapters: []
    };
  }

  // Keep existing chapters <= num
  const existing = (history[targetKey].readChapters || []).filter(c => {
    const cNum = extractNumber(c.id) || extractNumber(c.title);
    return cNum === null || cNum <= num;
  });

  let countAdded = 0;
  chapters.forEach((c, idx) => {
    const cNum = extractNumber(c.number || c.id || (idx + 1));
    if (cNum !== null && cNum <= num) {
      const already = existing.some(ec => {
        const ecNum = extractNumber(ec.id) || extractNumber(ec.title);
        return (ecNum !== null && ecNum === cNum) || ec.url === c.url;
      });
      if (!already) {
        existing.push({
          id: String(c.id || cNum),
          url: c.url,
          title: c.title,
          readAt: new Date().toISOString()
        });
        countAdded++;
      }
    }
  });

  existing.sort((a, b) => {
    const nA = extractNumber(a.id) || extractNumber(a.title) || 0;
    const nB = extractNumber(b.id) || extractNumber(b.title) || 0;
    return nA - nB;
  });

  history[targetKey].readChapters = existing;
  history[targetKey].lastReadAt = new Date().toISOString();
  saveHistory(history);
  return countAdded;
}

function markAllAnimeEpisodesUpTo(animeKey, animeTitle, episodes, targetNum, animeMetadata = {}) {
  const storageKey = findHistoryKey(animeKey, 'anime') || getAnimeStorageKey(animeKey);
  const history = loadHistory();
  const num = extractNumber(targetNum);
  if (num === null) return 0;
  const title = animeTitle || (history[storageKey] && history[storageKey].title) || animeKey;

  if (!history[storageKey]) {
    history[storageKey] = {
      mediaType: 'anime',
      title,
      url: animeMetadata.url || animeKey,
      source: animeMetadata.source || 'onepiecepower',
      language: animeMetadata.language || 'it',
      audio: animeMetadata.audio || 'both',
      lastWatchedAt: new Date().toISOString(),
      watchedEpisodes: []
    };
  }

  // Keep existing episodes <= num
  const existing = (history[storageKey].watchedEpisodes || []).filter(e => {
    const eNum = extractNumber(e.id) || extractNumber(e.title);
    return eNum === null || eNum <= num;
  });

  let countAdded = 0;
  episodes.forEach((e, idx) => {
    const eNum = extractNumber(e.id || (idx + 1));
    if (eNum !== null && eNum <= num) {
      const already = existing.some(ee => {
        const eeNum = extractNumber(ee.id) || extractNumber(ee.title);
        return (eeNum !== null && eeNum === eNum) || ee.url === e.url;
      });
      if (!already) {
        existing.push({
          id: String(e.id || eNum),
          url: e.url,
          title: e.title,
          watchedAt: new Date().toISOString()
        });
        countAdded++;
      }
    }
  });

  existing.sort((a, b) => {
    const nA = extractNumber(a.id) || extractNumber(a.title) || 0;
    const nB = extractNumber(b.id) || extractNumber(b.title) || 0;
    return nA - nB;
  });

  history[storageKey].watchedEpisodes = existing;
  history[storageKey].lastWatchedAt = new Date().toISOString();
  saveHistory(history);
  return countAdded;
}

module.exports = {
  isChapterRead,
  markChapterRead,
  loadHistory,
  getLastReadManga,
  getLastReadChapter,
  getNextChapterToRead,
  isEpisodeWatched,
  markEpisodeWatched,
  getLastWatchedAnime,
  getLastWatchedEpisode,
  getNextEpisodeToWatch,
  clearHistory,
  getAllHistory,
  findHistoryKey,
  removeHistoryEntry,
  setMangaProgress,
  setAnimeProgress,
  unmarkChapter,
  unmarkEpisode,
  markAllMangaChaptersUpTo,
  markAllAnimeEpisodesUpTo,
  extractNumber,
  HISTORY_FILE
};



