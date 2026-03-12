/**
 * Pronet Gaming probe 3 — ANTEPOST (prematch) page data extraction
 * Key finding: prematch data is at /tr/sport/bet/antepost/football
 */
import { chromium } from 'playwright';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];

const TUL = 'tulipbet835.com';

// ══ Open antepost/football page with full CDP interception ══
console.log('=== ANTEPOST FOOTBALL PAGE ===');
const page = await ctx.newPage();
const client = await page.context().newCDPSession(page);
await client.send('Network.enable');

const wsData = {};
const apiResponses = [];

client.on('Network.webSocketCreated', ({ requestId, url }) => {
  console.log(`  WS Created: ${url.substring(0, 100)}`);
  wsData[requestId] = { url, recvCount: 0, recvSize: 0, firstMsg: null, types: new Set() };
});

client.on('Network.webSocketFrameReceived', ({ requestId, response }) => {
  const ws = wsData[requestId];
  if (!ws) return;
  ws.recvCount++;
  ws.recvSize += response.payloadData.length;
  if (!ws.firstMsg && response.payloadData.length > 100) {
    ws.firstMsg = response.payloadData.substring(0, 300);
  }
  try {
    const d = JSON.parse(response.payloadData);
    if (d.ms) for (const m of d.ms) ws.types.add(m.t);
    if (d.eventType) ws.types.add(d.eventType);
  } catch {}
});

// Capture API responses with bodies
const pendingRequests = {};
client.on('Network.requestWillBeSent', ({ requestId, request }) => {
  if (request.url.includes('/mop/') || request.url.includes('/api/v3/')) {
    pendingRequests[requestId] = request.url;
  }
});

client.on('Network.responseReceived', async ({ requestId, response }) => {
  if (pendingRequests[requestId]) {
    try {
      const { body } = await client.send('Network.getResponseBody', { requestId });
      apiResponses.push({
        url: pendingRequests[requestId].substring(0, 150),
        status: response.status,
        bodyLen: body.length,
        bodySample: body.substring(0, 500),
      });
    } catch {}
    delete pendingRequests[requestId];
  }
});

console.log(`Navigating to https://${TUL}/tr/sport/bet/antepost/football ...`);
await page.goto(`https://${TUL}/tr/sport/bet/antepost/football`, { 
  waitUntil: 'domcontentloaded', timeout: 30000 
});
await sleep(15000);

// Report WS
console.log('\n--- WebSocket Summary ---');
for (const [id, ws] of Object.entries(wsData)) {
  console.log(`  ${ws.url.substring(0, 100)}`);
  console.log(`    Msgs: ${ws.recvCount}, Size: ${(ws.recvSize/1024).toFixed(0)}KB, Types: ${[...ws.types].join(', ')}`);
  if (ws.firstMsg) console.log(`    First: ${ws.firstMsg.substring(0, 200)}`);
}

// Report API
console.log('\n--- API Responses ---');
for (const r of apiResponses) {
  console.log(`  ${r.status} ${r.url}`);
  console.log(`    Size: ${r.bodyLen}, Sample: ${r.bodySample.substring(0, 200)}`);
}

