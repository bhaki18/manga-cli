const { execFile, spawn } = require('child_process');

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Fetch text/html using curl to avoid Cloudflare TLS fingerprint blocks
 */
function fetchHtml(url, referer = null) {
  return new Promise((resolve, reject) => {
    const args = [
      '-s',
      '-L',
      '-A', DEFAULT_USER_AGENT,
      '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      '-H', 'Accept-Language: it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
    ];

    if (referer) {
      args.push('-e', referer);
    }

    args.push(url);

    execFile('curl', args, { maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(`cURL error: ${err.message}`));
      }
      resolve(stdout);
    });
  });
}

/**
 * Check if a URL exists (HTTP 200) via curl HEAD request
 */
function checkUrlExists(url, referer = null) {
  return new Promise((resolve) => {
    const args = [
      '-s',
      '-I',
      '-A', DEFAULT_USER_AGENT,
    ];
    if (referer) {
      args.push('-e', referer);
    }
    args.push(url);

    execFile('curl', args, (err, stdout) => {
      if (err) return resolve(false);
      const is200 = stdout.includes('200 OK') || stdout.includes('HTTP/2 200');
      resolve(is200);
    });
  });
}

/**
 * Download a file/image directly to destination path
 */
function downloadToFile(url, destPath, referer = null) {
  return new Promise((resolve, reject) => {
    const args = [
      '-s',
      '-L',
      '-A', DEFAULT_USER_AGENT,
      '-o', destPath
    ];
    if (referer) {
      args.push('-e', referer);
    }
    args.push(url);

    execFile('curl', args, (err) => {
      if (err) return reject(err);
      resolve(destPath);
    });
  });
}

module.exports = {
  fetchHtml,
  checkUrlExists,
  downloadToFile,
  DEFAULT_USER_AGENT
};
