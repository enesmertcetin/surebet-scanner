/**
 * Pronet Gaming (Tulipbet/Imajbet) prematch data source probe
 * Tests: WS endpoints, REST APIs, live-full parsing, DOM structure
 */
import { chromium } from 'playwright';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];

const domain = 'tulipbet835.com';
const wsBase = 'wss://bragi-ws.pronetgaming.eu';
const wsParams = '?X-Atmosphere-tracking-id=0&X-Atmosphere-Framework=4.0.1&X-Atmosphere-Transport=websocket&Content-Type=application/json';

const page = await ctx.newPage();
await page.goto(`https://${domain}/tr/sport/bet/main`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await sleep(5000);

// ══ TEST 1: Try different bragi WS paths ══
console.log('=== TEST 1: WS ENDPOINT TESTING ===');
const paths = [
  `/overview/${domain}/1/0`,
  `/prematch/${domain}/1/0`,
  `/pre-match/${domain}/1/0`,
  `/overview/${domain}/0/0`,
  `/overview/${domain}/2/0`,
  `/overview/${domain}/1/1`,
  `/overview/${domain}/0/1`,
  `/prematch-overview/${domain}/1/0`,
  `/sport/${domain}/1/0`,
  `/detail/${domain}/1/0`,
];
for (const path of paths) {
  const url = wsBase + path + wsParams;
  try {
    const r = await page.evaluate(async (u) => {
      return new Promise(res => {
        try {
          const ws = new WebSocket(u);
          const t = setTimeout(() => { try{ws.close();}catch{} res({ s:'timeout' }); }, 6000);
          ws.onmessage = e => {
            clearTimeout(t); ws.close();
            const d = e.data?.toString() || '';
            let type = '?';
            try { const p = JSON.parse(d); if(p.ms?.[0]?.t) type = p.ms[0].t; } catch{}
            res({ s:'ok', len:d.length, type, head: d.substring(0,120) });
          };
          ws.onerror = () => { clearTimeout(t); res({ s:'error' }); };
          ws.onclose = ev => { clearTimeout(t); res({ s:'closed', code:ev.code }); };
        } catch(e) { res({ s:'exc', m:e.message }); }
      });
    }, url);
    console.log(`  ${path} → ${JSON.stringify(r)}`);
  } catch(e) { console.log(`  ${path} → FAIL: ${e.message}`); }
}

// ══ TEST 2: Parse live-full deeply — check seasons for fixture data ══
console.log('\n=== TEST 2: PARSE LIVE-FULL DEEP ===');
const deepResult = await page.evaluate(async (wsUrl) => {
  return new Promise(res => {
    const ws = new WebSocket(wsUrl);
    const t = setTimeout(() => { ws.close(); res({ error:'timeout' }); }, 15000);
    ws.onmessage = e => {
      clearTimeout(t); ws.close();
      try {
        const d = JSON.parse(e.data);
        const msg = d.ms?.[0];
        if (msg?.t !== 'live-full' || !msg.d?.fD) return res({ error: 'not live-full' });
        
        const fb = msg.d.fD.find(s => s.stId === 170);
        if (!fb) return res({ error: 'no football' });
        
        // Deep inspect first category → first season
        const cat0 = fb.cs?.[0];
        const sea0 = cat0?.sns?.[0];
        const seasonKeys = sea0 ? Object.keys(sea0) : [];
        const seasonJSON = sea0 ? JSON.stringify(sea0).substring(0, 1000) : 'none';
        
        // Check ALL sports for lvt values
        const sportInfo = msg.d.fD.map(s => ({ stId: s.stId, stN: s.stN, lvt: s.lvt, fCnt: s.fCnt }));
        
        // Check if message has any non-live data
        const allData = JSON.stringify(msg.d);
        const hasPrematch = allData.includes('prematch') || allData.includes('pre-match');
        const hasLvtFalse = allData.includes('"lvt":false');
        
        res({
          msgType: msg.t,
          totalSports: msg.d.fD.length,
          sportInfo: sportInfo.slice(0, 10),
          football: { fCnt: fb.fCnt, lvt: fb.lvt, catCount: fb.cs?.length },
          firstCat: { cN: cat0?.cN, fCnt: cat0?.fCnt, seasonCount: cat0?.sns?.length },
          firstSeason: { keys: seasonKeys, data: seasonJSON },
          hasPrematch, hasLvtFalse,
        });
      } catch(err) { res({ error: err.message }); }
    };
    ws.onerror = () => { clearTimeout(t); res({ error:'ws error' }); };
  });
}, wsBase + `/overview/${domain}/1/0` + wsParams);
console.log(JSON.stringify(deepResult, null, 2));

// ══ TEST 3: Collect streaming msgs for 15s ══
console.log('\n=== TEST 3: STREAMING MESSAGES (15s) ===');
const streamResult = await page.evaluate(async (wsUrl) => {
  return new Promise(res => {
    const ws = new WebSocket(wsUrl);
    let gotInit = false;
    const stats = { total: 0, types: {}, footballFixtures: [], footballOddBtgs: {} };
    const t = setTimeout(() => { ws.close(); res(stats); }, 15000);
    ws.onmessage = e => {
      try {
        const d = JSON.parse(e.data);
        if (d.eventType === 'UPDATE_FIXTURE_ODD' && d.fixtureOdd?.sportTypeId === 170) {
          const btg = d.fixtureOdd.btgId;
          if (!stats.footballOddBtgs[btg]) stats.footballOddBtgs[btg] = { count: 0, sample: null };
          stats.footballOddBtgs[btg].count++;
          if (!stats.footballOddBtgs[btg].sample) stats.footballOddBtgs[btg].sample = d.fixtureOdd;
          return;
        }
        if (!d.ms) return;
        for (const m of d.ms) {
          stats.total++;
          stats.types[m.t] = (stats.types[m.t] || 0) + 1;
          if (gotInit && m.t === 'add-fixture' && m.d?.stId === 170) {
            const f = m.d.f;
            stats.footballFixtures.push({
              fId: f?.fId, home: f?.hcN, away: f?.acN,
              fsd: f?.fsd, isPre: f?.fsd > Date.now(),
              keysSample: f ? Object.keys(f).join(',') : '',
            });
          }
          if (m.t === 'add-fixture-odd' && m.d?.stId === 170) {
            const fo = m.d.fo;
            if (fo?.btN && !stats.footballOddBtgs['add_' + m.d.btgId]) {
              stats.footballOddBtgs['add_' + m.d.btgId] = { btN: fo.btN, hO: fo.hO, hSh: fo.hSh, oc: fo.oc };
            }
          }
          if (m.t === 'live-full') gotInit = true;
        }
      } catch{}
    };
    ws.onerror = () => { clearTimeout(t); res(stats); };
  });
}, wsBase + `/overview/${domain}/1/0` + wsParams);
console.log('Types:', JSON.stringify(streamResult.types));
console.log('Football fixtures added:', streamResult.footballFixtures.length);
if (streamResult.footballFixtures.length > 0) {
  console.log('Sample fixtures:', JSON.stringify(streamResult.footballFixtures.slice(0, 3), null, 2));
}
console.log('Football odd btgIds:', JSON.stringify(streamResult.footballOddBtgs, null, 2));

// ══ TEST 4: REST API left-menu with different time ranges ══
console.log('\n=== TEST 4: LEFT-MENU VARIATIONS ===');
for (const params of [
  { timeRangeInHours: null },
  { timeRangeInHours: 24 },
  { timeRangeInHours: 168 },
  { timeRangeInHours: 720 },
  {},
]) {
  const body = JSON.stringify({ requestBody: params });
  const enc = Buffer.from(encodeURIComponent(body)).toString('base64');
  const url = `https://${domain}/api/v3/mop/left-menu/d/1/${domain}/${enc}`;
  try {
    const r = await page.evaluate(async (u) => {
      const resp = await fetch(u);
      const data = await resp.json();
      const fb = data?.d?.find(s => s.stId === 170);
      return { st: resp.status, sports: data?.d?.length, fbOk: !!fb, fbFCnt: fb?.fCnt||0, fbCats: fb?.cs?.length||0, fbLvt: fb?.lvt };
    }, url);
    console.log(`  ${JSON.stringify(params)} → ${JSON.stringify(r)}`);
  } catch(e) { console.log(`  ${JSON.stringify(params)} → ERR: ${e.message}`); }
}

// ══ TEST 5: CDP capture - navigate to prematch football ══
console.log('\n=== TEST 5: NAVIGATE PREMATCH + CDP CAPTURE ===');
const page2 = await ctx.newPage();
const client = await page2.context().newCDPSession(page2);
await client.send('Network.enable');

const wsCreated = [];
const apiCalls = [];
client.on('Network.webSocketCreated', ({ url }) => wsCreated.push(url));
client.on('Network.responseReceived', ({ response }) => {
  if (response.url.includes('/api/')) apiCalls.push(`${response.status} ${response.url.substring(0, 150)}`);
});

await page2.goto(`https://${domain}/tr/sport/bet/main`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await sleep(10000);
console.log('Initial WS:', wsCreated);
console.log('Initial API calls:', apiCalls.length);

// Try clicking prematch
const click1 = await page2.evaluate(() => {
  const all = [...document.querySelectorAll('*')];
  for (const el of all) {
    const t = el.textContent?.trim();
    if ((t === 'Maç Öncesi' || t === 'Pre Match' || t === 'Prematch') && el.children.length < 3) {
      el.click(); return `clicked: ${el.tagName} "${t}"`;
    }
  }
  // Fallback: find any element containing the text
  for (const el of all) {
    if (el.innerText?.trim()?.startsWith('Maç Öncesi') && el.children.length < 5) {
      el.click(); return `clicked(fb): ${el.tagName} "${el.innerText.trim().substring(0,30)}"`;
    }
  }
  return 'not found';
});
console.log('Prematch click:', click1);
await sleep(8000);

const newWS = wsCreated.slice();
const newAPI = apiCalls.slice();
console.log('After prematch - new WS:', newWS.length, newWS);
console.log('After prematch - new API:', newAPI.length);
for (const a of newAPI.slice(-10)) console.log('  ', a);

// Click football
const click2 = await page2.evaluate(() => {
  const all = [...document.querySelectorAll('*')];
  for (const el of all) {
    const t = el.textContent?.trim();
    if ((t === 'Futbol' || t === 'Football') && el.children.length < 3) {
      el.click(); return `clicked: ${el.tagName} "${t}"`;
    }
  }
  return 'not found';
});
console.log('Football click:', click2);
await sleep(8000);

console.log('After football - WS total:', wsCreated.length, wsCreated.slice(-3));
console.log('After football - API total:', apiCalls.length);
for (const a of apiCalls.slice(-10)) console.log('  ', a);

// ══ TEST 6: DOM scraping ══
console.log('\n=== TEST 6: DOM SCRAPE ===');
const dom = await page2.evaluate(() => {
  const r = {};
  
  // Find all visible text blocks that look like team names + odds  
  const oddEls = document.querySelectorAll('[class*="odd"], [class*="price"], [class*="coeff"], [class*="rate"], [class*="btn-bet"]');
  r.oddCount = oddEls.length;
  r.oddSamples = [...oddEls].slice(0, 8).map(e => ({ cls: e.className?.substring(0,60), txt: e.textContent?.trim()?.substring(0,30) }));
  
  const matchEls = document.querySelectorAll('[class*="fixture"], [class*="match"], [class*="event"], [class*="row"]');
  r.matchCount = matchEls.length;
  r.matchSamples = [...matchEls].slice(0, 5).map(e => ({ cls: e.className?.substring(0,60), txt: e.textContent?.trim()?.substring(0,120) }));

  const teamEls = document.querySelectorAll('[class*="team"], [class*="competitor"], [class*="participant"]');
  r.teamCount = teamEls.length;
  r.teamSamples = [...teamEls].slice(0, 5).map(e => ({ cls: e.className?.substring(0,60), txt: e.textContent?.trim()?.substring(0,50) }));
  
  // Check Angular
  r.angular = !!document.querySelector('[_nghost-ng-c]') || !!document.querySelector('app-root');
  r.bodyClasses = document.body.className?.substring(0, 100);
  
  // Get main content text
  const main = document.querySelector('main, [class*="content"], [class*="sport"]');
  r.mainText = (main || document.body).innerText?.substring(0, 1500);
  
  return r;
});
console.log('Odd elements:', dom.oddCount, 'samples:', JSON.stringify(dom.oddSamples));
console.log('Match elements:', dom.matchCount);
console.log('Team elements:', dom.teamCount, 'samples:', JSON.stringify(dom.teamSamples));
console.log('Angular:', dom.angular, 'Body classes:', dom.bodyClasses);
console.log('Main text (first 800):\n', dom.mainText?.substring(0, 800));

await page2.close();
await page.close();
await browser.close();
console.log('\n=== DONE ===');
