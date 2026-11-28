const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {readFileSync} = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const {startPreview} = await import('../scripts/preview-static.mjs');
  const {commitInstant, formatReleaseDate, shortCommit} = await import('../public/site-version-core.mjs');
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const failures = [];
  try {
    await checkRealSite(browser, failures, {startPreview, commitInstant, formatReleaseDate, shortCommit});
    await checkCustomManifest(browser, failures, {startPreview, formatReleaseDate});
    await checkMissingManifest(browser, failures, {startPreview});
  } finally {
    await browser.close();
  }
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  console.log('PASS: static security headers, online bridge exception and version fallback');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function newContext(browser) {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__cspViolations.push({directive: event.violatedDirective, blocked: event.blockedURI});
    });
  });
  return context;
}

async function openPage(context, url) {
  const page = await context.newPage({viewport: {width: 1280, height: 900}});
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://api.github.com/**', (route) => route.abort('internetdisconnected'));
  let githubRequests = 0;
  page.on('request', (request) => {
    if (request.url().includes('api.github.com')) githubRequests += 1;
  });
  await page.goto(url, {waitUntil: 'load', timeout: 30000});
  return {page, errors, githubCount: () => githubRequests};
}

async function violations(page) {
  return page.evaluate(() => window.__cspViolations.slice());
}

async function probeSocket(page, url) {
  return page.evaluate(async (target) => {
    const before = window.__cspViolations.length;
    const result = await new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (!settled) {
          settled = true;
          resolve(value);
        }
      };
      let socket;
      try {
        socket = new WebSocket(target);
      } catch (error) {
        finish('throw:' + error.message);
        return;
      }
      socket.addEventListener('open', () => {
        socket.close();
        finish('open');
      });
      socket.addEventListener('error', () => finish('error'));
      setTimeout(() => finish('timeout'), 800);
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    return {result, added: window.__cspViolations.slice(before)};
  }, url);
}

async function checkRealSite(browser, failures, helpers) {
  const manifest = JSON.parse(readFileSync('public/version.json', 'utf8'));
  const preview = await helpers.startPreview();
  const context = await newContext(browser);
  try {
    for (const pathname of ['/', '/offline', '/convert', '/online', '/aboutus']) {
      const opened = await openPage(context, preview.url + pathname);
      if (pathname === '/') {
        await opened.page.waitForFunction(() => window.__siteVersionState && window.__siteVersionState.source, null, {timeout: 5000});
      } else {
        await opened.page.waitForTimeout(400);
      }
      const found = await violations(opened.page);
      if (found.length) failures.push(`${pathname} CSP ${JSON.stringify(found)}`);
      if (opened.errors.length) failures.push(`${pathname} pageerror ${opened.errors.join(' | ')}`);
      if (pathname === '/') {
        const commit = await opened.page.locator('#hcommit').textContent();
        const release = await opened.page.locator('#hmodtime').textContent();
        const expectedDate = helpers.formatReleaseDate(helpers.commitInstant(manifest.committedAt));
        if (commit !== helpers.shortCommit(manifest.commit)) failures.push(`home commit ${commit}`);
        if (release !== expectedDate) failures.push(`home release ${release} expected ${expectedDate}`);
        if (opened.githubCount() !== 0) failures.push(`home requested GitHub ${opened.githubCount()} times`);
        if (/2000-01-01/.test(release)) failures.push('home showed placeholder date');
      }
      await opened.page.close();
    }
    const online = await openPage(context, preview.url + '/online');
    await online.page.waitForTimeout(200);
    const loopback = await probeSocket(online.page, 'ws://127.0.0.1:8765');
    const localHost = await probeSocket(online.page, 'ws://localhost:8765');
    const evil = await probeSocket(online.page, 'ws://evil.example:8765');
    if (loopback.added.length || localHost.added.length) failures.push(`online blocked local bridge ${JSON.stringify({loopback, localHost})}`);
    if (!evil.added.some((item) => /connect-src/.test(item.directive))) failures.push(`online allowed unexpected websocket ${JSON.stringify(evil)}`);
    await online.page.close();
    const home = await openPage(context, preview.url + '/');
    await home.page.waitForFunction(() => window.__siteVersionState, null, {timeout: 5000});
    const blocked = await probeSocket(home.page, 'ws://127.0.0.1:8765');
    if (!blocked.added.some((item) => /connect-src/.test(item.directive))) failures.push(`home allowed local bridge ${JSON.stringify(blocked)}`);
    await home.page.close();
  } finally {
    await context.close();
    await preview.close();
  }
}

async function checkCustomManifest(browser, failures, helpers) {
  const manifest = {
    version: '1.2.0',
    commit: 'a16de4d5f8ce1185d55e3f557c1439f4c202c07c',
    shortCommit: 'a16de4d5',
    committedAt: '2026-09-20T12:57:50Z',
    generatedAt: '2099-03-04T05:06:07.000Z',
    commitSource: 'git-committer',
  };
  const preview = await helpers.startPreview({manifest});
  const context = await newContext(browser);
  try {
    const opened = await openPage(context, preview.url + '/');
    await opened.page.waitForFunction(() => window.__siteVersionState && window.__siteVersionState.source === 'manifest', null, {timeout: 5000});
    const release = await opened.page.locator('#hmodtime').textContent();
    const commit = await opened.page.locator('#hcommit').textContent();
    if (commit !== 'a16de4d5') failures.push(`custom commit ${commit}`);
    if (release !== helpers.formatReleaseDate(new Date(manifest.committedAt))) failures.push(`custom release ${release}`);
    if (/2099|2000-01-01/.test(release)) failures.push(`custom release used the wrong clock ${release}`);
    if (opened.githubCount() !== 0) failures.push('custom manifest still called GitHub');
    await opened.page.close();
  } finally {
    await context.close();
    await preview.close();
  }
}

async function checkMissingManifest(browser, failures, helpers) {
  const preview = await helpers.startPreview({manifest: 'missing'});
  const context = await newContext(browser);
  try {
    const opened = await openPage(context, preview.url + '/');
    await opened.page.waitForFunction(() => window.__siteVersionState && window.__siteVersionState.source === 'none', null, {timeout: 5000});
    const text = await opened.page.locator('.site-version').innerText();
    if (text.trim()) failures.push(`missing manifest displayed ${JSON.stringify(text)}`);
    if (/2000-01-01/.test(text)) failures.push('missing manifest showed 2000-01-01');
    await opened.page.close();
  } finally {
    await context.close();
    await preview.close();
  }
}
