/**
 * Pronet probe 5 — Extract prematch data from todays-events
 * Key: today-events API returns 400 (needs right params)
 * Also: DOM has match data in bet-btn elements
 */
import { chromium } from 'playwright';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];

const TUL = 'tulipbet835.com';

// ══ TEST 1: Try today-events API with different params ══
console.log('=== TEST 1: today-events API params ===');
const page1 = await ctx.newPage();
await page1.goto(`https://${TUL}/tr/sport/bet/main`, { waitUntil: 'domcontentloaded', timeout: 20000 });
await sleep(3000);

const paramSets = [
  { sportTypeId: 170 },
  { sportTypeId: 170, timeRangeInHours: 48 },
  { sportTypeId: 170, categoryId: 204 }, // Turkey
  { sportTypeId: 170, page: 1, size: 100 },
  { timeRangeInHours: 48 },
  { timeRangeInHours: null },
  { sportTypeIds: [170] },
  { sportTypeId: "170" },
  {},
];

for (const params of paramSets) {
  const body = JSON.stringify({ requestBody: params });
  const enc = Buffer.from(encodeURIComponent(body)).toString('base64');
  const url = `https://${TUL}/api/v3/mop/today-events/d/1/${TUL}/${enc}`;
  try {
    const r = await page1.evaluate(async (u) => {
      const resp = await fetch(u);
      const text = await resp.text();
      return { s: resp.status, len: text.length, body: text.substring(0, 300) };
    }, url);
    console.log(`  ${JSON.stringify(params)} → ${r.s} [${r.len}B] ${r.body.substring(0, 200)}`);
  } catch(e) { console.log(`  ${JSON.stringify(params)} → ERR: ${e.message.substring(0, 50)}`); }
}

// Also try league-fixture with different params
console.log('\n  --- league-fixture params ---');
for (const params of [
  { leagueId: 923410 },  // from earlier probe
  { seasonId: 1108042 },
  { seasonIds: [1108042] },
  { sportTypeId: 170, categoryId: 204 },
]) {
  const body = JSON.stringify({ requestBody: params });
  const enc = Buffer.from(encodeURIComponent(body)).toString('base64');
  const url = `https://${TUL}/api/v3/mop/league-fixture/d/1/${TUL}/${enc}`;
  try {
    const r = await page1.evaluate(async (u) => {
      const resp = await fetch(u);
      const text = await resp.text();
      return { s: resp.status, len: text.length, body: text.substring(0, 300) };
    }, url);
    if (r.s !== 404) console.log(`  ${JSON.stringify(params)} → ${r.s} [${r.len}B] ${r.body.substring(0, 200)}`);
  } catch(e) {}
}
await page1.close();

// ══ TEST 2: Capture ALL network requests on todays-events ══
console.log('\n=== TEST 2: ALL network requests on todays-events ===');
const page2 = await ctx.newPage();
const client = await page2.context().newCDPSession(page2);
await client.send('Network.enable');

const allRequests = [];
client.on('Network.requestWillBeSent', ({ request }) => {
  // Capture all XHR/Fetch requests
  if (request.url.includes(TUL) && !request.url.endsWith('.js') && !request.url.endsWith('.css') 
      && !request.url.endsWith('.png') && !request.url.endsWith('.svg') && !request.url.endsWith('.woff2')
      && !request.url.endsWith('.ico') && !request.url.includes('google') && !request.url.includes('facebook')) {
    allRequests.push({ method: request.method, url: request.url });
  }
});

const allResponses = [];
client.on('Network.responseReceived', async ({ requestId, response }) => {
  if (response.url.includes(TUL) && !response.url.endsWith('.js') && !response.url.endsWith('.css')
      && !response.url.endsWith('.png') && !response.url.endsWith('.svg')) {
    try {
      const { body } = await client.send('Network.getResponseBody', { requestId });
      if (body.length > 500) {
        allResponses.push({ url: response.url.substring(0, 120), status: response.status, size: body.length, sample: body.substring(0, 200) });
      }
    } catch {}
  }
});

await page2.goto(`https://${TUL}/tr/sport/bet/todays-events/football`, { waitUntil: 'load', timeout: 30000 });
await sleep(12000);

console.log(`  Total requests: ${allRequests.length}`);
console.log(`  Notable responses (>500B):`);
for (const r of allResponses) {
  console.log(`    ${r.status} [${r.size}B] ${r.url}`);
  if (r.size > 5000) console.log(`      ${r.sample}`);
}

