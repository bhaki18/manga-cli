const { execFile } = require('child_process');

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DOH_RESOLVER = 'https://1.1.1.1/dns-query';

/**
 * Fetch text/html or json using curl with DoH to prevent DNS blocking (e.g. AGCOM / ISP blocks)
 */
function fetchHtml(url, referer = null) {
  return new Promise((resolve, reject) => {
    const args = [
      '-s',
      '-g',
      '-L',
      '--doh-url', DOH_RESOLVER,
      '-A', DEFAULT_USER_AGENT,
      '-H', 'Accept: text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8',
      '-H', 'Accept-Language: it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
    ];

    if (referer) {
      args.push('-e', referer);
    }

    args.push(url);

    execFile('curl', args, { maxBuffer: 20 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        return reject(new Error(`cURL error: ${err.message}`));
      }
      resolve(stdout);
    });
  });
}

/**
 * Fetch JSON directly
 */
async function fetchJson(url, referer = null) {
  const text = await fetchHtml(url, referer);
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Failed to parse JSON response: ${err.message}`);
  }
}

/**
 * Check if a URL exists (HTTP 200) via fast curl HEAD request
 */
function checkUrlExists(url, referer = null) {
  return new Promise((resolve) => {
    const args = [
      '-s',
      '-g',
      '-I',
      '--connect-timeout', '3',
      '-m', '5',
      '-A', DEFAULT_USER_AGENT,
    ];
    if (referer) {
      args.push('-e', referer);
    }
    args.push(url);

    execFile('curl', args, (err, stdout) => {
      if (err) return resolve(false);
      const is200 = stdout && (stdout.includes('200 OK') || stdout.includes('HTTP/2 200') || stdout.includes('HTTP/1.1 200'));
      resolve(is200);
    });
  });
}

/**
 * Download a file/image directly to destination path with fast direct connection
 */
function downloadToFile(url, destPath, referer = null) {
  return new Promise((resolve, reject) => {
    const args = [
      '-s',
      '-g',
      '-L',
      '--connect-timeout', '5',
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
  fetchJson,
  checkUrlExists,
  downloadToFile,
  DEFAULT_USER_AGENT
};
