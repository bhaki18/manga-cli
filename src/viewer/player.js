const { spawn } = require('child_process');

class AnimePlayer {
  constructor() {
    this.activeProcess = null;

    process.on('SIGINT', () => {
      this.kill();
      process.exit();
    });
    process.on('exit', () => {
      this.kill();
    });
  }

  kill() {
    if (this.activeProcess) {
      try {
        this.activeProcess.kill('SIGTERM');
      } catch (e) {}
      this.activeProcess = null;
    }
  }

  /**
   * Detects the best available video player on the system
   */
  async detectPlayer(preferredPlayer = null) {
    if (preferredPlayer) {
      const exists = await new Promise((res) => {
        const p = spawn('which', [preferredPlayer]);
        p.on('close', (code) => res(code === 0));
      });
      if (exists) return preferredPlayer;
    }

    const candidateCommands = ['mpv', 'vlc', 'ffplay'];
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
   * Plays an anime stream in the system's media player
   * @param {string} videoUrl 
   * @param {string} animeTitle 
   * @param {string} episodeTitle 
   * @param {string} referer 
   * @param {object} options
   * @returns {Promise<{ success: boolean, code: number }>}
   */
  async play(videoUrl, animeTitle = '', episodeTitle = '', referer = 'https://onepiecepower.com/', options = {}) {
    const playerType = await this.detectPlayer(options.player);
    const title = `${animeTitle}${episodeTitle ? ' - ' + episodeTitle : ''}`;

    return new Promise((resolve, reject) => {
      let cmd = playerType;
      let args = [];

      if (playerType === 'mpv') {
        args = [
          `--title=${title}`,
          `--http-header-fields=Referer: ${referer}`,
          '--force-window=immediate',
          '--save-position-on-quit',
          '--term-osd-bar'
        ];
        if (options.fullscreen) {
          args.push('--fs');
        }
        args.push(videoUrl);
      } else if (playerType === 'vlc') {
        args = [
          `--meta-title=${title}`,
          `--http-referrer=${referer}`
        ];
        if (options.fullscreen) {
          args.push('--fullscreen');
        }
        args.push(videoUrl);
      } else if (playerType === 'ffplay') {
        args = [
          '-window_title', title,
          '-headers', `Referer: ${referer}\r\n`
        ];
        if (options.fullscreen) {
          args.push('-fs');
        }
        args.push(videoUrl);
      } else {
        // Fallback xdg-open
        cmd = 'xdg-open';
        args = [videoUrl];
      }

      this.activeProcess = spawn(cmd, args, { stdio: 'inherit' });

      this.activeProcess.on('close', (code) => {
        this.activeProcess = null;
        resolve({ success: code === 0, code });
      });

      this.activeProcess.on('error', (err) => {
        this.activeProcess = null;
        reject(err);
      });
    });
  }
}

module.exports = AnimePlayer;
