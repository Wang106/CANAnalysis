const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {createServer} = require('node:http');
const {readFile} = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.asc': 'text/plain; charset=utf-8',
  '.dbc': 'text/plain; charset=utf-8',
};

function candidateFiles(pathname) {
  const relative = pathname.replace(/^\/+/, '');
  return [path.resolve(root, relative), path.resolve(root, 'public', relative)];
}

function start() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      let body = null;
      let file = null;
      for (const candidate of candidateFiles(pathname)) {
        if (candidate !== root && !candidate.startsWith(root + path.sep)) continue;
        try {
          body = await readFile(candidate);
          file = candidate;
          break;
        } catch {
          body = null;
        }
      }
      if (!file) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, {'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream'});
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({
      url: `http://127.0.0.1:${server.address().port}`,
      close: () => new Promise((done) => server.close(done)),
    }));
  });
}

(async () => {
  const server = await start();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  try {
    const page = await browser.newPage({viewport: {width: 1280, height: 900}});
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(server.url + '/tests/regression.html', {waitUntil: 'load', timeout: 30000});
    await page.waitForFunction(() => Array.isArray(window.__TEST_RESULTS__) && window.__TEST_RESULTS__.length > 0, null, {timeout: 90000});
    const results = await page.evaluate(() => window.__TEST_RESULTS__);
    const failed = results.filter((item) => !item.ok);
    assert.equal(failed.length, 0, failed.map((item) => `${item.name} — ${item.error}`).join('\n'));
    assert.deepEqual(errors, []);
    console.log(`PASS: regression page ${results.length}/${results.length}`);
  } finally {
    await browser.close();
    await server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
