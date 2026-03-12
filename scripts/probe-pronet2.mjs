/**
 * Pronet Gaming probe 2 — deeper investigation
 * 1. Check if live-full has prematch fixtures (isLive: false)
 * 2. Try prematch URL routes
 * 3. Examine page navigation
 * 4. Test Imajbet too
 */
import { chromium } from 'playwright';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];

const TUL = 'tulipbet835.com';
const IMA = 'imajbet1584.com';
const wsBase = 'wss://bragi-ws.pronetgaming.eu';
const wsParams = '?X-Atmosphere-tracking-id=0&X-Atmosphere-Framework=4.0.1&X-Atmosphere-Transport=websocket&Content-Type=application/json';

// ══ TEST 1: Deep analyze live-full football fixtures ══
console.log('=== TEST 1: LIVE-FULL FOOTBALL FIXTURE ANALYSIS ===');
const page1 = await ctx.newPage();
await page1.goto(`https://${TUL}/tr/sport/bet/main`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await sleep(3000);

const fixtureAnalysis = await page1.evaluate(async (wsUrl) => {
  return new Promise(resolve => {
    const ws = new WebSocket(wsUrl);
    const t = setTimeout(() => { ws.close(); resolve({ error: 'timeout' }); }, 20000);
    ws.onmessage = e => {
      clearTimeout(t); ws.close();
      try {
        const d = JSON.parse(e.data);
        const msg = d.ms?.[0];
        if (msg?.t !== 'live-full') return resolve({ error: 'not live-full' });
        
        const fb = msg.d.fD.find(s => s.stId === 170);
        if (!fb) return resolve({ error: 'no football' });
        
        let totalFixtures = 0, liveCount = 0, prematchCount = 0;
        const now = Date.now();
        const prematchSamples = [];
        const liveSamples = [];
        const allBtgIds = new Set();
        
        for (const cat of (fb.cs || [])) {
          for (const sea of (cat.sns || [])) {
            for (const fx of (sea.fs || [])) {
              totalFixtures++;
              if (fx.isLive) {
                liveCount++;
                if (liveSamples.length < 2) liveSamples.push({
                  fId: fx.fId, home: fx.hcN, away: fx.acN,
                  fsd: fx.fsd, isLive: fx.isLive,
                  keys: Object.keys(fx).join(','),
                });
              } else {
                prematchCount++;
                if (prematchSamples.length < 5) prematchSamples.push({
                  fId: fx.fId, home: fx.hcN, away: fx.acN,
                  fsd: fx.fsd, isLive: fx.isLive, 
                  futureMin: Math.round((fx.fsd - now) / 60000),
                  keys: Object.keys(fx).join(','),
                });
              }
            }
          }
        }
        
        // Check sports with lvt: false
        const nonLiveSports = msg.d.fD.filter(s => !s.lvt).map(s => ({ stId: s.stId, stN: s.stN, fCnt: s.fCnt }));
        
        resolve({
          totalFixtures, liveCount, prematchCount,
          liveSamples, prematchSamples,
          nonLiveSports,
          catCount: fb.cs?.length,
        });
      } catch(e) { resolve({ error: e.message }); }
    };
    ws.onerror = () => { clearTimeout(t); resolve({ error: 'ws error' }); };
  });
}, wsBase + `/overview/${TUL}/1/0` + wsParams);
console.log(JSON.stringify(fixtureAnalysis, null, 2));
await page1.close();

// ══ TEST 2: Try prematch URL routes ══
console.log('\n=== TEST 2: PREMATCH URL ROUTES ===');
const routes = [
  '/tr/sport/bet/prematch',
  '/tr/sport/prematch',
  '/tr/sport/bet/pre-match',
  '/tr/sport/pre-match',
  '/tr/sport/bet/prematch/event-view',
  '/tr/sport/bet/prematch/football',
  '/tr/sport/bet/pre-match/event-view',
  '/tr/sports/pre-match/event-view',
  '/tr/sport/bet/main/prematch',
  '/tr/sport/bet',
];

for (const route of routes) {
  const page = await ctx.newPage();
  const client = await page.context().newCDPSession(page);
  await client.send('Network.enable');
  
  const wsUrls = [];
  client.on('Network.webSocketCreated', ({ url }) => wsUrls.push(url));
  
  try {
    const resp = await page.goto(`https://${TUL}${route}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await sleep(3000);
    
    // Check what's visible
    const info = await page.evaluate(() => {
      const bodyText = document.body?.innerText?.substring(0, 200) || '';
      const hasFixtures = document.querySelectorAll('[class*="fixture"]').length;
      const url = window.location.href;
      return { url, bodyLen: bodyText.length, hasFixtures, text: bodyText.substring(0, 100) };
    });
    
    console.log(`  ${route} → status:${resp?.status()} url:${info.url} fixtures:${info.hasFixtures} ws:${wsUrls.length}`);
    if (wsUrls.length > 0) {
      for (const u of wsUrls) console.log(`    WS: ${u.substring(0, 100)}`);
    }
  } catch(e) {
    console.log(`  ${route} → ERR: ${e.message.substring(0, 60)}`);
  }
  await page.close();
}

// ══ TEST 3: Get ALL navigation links from sports page ══
console.log('\n=== TEST 3: NAVIGATION ANALYSIS ===');
const page3 = await ctx.newPage();
await page3.goto(`https://${TUL}/tr/sport/bet/main`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await sleep(8000);

const navInfo = await page3.evaluate(() => {
  const links = [];
  // All <a> tags
  document.querySelectorAll('a[href]').forEach(el => {
    const href = el.getAttribute('href');
    const text = el.textContent?.trim()?.substring(0, 40);
    if (href && text && (href.includes('sport') || href.includes('bet') || href.includes('prematch') || href.includes('pre-match'))) {
      links.push({ href, text });
    }
  });
  
  // All elements with routerLink
  document.querySelectorAll('[routerlink], [routerLink]').forEach(el => {
    links.push({ routerLink: el.getAttribute('routerlink') || el.getAttribute('routerLink'), text: el.textContent?.trim()?.substring(0, 40) });
  });
  
  // Look for angular router-outlet contents
  const routerOutlet = document.querySelector('router-outlet');
  const afterRouter = routerOutlet?.nextElementSibling;
  
  // Get all visible top-level nav items
  const topNav = [];
  document.querySelectorAll('nav a, .nav a, [class*="header"] a, [class*="menu"] a, [class*="navigation"] a').forEach(el => {
    topNav.push({ href: el.getAttribute('href'), text: el.textContent?.trim()?.substring(0, 40) });
  });
  
  // Find sport sub-navigation (tabs like Live, Prematch)
  const sportTabs = [];
  document.querySelectorAll('[class*="tab"], [class*="switch"], [role="tab"], [class*="filter"], [class*="toggle"]').forEach(el => {
    const text = el.textContent?.trim();
    if (text && text.length < 50) sportTabs.push({ cls: el.className?.substring(0, 50), text });
  });
  
  // Find radio buttons or toggle switches
  const toggles = [];
  document.querySelectorAll('input[type="radio"], [class*="radio"], [class*="segment"]').forEach(el => {
    toggles.push({ tag: el.tagName, cls: el.className?.substring(0, 50), text: el.textContent?.trim()?.substring(0, 30), checked: el.checked });
  });
  
  return { links: links.slice(0, 20), topNav: topNav.slice(0, 15), sportTabs: sportTabs.slice(0, 15), toggles: toggles.slice(0, 10), routerInfo: !!routerOutlet };
});
console.log('Links:', JSON.stringify(navInfo.links, null, 2));
console.log('Top nav:', JSON.stringify(navInfo.topNav, null, 2));
console.log('Sport tabs:', JSON.stringify(navInfo.sportTabs, null, 2));
console.log('Toggles:', JSON.stringify(navInfo.toggles, null, 2));
console.log('Has router-outlet:', navInfo.routerInfo);
await page3.close();

// ══ TEST 4: Quick check Imajbet ══
console.log('\n=== TEST 4: IMAJBET QUICK CHECK ===');
const page4 = await ctx.newPage();
const client4 = await page4.context().newCDPSession(page4);
await client4.send('Network.enable');

const imaWS = [];
client4.on('Network.webSocketCreated', ({ url }) => imaWS.push(url));

await page4.goto(`https://${IMA}/tr/sport/bet/main`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await sleep(8000);

console.log('Imajbet WS:', imaWS);

const imaNav = await page4.evaluate(() => {
  const tabs = [];
  document.querySelectorAll('[class*="tab"], [class*="switch"], [class*="filter"], [class*="toggle"], [class*="link-left"], [class*="sport-type"]').forEach(el => {
    const text = el.textContent?.trim();
    if (text && text.length < 50) tabs.push({ cls: el.className?.substring(0, 60), text });
  });
  
  const links = [];
  document.querySelectorAll('a[href]').forEach(el => {
    const href = el.getAttribute('href');
    const text = el.textContent?.trim()?.substring(0, 40);
    if (href && (href.includes('prematch') || href.includes('pre-match') || href.includes('sport'))) {
      links.push({ href, text });
    }
  });
  
  // Check visible main text
  const mainText = document.body?.innerText?.substring(0, 500);
  
  return { tabs: tabs.slice(0, 15), links: links.slice(0, 10), mainText };
});
console.log('Imajbet tabs:', JSON.stringify(imaNav.tabs, null, 2));
console.log('Imajbet links:', JSON.stringify(imaNav.links, null, 2));
console.log('Imajbet text:', imaNav.mainText?.substring(0, 400));

await page4.close();
await browser.close();
console.log('\n=== DONE ===');
