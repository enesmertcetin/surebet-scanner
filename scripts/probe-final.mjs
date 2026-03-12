import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const context = browser.contexts()[0];

// ── 1) Find WS URLs for CAS, BOX, MIL ──
const sites = [
  { code: 'CAS', url: 'https://www.thecasino244.com/tr/sports/pre-match/event-view', siteId: 18771867 },
  { code: 'BOX', url: 'https://www.betbox2426.com/tr/sports/pre-match/event-view', siteId: 1870995 },
  { code: 'MIL', url: 'https://www.milosbet699.com/tr/sports/pre-match/event-view/', siteId: 680 },
];

for (const site of sites) {
  console.log(`\n[${site.code}] Finding WS URL...`);
  const page = await context.newPage();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  
  const wsUrls = [];
  cdp.on('Network.webSocketCreated', params => {
    if (params.url.includes('swarm')) {
      wsUrls.push(params.url);
    }
  });
  
  let siteIdFound = null;
  cdp.on('Network.webSocketFrameSent', params => {
    const payload = params.response?.payloadData;
    if (payload && payload.includes('request_session')) {
      const match = payload.match(/"site_id"\s*:\s*(\d+)/);
      if (match) siteIdFound = match[1];
    }
  });

  try {
    await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(12000);
    console.log(`  WS URL: ${wsUrls[0] || 'NOT FOUND'}`);
    console.log(`  Site ID: ${siteIdFound || site.siteId}`);
  } catch (e) {
    console.log(`  ERROR: ${e.message.slice(0, 80)}`);
  }
  await cdp.detach();
  await page.close();
}

// ── 2) Deep MOP API analysis for Tulipbet ──
console.log('\n\n[TUL] Deep MOP left-menu analysis...');
{
  const page = await context.newPage();
  try {
    await page.goto('https://tulipbet835.com/tr/sport/bet/main', { 
      waitUntil: 'domcontentloaded', timeout: 30000 
    });
    await page.waitForTimeout(5000);
    
    // Get full left-menu data and analyze structure
    const analysis = await page.evaluate(async () => {
      function encodeMop(body) {
        return btoa(encodeURIComponent(JSON.stringify({ requestBody: body })));
      }
      const domain = location.hostname;
      const base = location.origin;
      
      // Get left menu
      const resp = await fetch(`${base}/api/v3/mop/left-menu/d/1/${domain}/${encodeMop({ timeRangeInHours: null })}`);
      const data = await resp.json();
      const sports = data?.data || [];
      
      // Analyze all sports to find football
      const sportSummary = sports.map(s => ({
        stId: s.stId, stN: s.stN, xid: s.xid,
        fCnt: s.fCnt, oCnt: s.oCnt,
        hasReg: !!(s.reg && s.reg.length),
        regCount: s.reg?.length || 0,
        keys: Object.keys(s).slice(0, 15)
      }));
      
      // Find football - try id 170 and others
      const football = sports.find(s => s.stN?.includes('Futbol') || s.stN?.includes('Soccer') || s.stId === 170) 
                     || sports.find(s => s.stId === 1);
      
      if (!football) return { sportSummary: sportSummary.slice(0, 10), error: 'No football found' };
      
      const footballKeys = Object.keys(football);
      
      // Get all regions with leagues
      const regions = football.reg || [];
      const allFixtureOddIds = [];
      
      let totalFixtures = 0;
      const regionDetails = [];
      
      for (const reg of regions) {
        const leagues = reg.lgs || [];
        const regInfo = { rgId: reg.rgId, rgN: reg.rgN, lgCount: leagues.length };
        
        for (const lg of leagues) {
          const fixtures = lg.fxs || [];
          totalFixtures += fixtures.length;
          
          for (const fx of fixtures) {
            if (fx.foId) allFixtureOddIds.push(fx.foId);
          }
          
          // Sample first fixture
          if (fixtures.length > 0 && regionDetails.length < 3) {
            regInfo.sampleLeague = lg.lgN;
            regInfo.sampleFixture = fixtures[0];
            regInfo.fixtureKeys = Object.keys(fixtures[0]);
          }
        }
        if (regionDetails.length < 5) regionDetails.push(regInfo);
      }
      
      return {
        footballId: football.stId,
        footballName: football.stN,
        footballKeys,
        regionCount: regions.length,
        totalFixtures,
        totalFixtureOddIds: allFixtureOddIds.length,
        sampleFixtureOddIds: allFixtureOddIds.slice(0, 10),
        regionDetails,
      };
    });
    
    console.log('\nAnalysis:', JSON.stringify(analysis, null, 2));
    
    // If we got fixtureOddIds, fetch odds for a batch
    if (analysis.sampleFixtureOddIds?.length > 0) {
      console.log('\nFetching odds for sample fixtures...');
      const odds = await page.evaluate(async (ids) => {
        function encodeMop(body) {
          return btoa(encodeURIComponent(JSON.stringify({ requestBody: body })));
        }
        const domain = location.hostname;
        const base = location.origin;
        const url = `${base}/api/v3/mop/fixture-search/d/1/${domain}/${encodeMop({ fixtureOddIds: ids })}`;
        const resp = await fetch(url);
        const data = await resp.json();
        
        // Analyze the fixture-search response structure
        const sports = data?.data || [];
        const result = { sportCount: sports.length };
        
        for (const sport of sports) {
          const regions = sport.reg || [];
          for (const reg of regions) {
            const leagues = reg.lgs || [];
            for (const lg of leagues) {
              const fixtures = lg.fxs || [];
              for (const fx of fixtures) {
                result.sampleFixture = {
                  keys: Object.keys(fx),
                  foId: fx.foId,
                  fId: fx.fId,
                  // Teams? 
                  h: fx.h, a: fx.a, hN: fx.hN, aN: fx.aN,
                  home: fx.home, away: fx.away,
                  ht: fx.ht, at: fx.at,
                  p1: fx.p1, p2: fx.p2,
                  // Odds?
                  odds: fx.odds,
                  mks: fx.mks, // markets?
                  full: JSON.stringify(fx).slice(0, 1500),
                };
                break;
              }
              break;
            }
            break;
          }
          break;
        }
        
        return result;
      }, analysis.sampleFixtureOddIds.slice(0, 5));
      
      console.log('\nFixture odds:', JSON.stringify(odds, null, 2));
    }
    
  } catch (e) {
    console.log('ERROR:', e.message.slice(0, 150));
  }
  await page.close();
}

await browser.close();
