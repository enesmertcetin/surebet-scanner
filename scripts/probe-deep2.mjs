import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const context = browser.contexts()[0];

// ── PROBE Poliwin XHR/Fetch calls ──
console.log('\n[POL] Intercepting all XHR/fetch...');
{
  const page = await context.newPage();
  const apiCalls = [];
  
  page.on('request', req => {
    const url = req.url();
    if (req.resourceType() === 'xhr' || req.resourceType() === 'fetch') {
      if (!url.includes('.js') && !url.includes('recaptcha') && !url.includes('google') && !url.includes('walletconnect')) {
        apiCalls.push({ method: req.method(), url: url.slice(0, 250), post: req.postData()?.slice(0, 400) });
      }
    }
  });

  try {
    await page.goto('https://www.poliwin184.com/tr/sports/pre-match/event-view', { 
      waitUntil: 'domcontentloaded', timeout: 30000 
    });
    await page.waitForTimeout(15000);
    
    console.log(`\nCaptured ${apiCalls.length} XHR/fetch calls:`);
    for (const c of apiCalls.slice(0, 30)) {
      console.log(`  ${c.method} ${c.url}`);
      if (c.post) console.log(`    → ${c.post}`);
    }
  } catch (e) {
    console.log('ERROR:', e.message.slice(0, 100));
  }
  await page.close();
}

// ── PROBE Tulipbet MOP API - get left menu and sport events ──
console.log('\n\n[TUL] Probing MOP API for football prematch...');
{
  const page = await context.newPage();
  
  // Helper: encode request body for MOP API
  function encodeMopBody(body) {
    const json = JSON.stringify({ requestBody: body });
    const urlEncoded = encodeURIComponent(json);
    return Buffer.from(urlEncoded).toString('base64');
  }
  
  const domain = 'tulipbet835.com';
  const base = `https://${domain}`;
  
  try {
    await page.goto(`${base}/tr/sport/bet/main`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    
    // 1) Get left menu (sport types)
    const leftMenuBody = encodeMopBody({ timeRangeInHours: null });
    const leftMenuUrl = `${base}/api/v3/mop/left-menu/d/1/${domain}/${leftMenuBody}`;
    console.log('Left menu URL:', leftMenuUrl);
    
    const leftMenu = await page.evaluate(async (url) => {
      const r = await fetch(url);
      return r.json();
    }, leftMenuUrl);
    
    // Find football/soccer
    const football = leftMenu?.data?.find(s => s.sportTypeId === 1 || s.name?.toLowerCase().includes('futbol') || s.name?.toLowerCase().includes('soccer'));
    console.log('Football:', JSON.stringify(football).slice(0, 300));
    
    // 2) Get today sport types
    const todayBody = encodeMopBody({});
    const todayUrl = `${base}/api/v3/mop/today-sport-types/d/1/${domain}/${todayBody}`;
    const todayData = await page.evaluate(async (url) => {
      const r = await fetch(url);
      return r.json();
    }, todayUrl);
    console.log('\nToday data (first 500):', JSON.stringify(todayData).slice(0, 500));
    
    // 3) Try prematch endpoint
    const prematchBody = encodeMopBody({ sportTypeId: 1, timeRangeInHours: null });
    const prematchUrl = `${base}/api/v3/mop/prematch/d/1/${domain}/${encodeMopBody({ sportTypeId: 1, timeRangeInHours: null })}`;
    console.log('\nTrying prematch URL:', prematchUrl.slice(0, 200));
    
    const prematch = await page.evaluate(async (url) => {
      try {
        const r = await fetch(url);
        return { status: r.status, data: await r.text().then(t => t.slice(0, 1000)) };
      } catch (e) {
        return { error: e.message };
      }
    }, prematchUrl);
    console.log('Prematch result:', JSON.stringify(prematch).slice(0, 500));
    
    // 4) Try event-list endpoint
    const eventListUrl = `${base}/api/v3/mop/event-list/d/1/${domain}/${encodeMopBody({ sportTypeId: 1, timeRangeInHours: null })}`;
    const eventList = await page.evaluate(async (url) => {
      try {
        const r = await fetch(url);
        return { status: r.status, data: await r.text().then(t => t.slice(0, 1000)) };
      } catch (e) {
        return { error: e.message };
      }
    }, eventListUrl);
    console.log('\nEvent-list result:', JSON.stringify(eventList).slice(0, 500));
    
    // 5) Try sport-events 
    const sportEventsUrl = `${base}/api/v3/mop/sport-events/d/1/${domain}/${encodeMopBody({ sportTypeId: 1 })}`;
    const sportEvents = await page.evaluate(async (url) => {
      try {
        const r = await fetch(url);
        return { status: r.status, data: await r.text().then(t => t.slice(0, 1000)) };
      } catch (e) {
        return { error: e.message };
      }
    }, sportEventsUrl);
    console.log('\nSport-events result:', JSON.stringify(sportEvents).slice(0, 500));
    
    // 6) Try matches-by-sport
    const matchesBySportUrl = `${base}/api/v3/mop/matches-by-sport/d/1/${domain}/${encodeMopBody({ sportTypeId: 1 })}`;
    const matchesBySport = await page.evaluate(async (url) => {
      try {
        const r = await fetch(url);
        return { status: r.status, data: await r.text().then(t => t.slice(0, 1000)) };
      } catch (e) {
        return { error: e.message };
      }
    }, matchesBySportUrl);
    console.log('\nMatches-by-sport result:', JSON.stringify(matchesBySport).slice(0, 500));
    
    // 7) Try leagues list
    const leaguesUrl = `${base}/api/v3/mop/leagues/d/1/${domain}/${encodeMopBody({ sportTypeId: 1 })}`;
    const leaguesList = await page.evaluate(async (url) => {
      try {
        const r = await fetch(url);
        return { status: r.status, data: await r.text().then(t => t.slice(0, 1000)) };
      } catch (e) {
        return { error: e.message };
      }
    }, leaguesUrl);
    console.log('\nLeagues result:', JSON.stringify(leaguesList).slice(0, 500));
    
  } catch (e) {
    console.log('ERROR:', e.message.slice(0, 150));
  }
  await page.close();
}

await browser.close();
