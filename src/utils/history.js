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

function markChapterRead(mangaKey, mangaTitle, chapter) {
  if (!mangaKey || !chapter) return;
  const history = loadHistory();
  if (!history[mangaKey]) {
    history[mangaKey] = {
      title: mangaTitle || mangaKey,
      lastReadAt: new Date().toISOString(),
      readChapters: []
    };
  }

  history[mangaKey].lastReadAt = new Date().toISOString();
  history[mangaKey].title = mangaTitle || history[mangaKey].title;

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
  clearHistory,
  HISTORY_FILE
};
