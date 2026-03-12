/**
 * Pronet probe 7 — Dump 1x2 btg structure
 */
import { chromium } from 'playwright';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];

const page = await ctx.newPage();
const client = await page.context().newCDPSession(page);
await client.send('Network.enable');

let fixtureBody = null;
client.on('Network.responseReceived', async ({ requestId, response }) => {
  if (response.url.includes('fixture-search') && response.url.includes('/mop/')) {
    try {
      const { body } = await client.send('Network.getResponseBody', { requestId });
      fixtureBody = body;
    } catch {}
  }
});

await page.goto('https://tulipbet835.com/tr/sport/bet/todays-events/football', { waitUntil: 'load', timeout: 30000 });
await sleep(12000);

if (!fixtureBody) { console.log('No data'); process.exit(1); }

const result = await page.evaluate((json) => {
  const data = JSON.parse(json);
  const fb = data.data.find(s => s.stId === 170);
  const fx = fb.cs[0].sns[0].fs[0]; // First fixture
  
  const out = {};
  out.fixture = { fId: fx.fId, home: fx.hcN, away: fx.acN };
  out.btgsCount = fx.btgs?.length;
  
  // Dump first btg (1x2) completely
  const btg1x2 = fx.btgs?.find(b => b.btgN === '1x2');
  if (btg1x2) {
    out.btg1x2_keys = Object.keys(btg1x2);
    out.btg1x2_raw = JSON.stringify(btg1x2).substring(0, 3000);
  }
  
  // Alternative: dump first btg completely
  if (fx.btgs?.[0]) {
    out.btg0_keys = Object.keys(fx.btgs[0]);
    out.btg0_raw = JSON.stringify(fx.btgs[0]).substring(0, 2000);
  }
  
  return out;
}, fixtureBody);

console.log('Fixture:', result.fixture);
console.log('Btg count:', result.btgsCount);
console.log('\n1x2 btg keys:', result.btg1x2_keys);
console.log('\n1x2 btg raw:');
console.log(result.btg1x2_raw);
console.log('\nBtg[0] keys:', result.btg0_keys);
console.log('\nBtg[0] raw:');
console.log(result.btg0_raw);

await page.close();
await browser.close();
