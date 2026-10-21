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

function isChapterRead(mangaKey, chapterId, chapterUrl) {
  if (!mangaKey) return false;
  const history = loadHistory();
  const manga = history[mangaKey];
  if (!manga || !Array.isArray(manga.readChapters)) return false;

  const key1 = String(chapterId || '').trim();
  const key2 = String(chapterUrl || '').trim();

  return manga.readChapters.some(entry => {
    if (typeof entry === 'string') {
      return entry === key1 || entry === key2;
    }
    return entry.id === key1 || entry.url === key2;
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

  const alreadyRead = history[mangaKey].readChapters.some(entry => {
    if (typeof entry === 'string') {
      return entry === chapterId || entry === chapterUrl;
    }
    return (chapterId && entry.id === chapterId) || (chapterUrl && entry.url === chapterUrl);
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
  const manga = history[mangaKey];
  if (!manga || !Array.isArray(manga.readChapters) || manga.readChapters.length === 0) {
    return null;
  }
  return manga.readChapters[manga.readChapters.length - 1];
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

  // Find index of the last read chapter in the provided chapter list
  const lastIdx = chapters.findIndex(c => {
    const cId = String(c.id || '').trim();
    const cUrl = String(c.url || '').trim();
    return (lastId && cId === lastId) || (lastUrl && cUrl === lastUrl);
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
  const storageKey = getAnimeStorageKey(animeKey);
  const history = loadHistory();
  const anime = history[storageKey];
  if (!anime || !Array.isArray(anime.watchedEpisodes)) return false;

  const key1 = String(episodeId || '').trim();
  const key2 = String(episodeUrl || '').trim();

  return anime.watchedEpisodes.some(entry => {
    if (typeof entry === 'string') {
      return entry === key1 || entry === key2;
    }
    return (key1 && entry.id === key1) || (key2 && entry.url === key2);
  });
}

function markEpisodeWatched(animeKey, animeTitle, episode, animeMetadata = {}) {
  if (!animeKey || !episode) return;
  const storageKey = getAnimeStorageKey(animeKey);
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

  const alreadyWatched = history[storageKey].watchedEpisodes.some(entry => {
    if (typeof entry === 'string') {
      return entry === epId || entry === epUrl;
    }
    return (epId && entry.id === epId) || (epUrl && entry.url === epUrl);
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
  const storageKey = getAnimeStorageKey(animeKey);
  const history = loadHistory();
  const anime = history[storageKey];
  if (!anime || !Array.isArray(anime.watchedEpisodes) || anime.watchedEpisodes.length === 0) {
    return null;
  }
  return anime.watchedEpisodes[anime.watchedEpisodes.length - 1];
}

function getNextEpisodeToWatch(animeKey, episodes) {
  if (!animeKey || !Array.isArray(episodes) || episodes.length === 0) return null;
  const lastWatched = getLastWatchedEpisode(animeKey);
  if (!lastWatched) return null;

  const lastId = String(lastWatched.id || '').trim();
  const lastUrl = String(lastWatched.url || '').trim();

  const lastIdx = episodes.findIndex(e => {
    const eId = String(e.id || '').trim();
    const eUrl = String(e.url || '').trim();
    return (lastId && eId === lastId) || (lastUrl && eUrl === lastUrl);
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
  HISTORY_FILE
};



