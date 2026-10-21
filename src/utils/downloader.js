const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const ora = require('ora');
const chalk = require('chalk');
const { downloadToFile } = require('./http');

function sanitizeFilename(name) {
  return (name || 'unnamed').replace(/[/\\?%*:|"<>]/g, '_').trim();
}

function getDefaultDownloadDir(type, title) {
  const home = os.homedir();
  const base = path.join(home, 'Downloads', type === 'anime' ? 'Anime' : 'Manga');
  const safeTitle = sanitizeFilename(title);
  return path.join(base, safeTitle);
}

/**
 * Download an entire manga chapter to folder
 * @param {Array<string>|object} pages 
 * @param {string} mangaTitle 
 * @param {string} chapterTitle 
 * @param {string} referer 
 * @param {string|null} customDir 
 */
async function downloadMangaChapter(pages, mangaTitle, chapterTitle, referer, customDir = null) {
  const baseDir = customDir ? path.resolve(customDir) : getDefaultDownloadDir('manga', mangaTitle);
  const chapterDir = path.join(baseDir, sanitizeFilename(chapterTitle));
  fs.mkdirSync(chapterDir, { recursive: true });

  let pageList = [];
  if (Array.isArray(pages)) {
    pageList = pages;
  } else if (typeof pages.discoverRemainingPages === 'function') {
    pageList = await pages.discoverRemainingPages();
  } else if (Array.isArray(pages.pages)) {
    pageList = pages.pages;
  } else if (pages.page1) {
    pageList = [pages.page1];
  }

  if (pageList.length === 0) {
    throw new Error('No pages found to download');
  }

  console.log(chalk.cyan(`\n📥 Downloading Manga: ${chalk.bold(mangaTitle)}`));
  console.log(chalk.dim(`   Chapter: ${chapterTitle}`));
  console.log(chalk.dim(`   Destination: ${chapterDir}\n`));

  const spinner = ora(`Downloading pages: 0/${pageList.length}`).start();
  const concurrency = 5;
  let downloadedCount = 0;

  for (let i = 0; i < pageList.length; i += concurrency) {
    const batch = pageList.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (pageUrl, idx) => {
        const pageNum = i + idx + 1;
        const filename = `page_${String(pageNum).padStart(3, '0')}.jpg`;
        const destPath = path.join(chapterDir, filename);
        if (!fs.existsSync(destPath)) {
          await downloadToFile(pageUrl, destPath, referer);
        }
        downloadedCount++;
        spinner.text = `Downloading pages: ${downloadedCount}/${pageList.length}`;
      })
    );
  }

  spinner.succeed(chalk.green(`Downloaded all ${pageList.length} pages to ${chapterDir}`));
  return chapterDir;
}

/**
 * Download an anime episode (.mp4) with curl progress bar
 * @param {string} streamUrl 
 * @param {string} animeTitle 
 * @param {string} episodeTitle 
 * @param {string} referer 
 * @param {string|null} customDir 
 */
async function downloadAnimeEpisode(streamUrl, animeTitle, episodeTitle, referer = 'https://onepiecepower.com/', customDir = null) {
  const baseDir = customDir ? path.resolve(customDir) : getDefaultDownloadDir('anime', animeTitle);
  fs.mkdirSync(baseDir, { recursive: true });

  const safeFileName = `${sanitizeFilename(episodeTitle || 'Episode')}.mp4`;
  const destPath = path.join(baseDir, safeFileName);

  console.log(chalk.cyan(`\n📥 Downloading Anime: ${chalk.bold(animeTitle)}`));
  console.log(chalk.dim(`   Episode: ${episodeTitle}`));
  console.log(chalk.dim(`   Destination: ${destPath}\n`));

  return new Promise((resolve, reject) => {
    const args = [
      '-#',
      '-L',
      '-C', '-', // Resume support
      '--connect-timeout', '10',
      '-e', referer,
      '-A', 'Mozilla/5.0 (X11; Linux x86_64)',
      '-o', destPath,
      streamUrl
    ];

    const child = spawn('curl', args, { stdio: 'inherit' });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(chalk.green(`\n✔ Download complete: ${destPath}`));
        resolve(destPath);
      } else {
        reject(new Error(`cURL download failed with exit code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

module.exports = {
  downloadMangaChapter,
  downloadAnimeEpisode,
  getDefaultDownloadDir
};
