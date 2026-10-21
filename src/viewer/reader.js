const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { downloadToFile } = require('../utils/http');

class MangaViewer {
  constructor() {
    const ramDisk = '/dev/shm';
    if (fs.existsSync(ramDisk)) {
      this.baseTempDir = path.join(ramDisk, 'manga-cli');
    } else {
      this.baseTempDir = path.join(require('os').tmpdir(), 'manga-cli');
    }

    this.activeDir = null;
    this.mpvSocket = null;
    this.ipcClient = null;

    process.on('SIGINT', () => {
      this.cleanUp();
      process.exit();
    });
    process.on('exit', () => {
      this.cleanUp();
    });
  }

  prepareChapterDir(mangaTitle, chapterId) {
    this.cleanUp();
    const safeName = (mangaTitle + '_' + chapterId).replace(/[^a-zA-Z0-9_-]/g, '_');
    this.activeDir = path.join(this.baseTempDir, safeName);
    fs.mkdirSync(this.activeDir, { recursive: true });
    this.mpvSocket = path.join(this.activeDir, 'mpv.sock');
    return this.activeDir;
  }

  cleanUp() {
    if (this.ipcClient) {
      try { this.ipcClient.destroy(); } catch (e) {}
      this.ipcClient = null;
    }
    if (this.activeDir && fs.existsSync(this.activeDir)) {
      try {
        fs.rmSync(this.activeDir, { recursive: true, force: true });
      } catch (err) {}
      this.activeDir = null;
    }
  }

  async downloadSinglePage(url, pageNumber, referer) {
    if (!this.activeDir) throw new Error('RAM directory not initialized');
    const fileName = `page_${String(pageNumber).padStart(3, '0')}.jpg`;
    const filePath = path.join(this.activeDir, fileName);
    if (fs.existsSync(filePath)) return filePath;
    await downloadToFile(url, filePath, referer);
    return filePath;
  }

  /**
   * Detects the best available viewer on system
   */
  async detectViewer(preferredViewer = null) {
    if (preferredViewer) {
      const exists = await new Promise((res) => {
        const p = spawn('which', [preferredViewer]);
        p.on('close', (code) => res(code === 0));
      });
      if (exists) return preferredViewer;
    }

    const candidateCommands = ['feh', 'sxiv', 'imv', 'mpv', 'loupe'];
    for (const cmd of candidateCommands) {
      const exists = await new Promise((res) => {
        const p = spawn('which', [cmd]);
        p.on('close', (code) => res(code === 0));
      });
      if (exists) return cmd;
    }
    return 'xdg-open';
  }

  /**
   * Open reader instantly on page 1, streaming and appending pages in real time
   */
  async streamAndRead(pages, referer, onProgress, options = {}) {
    // Resolve page1 immediately
    let page1Url = Array.isArray(pages) ? pages[0] : (pages.page1 || (pages.pages && pages.pages[0]));
    if (!page1Url) throw new Error('No pages found for this chapter');

    // 1. Download PAGE 1 first so reader opens in < 1s
    const page1Path = await this.downloadSinglePage(page1Url, 1, referer);
    if (onProgress) onProgress(1, Array.isArray(pages) ? pages.length : 1, false);

    const viewerType = await this.detectViewer(options.viewer);
    let viewerProc;

    if (viewerType === 'mpv') {
      const mpvArgs = [
        '--input-ipc-server=' + this.mpvSocket,
        '--image-display-duration=inf',
        '--reset-on-next-file=pause'
      ];
      if (options.fullscreen) {
        mpvArgs.push('--fs');
      }
      mpvArgs.push(page1Path);

      viewerProc = spawn('mpv', mpvArgs, { stdio: 'inherit' });

      const connectIpc = () => new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (fs.existsSync(this.mpvSocket)) {
            const client = net.connect(this.mpvSocket, () => {
              clearInterval(checkInterval);
              resolve(client);
            });
            client.on('error', () => {});
          }
        }, 30);
      });

      const ipc = await connectIpc();
      this.ipcClient = ipc;

      const appendToMpv = (filePath) => {
        if (ipc && !ipc.destroyed) {
          try {
            const cmd = JSON.stringify({ command: ['loadfile', filePath, 'append'] }) + '\n';
            ipc.write(cmd);
          } catch (e) {}
        }
      };

      // Background parallel downloads injected into MPV playlist
      (async () => {
        let fullPagesList = [];
        if (Array.isArray(pages)) {
          fullPagesList = pages;
        } else if (typeof pages.discoverRemainingPages === 'function') {
          fullPagesList = await pages.discoverRemainingPages();
        } else if (Array.isArray(pages.pages)) {
          fullPagesList = pages.pages;
        }

        const total = fullPagesList.length;
        const concurrency = 10;
        let completed = 1;

        for (let i = 1; i < total; i += concurrency) {
          if (!this.activeDir) break;
          const chunk = fullPagesList.slice(i, i + concurrency);
          const downloadedChunk = await Promise.all(
            chunk.map(async (url, idx) => {
              const pageIndex = i + idx + 1;
              try {
                const p = await this.downloadSinglePage(url, pageIndex, referer);
                return { pageIndex, path: p };
              } catch (err) {
                return null;
              } finally {
                completed++;
                if (onProgress) onProgress(completed, total, completed >= total);
              }
            })
          );

          downloadedChunk
            .filter(Boolean)
            .sort((a, b) => a.pageIndex - b.pageIndex)
            .forEach(item => appendToMpv(item.path));
        }
      })();
    } else {
      // For image gallery viewers (feh, sxiv, imv, loupe):
      let args = [];
      if (viewerType === 'feh') {
        args = ['--scale-down', '--auto-reload'];
        if (options.fullscreen !== false) args.unshift('-F');
        args.push(this.activeDir);
      } else if (viewerType === 'sxiv') {
        args = ['-b'];
        if (options.fullscreen) args.unshift('-f');
        args.push(this.activeDir);
      } else if (viewerType === 'imv') {
        args = [];
        if (options.fullscreen) args.push('-f');
        args.push(this.activeDir);
      } else if (viewerType === 'loupe') {
        args = [page1Path];
      } else {
        args = [page1Path];
      }

      viewerProc = spawn(viewerType, args, { stdio: 'inherit' });

      // Background download all remaining pages into the directory
      (async () => {
        let fullPagesList = [];
        if (Array.isArray(pages)) {
          fullPagesList = pages;
        } else if (typeof pages.discoverRemainingPages === 'function') {
          fullPagesList = await pages.discoverRemainingPages();
        } else if (Array.isArray(pages.pages)) {
          fullPagesList = pages.pages;
        }

        const total = fullPagesList.length;
        const concurrency = 10;
        let completed = 1;

        for (let i = 1; i < total; i += concurrency) {
          if (!this.activeDir) break;
          const chunk = fullPagesList.slice(i, i + concurrency);
          await Promise.all(
            chunk.map(async (url, idx) => {
              const pageIndex = i + idx + 1;
              try {
                await this.downloadSinglePage(url, pageIndex, referer);
              } catch (err) {}
              completed++;
              if (onProgress) onProgress(completed, total, completed >= total);
            })
          );
        }
      })();
    }

    return new Promise((resolve) => {
      viewerProc.on('close', () => {
        this.cleanUp();
        resolve();
      });
    });
  }
}

module.exports = MangaViewer;
