// Browser smoke check. Set PLAYWRIGHT_MODULE to a bundled Playwright entry if needed.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    const waitForTiles = async () => {
      await page.locator('.leaflet-tile-loaded').first().waitFor({ timeout: 30000 });
      await page.waitForFunction(() => {
        const tiles = [...document.querySelectorAll('.leaflet-tile')];
        return tiles.length > 0 && tiles.every(tile => tile.complete && tile.naturalWidth > 0);
      }, { timeout: 30000 });
    };
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:5174');
    if (process.argv.includes('--live-place')) {
      const place = await page.evaluate(async () => {
        const { resolvePlaceName } = await import('/src/placeNames.ts');
        return resolvePlaceName(12.2958, 76.6394, new AbortController().signal);
      });
      assert.ok(place.resolved, 'Live Photon place lookup must resolve Mysuru');
      console.log('Live reverse lookup:', place.name, '/', place.region);
    }
    await waitForTiles();
    await page.locator('.crop-focus').waitFor();
    await page.screenshot({ path: path.join(os.tmpdir(), 'agri-dark-desktop.png') });
    const initial = await page.locator('.area-title h2').innerText();
    const baselineScore = await page.locator('.overview-tile').first().locator('.big-value').innerText();
    assert.ok(await page.getByLabel('Flood importance', { exact: true }).isDisabled());
    await page.getByLabel('Scenario mode', { exact: true }).check();
    await page.getByLabel('Flood importance', { exact: true }).fill('0.9');
    assert.notEqual(await page.locator('.overview-tile').first().locator('.big-value').innerText(), baselineScore);
    await page.getByLabel('Scenario mode', { exact: true }).uncheck();
    assert.equal(await page.locator('.overview-tile').first().locator('.big-value').innerText(), baselineScore);
    await page.locator('#risk-comparison').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(os.tmpdir(), 'agri-risk-settings.png') });
    await page.locator('#map-section').scrollIntoViewIfNeeded();
    await page.getByLabel('Search saved areas').fill('Hoskote');
    await page.locator('.search-results button').first().click();
    assert.notEqual(await page.locator('.area-title h2').innerText(), initial);
    const crop = await page.locator('.ranking-row').nth(2).locator('strong').innerText();
    await page.locator('.ranking-row').nth(2).click();
    assert.ok((await page.locator('.crop-focus h2').innerText()).includes(crop));
    await page.getByTitle('Close crop recommendation').click();
    await page.route('https://photon.komoot.io/**', route => {
      const url = new URL(route.request().url());
      const name = `Mysuru (${Number(url.searchParams.get('lat')).toFixed(3)}, ${Number(url.searchParams.get('lon')).toFixed(3)})`;
      return route.fulfill({ json: { features: [{ properties: { city: name, county: 'Mysuru', state: 'Karnataka', country: 'India' } }] } });
    });
    assert.equal(await page.locator('.crop-focus').count(), 0);
    await page.getByTitle('Switch to light mode').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await page.reload();
    await page.locator('.crop-focus').waitFor();
    await waitForTiles();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await page.screenshot({ path: path.join(os.tmpdir(), 'agri-light-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await waitForTiles();
    await page.screenshot({ path: path.join(os.tmpdir(), 'agri-light-mobile.png') });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile must not overflow horizontally');
    await page.locator('.area-title').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(os.tmpdir(), 'agri-mobile-conditions.png') });
    await page.getByTitle('Switch to dark mode').click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.screenshot({ path: path.join(os.tmpdir(), 'agri-dark-mobile.png') });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('#map-section').scrollIntoViewIfNeeded();
    await page.getByTitle('Close crop recommendation').click();
    await page.route('https://power.larc.nasa.gov/**', route => route.fulfill({ status: 503, body: '{}' }));
    await page.route('https://rest.isric.org/**', route => route.fulfill({ status: 503, body: '{}' }));
    await page.locator('#risk-map').click({ position: { x: 20, y: 160 } });
    await page.getByText('NASA POWER request failed (503).', { exact: false }).waitFor();
    assert.equal(await page.locator('.sidebar-status').count(), 0);
    await page.unroute('https://power.larc.nasa.gov/**');
    await page.unroute('https://rest.isric.org/**');
    let calls = 0;
    let secondLabel;
    let firstCompleted;
    const firstDone = new Promise(resolve => { firstCompleted = resolve; });
    await page.route('https://power.larc.nasa.gov/**', async route => {
      const sequence = ++calls;
      const url = new URL(route.request().url());
      const label = `Mysuru (${Number(url.searchParams.get('latitude')).toFixed(3)}, ${Number(url.searchParams.get('longitude')).toFixed(3)})`;
      if (sequence === 2) secondLabel = label;
      if (sequence === 1) await new Promise(resolve => setTimeout(resolve, 900));
      const values = { T2M: 24, T2M_MAX: 30, T2M_MIN: 19, PRECTOTCORR: 3, RH2M: 65, WS2M: 2 };
      const parameter = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { '20250601': value, '20250602': value }]));
      await route.fulfill({ json: { properties: { parameter } } });
      if (sequence === 1) firstCompleted();
    });
    await page.route('https://rest.isric.org/**', route => route.fulfill({ json: { properties: { layers: Object.entries({ phh2o: 65, soc: 130, nitrogen: 150, clay: 200, sand: 550, silt: 250, cec: 150 }).map(([name, mean]) => ({ name, depths: [{ values: { mean } }] })) } } }));
    await page.locator('#risk-map').click({ position: { x: 20, y: 180 } });
    await page.locator('.sidebar-status').waitFor();
    await page.locator('#risk-map').click({ position: { x: 50, y: 190 } });
    await page.waitForFunction(() => document.querySelector('.area-title h2')?.textContent.startsWith('Mysuru'));
    await firstDone;
    assert.equal(await page.locator('.area-title h2').innerText(), secondLabel, 'A stale analysis must not replace the latest clicked area');
    assert.ok(await page.locator('.crop-focus').isVisible());
    const downloadPromise = page.waitForEvent('download');
    await page.locator('.export-row button').first().click();
    const csvDownload = await downloadPromise;
    const csvPath = await csvDownload.path();
    assert.ok(require('node:fs').readFileSync(csvPath, 'utf8').includes(secondLabel), 'Export includes clicked area');
    assert.ok((await page.locator('.area-subtitle').innerText()).includes('Karnataka'));
    await page.unroute('https://photon.komoot.io/**');
    await page.route('https://photon.komoot.io/**', route => route.fulfill({ status: 503, body: '{}' }));
    await page.getByTitle('Close crop recommendation').click();
    await page.locator('#risk-map').click({ position: { x: 80, y: 200 } });
    await page.waitForFunction(() => document.querySelector('.area-title h2')?.textContent === 'Selected location');
    assert.ok(await page.locator('.crop-focus').isVisible(), 'Geocoder failure must not block climate and soil results');
    assert.deepEqual(errors, []);
    console.log('PASS: map tiles, saved areas, crop cards, themes/mobile, default/scenario isolation and reset, named places and geocoder failure, climate API failure/success, rapid-click race, CSV export; no browser runtime errors.');
    console.log('Screenshots: ' + os.tmpdir() + '/agri-{dark,light}-{desktop,mobile}.png');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
