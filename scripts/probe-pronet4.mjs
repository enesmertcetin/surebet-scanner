/**
 * Pronet probe 4 — Find prematch individual match data
 * Imajbet uses "/todays-events/football" route
 * Also test API endpoints and Tulipbet equivalent
 */
import { chromium } from 'playwright';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];

async function probeRoute(domain, route, label) {
  console.log(`\n=== ${label}: ${domain}${route} ===`);
  const page = await ctx.newPage();
  const client = await page.context().newCDPSession(page);
  await client.send('Network.enable');

  const wsCreated = [];
  const apiCalls = [];
  const pendingReqs = {};

  client.on('Network.webSocketCreated', ({ url }) => wsCreated.push(url));
  client.on('Network.requestWillBeSent', ({ requestId, request }) => {
    if (request.url.includes('/mop/') || request.url.includes('/api/v3/')) {
      pendingReqs[requestId] = request.url;
    }
  });
  client.on('Network.responseReceived', async ({ requestId, response }) => {
    if (pendingReqs[requestId]) {
      try {
        const { body } = await client.send('Network.getResponseBody', { requestId });
        apiCalls.push({ url: pendingReqs[requestId], status: response.status, size: body.length, sample: body.substring(0, 300) });
      } catch {}
      delete pendingReqs[requestId];
    }
  });

  try {
    await page.goto(`https://${domain}${route}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(12000);

    // DOM analysis
    const dom = await page.evaluate(() => {
      const url = window.location.href;
      
      // Team names
      const teamEls = document.querySelectorAll('[class*="team-name"], [class*="fixture-team-name"]');
      const teams = [...teamEls].map(e => e.textContent?.trim()?.substring(0, 40));
      
      // Rates/odds
      const rateEls = document.querySelectorAll('.rate');
      const rates = [...rateEls].map(e => e.textContent?.trim());
      
      // Bet buttons
      const betBtns = document.querySelectorAll('[class*="bet-btn"]');
      const bets = [...betBtns].map(e => e.textContent?.trim()?.substring(0, 40));
      
      // Fixture containers
      const fixtures = document.querySelectorAll('.fixture, [class*="fixture-row"], [class*="fixture-container"]');
      
      // Try to get structured data: find parent elements with both teams and odds
      const matchData = [];
      const fixtureItems = document.querySelectorAll('[class*="fixture-info"], [class*="fixture-content"], [class*="prelive-fixture-row"]');
      for (const fx of fixtureItems) {
        const teamNames = [...fx.querySelectorAll('[class*="team-name"]')].map(e => e.textContent?.trim());
        const oddVals = [...fx.querySelectorAll('.rate')].map(e => parseFloat(e.textContent?.trim())).filter(v => !isNaN(v));
        if (teamNames.length >= 2 || oddVals.length >= 3) {
          matchData.push({ teams: teamNames, odds: oddVals.slice(0, 6) });
        }
      }
      
      // Main content text
      const mainText = document.querySelector('[class*="sport-content"], [class*="fixture-container"], [class*="prelive"]')?.innerText?.substring(0, 1500) || '';
      
      return {
        url, 
        teamCount: teams.length, teams: teams.slice(0, 15),
        rateCount: rates.length, rates: rates.slice(0, 20),
        betCount: bets.length, bets: bets.slice(0, 8),
        fixtureCount: fixtures.length,
        structuredData: matchData.slice(0, 5),
        mainText,
      };
    });

    console.log(`  URL: ${dom.url}`);
    console.log(`  Fixtures: ${dom.fixtureCount}, Teams: ${dom.teamCount}, Rates: ${dom.rateCount}, BetBtns: ${dom.betCount}`);
    console.log(`  Teams sample: ${dom.teams.slice(0, 10).join(', ')}`);
    console.log(`  Rates sample: ${dom.rates.slice(0, 15).join(', ')}`);
    console.log(`  Bets sample: ${dom.bets.slice(0, 5).join(' | ')}`);
    console.log(`  Structured: ${dom.structuredData.length} matches`);
    if (dom.structuredData.length > 0) console.log(`  Sample: ${JSON.stringify(dom.structuredData.slice(0, 3))}`);
    console.log(`  WS: ${wsCreated.length}`, wsCreated.map(u => u.substring(0, 80)));
    console.log(`  API calls: ${apiCalls.length}`);
    for (const a of apiCalls) {
      console.log(`    ${a.status} [${a.size}B] ${a.url.substring(0, 120)}`);
      if (a.size > 1000 && a.url.includes('/mop/')) {
        console.log(`      Sample: ${a.sample.substring(0, 200)}`);
      }
    }
    console.log(`  Main text: ${dom.mainText?.substring(0, 500)}`);
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
  }
  await page.close();
}

// Test routes
await probeRoute('imajbet1584.com', '/tr/sport/bet/todays-events/football', 'IMAJBET todays-events');
await probeRoute('tulipbet835.com', '/tr/sport/bet/todays-events/football', 'TULIPBET todays-events');

// Try more MOP API endpoints from Tulipbet page context
console.log('\n=== MOP API ENDPOINT TESTING ===');
const page = await ctx.newPage();
await page.goto('https://tulipbet835.com/tr/sport/bet/main', { waitUntil: 'domcontentloaded', timeout: 20000 });
await sleep(3000);

const endpoints = [
  'todays-events', 'today-events', 'upcoming', 'upcoming-fixture',
  'fixture', 'fixtures', 'match', 'matches', 'event', 'events',
  'prematch-fixture', 'pre-match-fixture', 'scheduled',
  'sport-fixture', 'sport-fixtures', 'outcome', 'outcomes',
  'competition-fixture', 'league-fixture',
];

const domain = 'tulipbet835.com';
for (const ep of endpoints) {
  const body = JSON.stringify({ requestBody: { sportTypeId: 170 } });
  const enc = Buffer.from(encodeURIComponent(body)).toString('base64');
  const url = `https://${domain}/api/v3/mop/${ep}/d/1/${domain}/${enc}`;
  try {
    const r = await page.evaluate(async (u) => {
      const resp = await fetch(u);
      return { s: resp.status, body: (await resp.text()).substring(0, 150) };
    }, url);
    if (r.s !== 404) console.log(`  ${ep}: ${r.s} → ${r.body.substring(0, 120)}`);
  } catch(e) { }
}

// Also try with different param structures
for (const ep of ['antepost-fixture', 'fixture-search', 'popular-fixture', 'left-menu']) {
  // Try with empty body
  const body = JSON.stringify({ requestBody: {} });
  const enc = Buffer.from(encodeURIComponent(body)).toString('base64');
  const url = `https://${domain}/api/v3/mop/${ep}/d/1/${domain}/${enc}`;
  try {
    const r = await page.evaluate(async (u) => {
      const resp = await fetch(u);
      const text = await resp.text();
      return { s: resp.status, len: text.length, body: text.substring(0, 200) };
    }, url);
    console.log(`  ${ep} (empty): ${r.s} [${r.len}B] → ${r.body.substring(0, 150)}`);
  } catch(e) {}
}

await page.close();
await browser.close();
console.log('\n=== DONE ===');
