const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  const {startPreview} = await import('../scripts/preview-static.mjs');
  const preview = await startPreview({host: '127.0.0.1', port: 0});
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  try {
    const page = await browser.newPage({viewport: {width: 1280, height: 900}});
    const response = await page.goto(preview.url + '/gbt27930');
    assert.equal(response.status(), 200);
    assert.match(await page.locator('#coverage').innerText(), /GB\/T 27930—2015/);
    assert.match(await page.locator('#coverage').innerText(), /不是协议一致性认证/);
    assert.match(await page.locator('#limits').innerText(), /RTS\/CTS/);
    assert.match(await page.locator('#limits').innerText(), /未知报文不会被当成故障/);
    await page.setInputFiles('#logFile', path.resolve('tests/fixtures/gbt27930-2015/session-synthetic.asc'));
    await page.waitForSelector('#events tr[data-code="BCP"]');
    const bcp = page.locator('#events tr[data-code="BCP"]');
    assert.match(await bcp.innerText(), /200 A/);
    assert.match(await bcp.innerText(), /1CEC56F4/);
    assert.match(await bcp.innerText(), /L7/);
    const unknown = page.locator('#events tr[data-status="unknown"]');
    assert.equal(await unknown.count(), 1);
    assert.doesNotMatch(await unknown.innerText(), /故障/);
    const truncated = page.locator('#events tr[data-code="CHM"][data-status="incomplete"]');
    assert.match(await truncated.innerText(), /L18/);
    assert.doesNotMatch(await truncated.innerText(), /协议版本/);
    const home = await page.goto(preview.url + '/');
    assert.equal(home.status(), 200);
    const card = page.locator('a.page-card[href="/gbt27930"]');
    assert.equal(await card.locator('h2').innerText(), '27930解析');
    assert.match(await card.innerText(), /2015离线/);
    assert.equal(await page.locator('article.page-card h2', {hasText: 'J1939分析'}).count(), 1);
    await page.setViewportSize({width: 390, height: 844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  } finally {
    await browser.close();
    await preview.close();
  }
  console.log('PASS: 2015 offline page renders synthetic coverage without treating unknown frames as faults');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
