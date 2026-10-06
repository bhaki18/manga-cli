const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { downloadToFile } = require('../utils/http');

class MangaViewer {
  constructor() {
    // RAM disk path on Linux (/dev/shm) or system temp fallback
    const ramDisk = '/dev/shm';
    if (fs.existsSync(ramDisk)) {
      this.baseTempDir = path.join(ramDisk, 'manga-cli');
    } else {
      this.baseTempDir = path.join(require('os').tmpdir(), 'manga-cli');
    }

    this.activeDir = null;

    // Clean up on exit or interrupt
    process.on('SIGINT', () => {
      this.cleanUp();
      process.exit();
    });
    process.on('exit', () => {
      this.cleanUp();
    });
  }

  /**
   * Prepares a fresh temporary folder in RAM for the selected chapter
   */
  prepareChapterDir(mangaTitle, chapterId) {
    this.cleanUp(); // Clean previous if any
    const safeName = (mangaTitle + '_' + chapterId).replace(/[^a-zA-Z0-9_-]/g, '_');
    this.activeDir = path.join(this.baseTempDir, safeName);
    fs.mkdirSync(this.activeDir, { recursive: true });
    return this.activeDir;
  }

  /**
   * Cleans up the active RAM directory
   */
  cleanUp() {
    if (this.activeDir && fs.existsSync(this.activeDir)) {
      try {
        fs.rmSync(this.activeDir, { recursive: true, force: true });
      } catch (err) {
        // Silently ignore cleanup errors
      }
      this.activeDir = null;
    }
  }

  /**
   * Download all page URLs in parallel into the RAM directory
   */
  async downloadPages(pages, referer, onProgress) {
    if (!this.activeDir) throw new Error('Directory in RAM not prepared');

    const downloadedFiles = [];
    const concurrency = 4;
    let completed = 0;

    for (let i = 0; i < pages.length; i += concurrency) {
      const chunk = pages.slice(i, i + concurrency);
      await Promise.all(
        chunk.map(async (url, idx) => {
          const pageIndex = i + idx + 1;
          const fileName = `page_${String(pageIndex).padStart(3, '0')}.jpg`;
          const filePath = path.join(this.activeDir, fileName);
          try {
            await downloadToFile(url, filePath, referer);
            downloadedFiles.push(filePath);
          } catch (e) {
            // failed page
          } finally {
            completed++;
            if (onProgress) {
              onProgress(completed, pages.length);
            }
          }
        })
      );
    }

    return downloadedFiles.sort();
  }

  /**
   * Launches the best available image viewer
   */
  async openViewer(files) {
    if (files.length === 0) {
      throw new Error('Nessuna pagina trovata o scaricata.');
    }

    // Detect available viewers: mpv, feh, sxiv, imv, zathura
    const viewers = [
      { cmd: 'feh', args: ['-F', '--scale-down', ...files] },
      { cmd: 'sxiv', args: ['-f', '-b', ...files] },
      { cmd: 'imv', args: files },
      { cmd: 'mpv', args: ['--image-display-duration=inf', '--reset-on-next-file=pause', ...files] },
      { cmd: 'xdg-open', args: [files[0]] }
    ];

    let chosenViewer = null;
    for (const v of viewers) {
      const exists = await new Promise((res) => {
        const p = spawn('which', [v.cmd]);
        p.on('close', (code) => res(code === 0));
      });
      if (exists) {
        chosenViewer = v;
        break;
      }
    }

    if (!chosenViewer) {
      throw new Error('Nessun visualizzatore immagini supportato trovato (installa mpv, feh, sxiv, o imv).');
    }

    return new Promise((resolve) => {
      const proc = spawn(chosenViewer.cmd, chosenViewer.args, {
        stdio: 'inherit'
      });

      proc.on('close', () => {
        this.cleanUp();
        resolve();
      });
    });
  }
}

module.exports = MangaViewer;
