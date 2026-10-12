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
  const entries = Object.entries(history);
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

function clearHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      fs.unlinkSync(HISTORY_FILE);
    }
  } catch {}
}

module.exports = {
  isChapterRead,
  markChapterRead,
  loadHistory,
  getLastReadManga,
  getLastReadChapter,
  getNextChapterToRead,
  clearHistory,
  HISTORY_FILE
};


