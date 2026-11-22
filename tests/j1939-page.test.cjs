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
    const response = await page.goto(preview.url + '/j1939');
    assert.equal(response.status(), 200);
    assert.match(await page.locator('#coverage').innerText(), /没有 J1939DA/);
    assert.match(await page.locator('#coverage').innerText(), /不是一致性认证/);
    assert.match(await page.locator('#limits').innerText(), /不发送 CTS/);
    await page.setInputFiles('#logFile', path.resolve('tests/fixtures/j1939/session-synthetic.asc'));
    await page.waitForSelector('#events tr[data-status="reassembled"]');
    const assembled = page.locator('#events tr[data-status="reassembled"]');
    assert.match(await assembled.innerText(), /F0AA/);
    assert.match(await assembled.innerText(), /01 02 03 04 05 06 07 08 09 0A/);
    assert.match(await assembled.innerText(), /L6/);
    const global = page.locator('#events tr[data-pgn="61184"]');
    assert.match(await global.innerText(), /全局 255/);
    assert.doesNotMatch(await page.locator('#events tr[data-status="ignored"]').innerText(), /故障/);
    assert.match(await page.locator('#anomalies').innerText(), /CAN FD/);
    await page.fill('#pgnFilter', 'F0AA');
    await page.waitForFunction(() => document.querySelectorAll('#events tbody tr').length === 2);
    assert.equal(await page.locator('#events tr[data-pgn="61184"]').count(), 0);
    await page.fill('#saFilter', '2');
    await page.waitForFunction(() => document.querySelectorAll('#events tbody tr').length === 0);
    const home = await page.goto(preview.url + '/');
    assert.equal(home.status(), 200);
    const card = page.locator('a.page-card[href="/j1939"]');
    assert.equal(await card.locator('h2').innerText(), 'J1939分析');
    assert.match(await card.innerText(), /基础离线/);
    await page.setViewportSize({width: 390, height: 844});
    await page.goto(preview.url + '/j1939');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  } finally {
    await browser.close();
    await preview.close();
  }
  console.log('PASS: J1939 offline page shows normalized PGNs, BAM payload and unsupported CAN FD');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
