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
  async detectViewer() {
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
  async streamAndRead(pages, referer, onProgress) {
    if (!this.activeDir) throw new Error('RAM directory not initialized');
    const total = pages.length;
    const viewerType = await this.detectViewer();

    // 1. Download PAGE 1 first so reader opens in < 1s
    const page1Path = await this.downloadSinglePage(pages[0], 1, referer);
    if (onProgress) onProgress(1, total, false);

    let viewerProc;

    if (viewerType === 'mpv') {
      // MPV with dynamic IPC socket playlist injection
      viewerProc = spawn('mpv', [
        '--input-ipc-server=' + this.mpvSocket,
        '--image-display-duration=inf',
        '--reset-on-next-file=pause',
        page1Path
      ], { stdio: 'inherit' });

      const connectIpc = () => new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (fs.existsSync(this.mpvSocket)) {
            const client = net.connect(this.mpvSocket, () => {
              clearInterval(checkInterval);
              resolve(client);
            });
            client.on('error', () => {});
          }
        }, 50);
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
        const concurrency = 6;
        let completed = 1;
        for (let i = 1; i < total; i += concurrency) {
          if (!this.activeDir) break;
          const chunk = pages.slice(i, i + concurrency);
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
      // Launch directly pointing to the RAM directory with auto-reload flags
      let args = [];
      if (viewerType === 'feh') {
        args = ['-F', '--scale-down', '--auto-reload', this.activeDir];
      } else if (viewerType === 'sxiv') {
        args = ['-f', '-b', this.activeDir];
      } else if (viewerType === 'imv') {
        args = [this.activeDir];
      } else if (viewerType === 'loupe') {
        args = [page1Path];
      } else {
        args = [page1Path];
      }

      viewerProc = spawn(viewerType, args, { stdio: 'inherit' });

      // Background download all remaining pages into the directory
      (async () => {
        const concurrency = 6;
        let completed = 1;
        for (let i = 1; i < total; i += concurrency) {
          if (!this.activeDir) break;
          const chunk = pages.slice(i, i + concurrency);
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