// ══ DOM Scrape of antepost page ══
console.log('\n--- DOM Analysis ---');
const dom = await page.evaluate(() => {
  const result = {};
  
  // Check current URL
  result.url = window.location.href;
  
  // Find fixture/match containers
  const fixtures = document.querySelectorAll('[class*="fixture"], [class*="match"], [class*="event-row"]');
  result.fixtureCount = fixtures.length;
  
  // Try to find match rows with team names and odds
  const matchRows = [];
  
  // Strategy 1: Look for elements with fixture-team-name class
  document.querySelectorAll('[class*="fixture-team-name"], [class*="team-name"]').forEach(el => {
    matchRows.push({ type: 'team', cls: el.className?.substring(0, 50), text: el.textContent?.trim()?.substring(0, 50) });
  });
  result.teamNames = matchRows.slice(0, 20);
  
  // Strategy 2: Look for bet buttons with odds
  const betBtns = [];
  document.querySelectorAll('[class*="bet-btn"], [class*="btn-bet"], [class*="odd-btn"]').forEach(el => {
    betBtns.push({ cls: el.className?.substring(0, 60), text: el.textContent?.trim()?.substring(0, 30) });
  });
  result.betButtons = betBtns.slice(0, 20);
  result.betButtonTotal = betBtns.length;
  
  // Strategy 3: Look for rate/odd values
  const rates = [];
  document.querySelectorAll('.rate, [class*="odd-value"], [class*="price"]').forEach(el => {
    rates.push(el.textContent?.trim());
  });
  result.rates = rates.slice(0, 30);
  result.rateTotal = rates.length;
  
  // Strategy 4: Find fixture rows - parent elements containing both team names and odds
  const fixtureRows = document.querySelectorAll('[class*="fixture-row"], [class*="event-row"], [class*="match-row"], .fixture, [class*="antepost"]');
  result.fixtureRowCount = fixtureRows.length;
  result.fixtureRowSamples = [...fixtureRows].slice(0, 3).map(el => ({
    cls: el.className?.substring(0, 80),
    text: el.textContent?.trim()?.substring(0, 200),
    html: el.innerHTML?.substring(0, 500),
  }));
  
  // Strategy 5: Angular component analysis
  const ngComponents = new Set();
  document.querySelectorAll('*').forEach(el => {
    if (el.tagName.includes('-') && el.tagName.startsWith('APP-')) {
      ngComponents.add(el.tagName.toLowerCase());
    }
  });
  result.angularComponents = [...ngComponents].slice(0, 20);
  
  // Strategy 6: Look at the main content area
  const mainContent = document.querySelector('[class*="antepost"], [class*="prematch"], [class*="sport-content"], .main-content, main');
  result.mainContentText = mainContent?.innerText?.substring(0, 1000) || 'not found';
  
  // Strategy 7: Get all visible match-like text patterns
  const bodyText = document.body.innerText || '';
  const matchPatterns = bodyText.match(/[\w\s]+vs[\w\s]+|[\w\s]+[-–][\w\s]+/gi);
  result.matchPatterns = matchPatterns?.slice(0, 10);
  
  // Strategy 8: Check league/category headers
  const headers = [];
  document.querySelectorAll('[class*="league"], [class*="category"], [class*="competition"], [class*="header-title"]').forEach(el => {
    headers.push({ cls: el.className?.substring(0, 50), text: el.textContent?.trim()?.substring(0, 60) });
  });
  result.leagueHeaders = headers.slice(0, 10);
  
  return result;
});

console.log('URL:', dom.url);
console.log('Fixture elements:', dom.fixtureCount);
console.log('Angular components:', dom.angularComponents);
console.log('Team names:', JSON.stringify(dom.teamNames?.slice(0, 10)));
console.log('Bet buttons:', dom.betButtonTotal, 'samples:', JSON.stringify(dom.betButtons?.slice(0, 10)));
console.log('Rates:', dom.rateTotal, 'samples:', dom.rates?.slice(0, 20));
console.log('League headers:', JSON.stringify(dom.leagueHeaders));
console.log('Fixture rows:', dom.fixtureRowCount, 'samples:', JSON.stringify(dom.fixtureRowSamples?.slice(0, 2)));
console.log('Match patterns:', dom.matchPatterns);
console.log('\nMain content (first 500):', dom.mainContentText?.substring(0, 500));

// ══ Try to extract structured match data ══
console.log('\n--- Structured Data Extraction ---');
const matchData = await page.evaluate(() => {
  const matches = [];
  
  // Look for fixture containers with team info + odds
  const fixtureEls = document.querySelectorAll('.fixture, [class*="fixture-container"], [class*="fixture-row"]');
  
  for (const fx of fixtureEls) {
    // Get team names
    const teamEls = fx.querySelectorAll('[class*="team-name"], [class*="fixture-team"]');
    const teams = [...teamEls].map(el => el.textContent?.trim());
    
    // Get odds
    const oddEls = fx.querySelectorAll('.rate, [class*="odd"], [class*="bet-rate"]');
    const odds = [...oddEls].map(el => {
      const val = parseFloat(el.textContent?.trim());
      return isNaN(val) ? null : val;
    }).filter(v => v !== null);
    
    if (teams.length >= 2 && odds.length >= 3) {
      matches.push({
        home: teams[0],
        away: teams[1] || teams[teams.length - 1],
        odds: odds.slice(0, 6), // first 6 odds (might include 1X2 and more)
        allText: fx.textContent?.trim()?.substring(0, 200),
      });
    }
  }
  
  // Fallback: try parent containers
  if (matches.length === 0) {
    const rows = document.querySelectorAll('[class*="antepost-fixture"], [class*="event-fixture"], tr[class*="fixture"]');
    for (const row of rows) {
      const text = row.textContent?.trim();
      const oddVals = [...row.querySelectorAll('.rate, [class*="odd-val"]')].map(e => parseFloat(e.textContent?.trim())).filter(v => !isNaN(v));
      if (oddVals.length >= 3) {
        matches.push({ text: text?.substring(0, 150), odds: oddVals.slice(0, 6) });
      }
    }
  }
  
  return { count: matches.length, matches: matches.slice(0, 10) };
});
console.log('Extracted matches:', matchData.count);
console.log(JSON.stringify(matchData.matches?.slice(0, 5), null, 2));

await page.close();
await browser.close();
console.log('\n=== DONE ===');