// ══ TEST 3: Detailed DOM extraction ══
console.log('\n=== TEST 3: DETAILED DOM EXTRACTION ===');
const domData = await page2.evaluate(() => {
  const result = {};
  
  // Get the HTML of the first few fixture-like containers
  const containers = document.querySelectorAll('[class*="antepost"], [class*="prelive"], [class*="today"]');
  result.containerCount = containers.length;
  
  // Get the complete HTML of one fixture row for analysis
  const firstFixture = document.querySelector('[class*="prelive-fixture"], [class*="fixture-row"], [class*="event-fixture"]');
  result.firstFixtureHTML = firstFixture?.outerHTML?.substring(0, 2000) || 'not found';
  
  // Look deeper at the structure
  const allClasses = new Set();
  document.querySelectorAll('*').forEach(el => {
    const cls = el.className;
    if (typeof cls === 'string' && (cls.includes('fixture') || cls.includes('prelive') || cls.includes('today') || cls.includes('match'))) {
      allClasses.add(cls.substring(0, 80));
    }
  });
  result.relevantClasses = [...allClasses].slice(0, 30);
  
  // Find the actual match containers by looking for patterns
  // The bet-btn contains "Kupona Ekle{odd}\n{team}"
  const betBtns = document.querySelectorAll('.bet-btn');
  const groups = [];
  let currentGroup = [];
  let lastParent = null;
  
  for (const btn of betBtns) {
    const parent = btn.closest('[class*="fixture"], [class*="event"], [class*="row"], [class*="content"]');
    if (parent !== lastParent && currentGroup.length > 0) {
      groups.push(currentGroup);
      currentGroup = [];
    }
    lastParent = parent;
    const text = btn.textContent?.trim() || '';
    const match = text.match(/Kupona Ekle([\d.]+)\n?(.*)/s);
    if (match) {
      currentGroup.push({ odd: parseFloat(match[1]), label: match[2]?.trim()?.substring(0, 30) });
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup);
  
  result.betGroups = groups.slice(0, 10);
  result.totalBetGroups = groups.length;
  
  // Better approach: find fixture header/info elements near bet buttons
  const fixtureHeaders = [];
  document.querySelectorAll('[class*="fixture-header"], [class*="event-header"], [class*="match-header"], [class*="competition-name"], [class*="league-name"]').forEach(el => {
    fixtureHeaders.push({ cls: el.className?.substring(0, 60), text: el.textContent?.trim()?.substring(0, 80) });
  });
  result.fixtureHeaders = fixtureHeaders.slice(0, 15);
  
  // Check initial HTML for embedded data (Angular transfer state)
  const transferState = document.querySelector('script#serverApp-state, script[type="application/json"]');
  result.hasTransferState = !!transferState;
  result.transferStateSize = transferState?.textContent?.length || 0;
  
  return result;
});

console.log('Containers:', domData.containerCount);
console.log('Relevant classes:', domData.relevantClasses);
console.log('Fixture headers:', JSON.stringify(domData.fixtureHeaders));
console.log('Bet groups:', domData.totalBetGroups);
console.log('Sample bet groups:', JSON.stringify(domData.betGroups?.slice(0, 5), null, 2));
console.log('Transfer state:', domData.hasTransferState, 'size:', domData.transferStateSize);
console.log('First fixture HTML (500):', domData.firstFixtureHTML?.substring(0, 500));

// ══ TEST 4: Check if data is in Angular transfer state or embedded JSON ══
if (domData.hasTransferState && domData.transferStateSize > 0) {
  console.log('\n=== TEST 4: TRANSFER STATE DATA ===');
  const tsData = await page2.evaluate(() => {
    const el = document.querySelector('script#serverApp-state, script[type="application/json"]');
    const text = el?.textContent || '';
    return { size: text.length, sample: text.substring(0, 500), hasFootball: text.includes('Futbol') || text.includes('football') };
  });
  console.log(`Size: ${tsData.size}, Has football: ${tsData.hasFootball}`);
  console.log(`Sample: ${tsData.sample}`);
}

// ══ TEST 5: Use page.content() to check initial HTML ══
console.log('\n=== TEST 5: PAGE SOURCE CHECK ===');
const htmlContent = await page2.content();
console.log(`HTML size: ${htmlContent.length}`);
console.log(`Contains team names: ${htmlContent.includes('Beşiktaş') || htmlContent.includes('Galatasaray') || htmlContent.includes('Arsenal')}`);
// Find embedded JSON data
const jsonMatches = htmlContent.match(/\{[^{}]*"fCnt"[^{}]*\}/g);
console.log(`JSON with fCnt: ${jsonMatches?.length || 0}`);

// Check for script tags with data
const scriptTags = htmlContent.match(/<script[^>]*>[\s\S]{1000,}<\/script>/g);
console.log(`Large script tags: ${scriptTags?.length || 0}`);
for (const s of (scriptTags || []).slice(0, 3)) {
  if (s.includes('fixture') || s.includes('match') || s.includes('team')) {
    console.log(`  Script with match data (${s.length}B): ${s.substring(0, 200)}`);
  }
}

await page2.close();
await browser.close();
console.log('\n=== DONE ===');
