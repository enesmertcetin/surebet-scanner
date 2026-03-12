import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const context = browser.contexts()[0];

// ── 1) Find Swarm WS URL for Poliwin by intercepting CDP WebSocket ──
console.log('[POL] Finding Swarm WebSocket via CDP...');
{
  const page = await context.newPage();
  const cdp = await page.context().newCDPSession(page);
  
  const wsFrames = [];
  await cdp.send('Network.enable');
  cdp.on('Network.webSocketCreated', params => {
    console.log('  WS Created:', params.url);
    wsFrames.push({ url: params.url, id: params.requestId });
  });
  cdp.on('Network.webSocketFrameSent', params => {
    const payload = params.response?.payloadData;
    if (payload && payload.length < 500) {
      console.log('  WS Sent:', payload.slice(0, 200));
    }
  });
  cdp.on('Network.webSocketFrameReceived', params => {
    const payload = params.response?.payloadData;
    if (payload && payload.includes('session') && payload.length < 500) {
      console.log('  WS Received (session):', payload.slice(0, 200));
    }
  });

  try {
    await page.goto('https://www.poliwin184.com/tr/sports/pre-match/event-view', { 
      waitUntil: 'domcontentloaded', timeout: 30000 
    });
    await page.waitForTimeout(15000);
    console.log('\nAll WebSocket URLs found:');
    for (const ws of wsFrames) console.log('  ', ws.url);
  } catch (e) {
    console.log('ERROR:', e.message.slice(0, 100));
  }
  await cdp.detach();
  await page.close();
}

// ── 2) Do the same for Tulipbet ──
console.log('\n\n[TUL] Finding WebSocket/API via CDP...');
{
  const page = await context.newPage();
  const cdp = await page.context().newCDPSession(page);
  
  await cdp.send('Network.enable');
  cdp.on('Network.webSocketCreated', params => {
    console.log('  WS Created:', params.url);
  });
  cdp.on('Network.webSocketFrameSent', params => {
    const payload = params.response?.payloadData;
    if (payload && payload.length < 1000) {
      console.log('  WS Sent:', payload.slice(0, 300));
    }
  });

  try {
    await page.goto('https://tulipbet835.com/tr/sport/bet/main', { 
      waitUntil: 'domcontentloaded', timeout: 30000 
    });
    await page.waitForTimeout(10000);
    
    // Now try the left-menu API to decode football data
    const leftMenuData = await page.evaluate(async () => {
      function encodeMop(body) {
        const json = JSON.stringify({ requestBody: body });
        const urlEncoded = encodeURIComponent(json);
        // Convert to base64
        return btoa(urlEncoded);
      }
      
      const domain = location.hostname;
      const base = location.origin;
      
      // Get left menu
      const leftMenuUrl = `${base}/api/v3/mop/left-menu/d/1/${domain}/${encodeMop({ timeRangeInHours: null })}`;
      const resp = await fetch(leftMenuUrl);
      const data = await resp.json();
      
      // Find football sport type  
      const sports = data?.data || [];
      const football = sports.find(s => s.stId === 1 || (s.stN && (s.stN.toLowerCase().includes('futbol') || s.stN.toLowerCase().includes('soccer'))));
      
      if (!football) return { error: 'Football not found', sampleSports: sports.slice(0, 5).map(s => ({ id: s.stId, name: s.stN })) };
      
      // Get regions/leagues within football
      const regions = football.reg || [];
      return {
        footballId: football.stId,
        footballName: football.stN,
        regionCount: regions.length,
        sampleRegions: regions.slice(0, 3).map(r => ({
          id: r.rgId,
          name: r.rgN,
          leagues: (r.lgs || []).slice(0, 3).map(l => ({
            id: l.lgId,
            name: l.lgN,
            fixtureCount: l.fCnt,
            sampleFixtures: (l.fxs || []).slice(0, 2)
          }))
        }))
      };
    });
    
    console.log('\nLeft menu football data:', JSON.stringify(leftMenuData, null, 2));
    
    // If we found fixture IDs, get the actual odds
    if (leftMenuData.sampleRegions) {
      const fixtureIds = [];
      for (const r of leftMenuData.sampleRegions) {
        for (const l of r.leagues) {
          for (const f of l.sampleFixtures || []) {
            if (f.foId) fixtureIds.push(f.foId);
            if (f.fId) fixtureIds.push(f.fId);
          }
        }
      }
      
      if (fixtureIds.length > 0) {
        console.log('\nSample fixture IDs:', fixtureIds.slice(0, 5));
        
        // Try fixture-search with these IDs
        const fixtureData = await page.evaluate(async (ids) => {
          function encodeMop(body) {
            return btoa(encodeURIComponent(JSON.stringify({ requestBody: body })));
          }
          const domain = location.hostname;
          const url = `${location.origin}/api/v3/mop/fixture-search/d/1/${domain}/${encodeMop({ fixtureOddIds: ids })}`;
          const resp = await fetch(url);
          const data = await resp.json();
          return JSON.stringify(data).slice(0, 3000);
        }, fixtureIds.slice(0, 3));
        
        console.log('\nFixture search result:', fixtureData);
      }
    }
    
    // Also try getting all football fixtures via different endpoints
    const allFootball = await page.evaluate(async () => {
      function encodeMop(body) {
        return btoa(encodeURIComponent(JSON.stringify({ requestBody: body })));
      }
      const domain = location.hostname;
      const base = location.origin;
      
      // Try sport-fixtures endpoint
      const endpoints = [
        'sport-fixtures',
        'fixture-list', 
        'fixtures',
        'sport-event-list',
        'event-list',
        'prematch-fixtures',
      ];
      
      const results = {};
      for (const ep of endpoints) {
        try {
          const url = `${base}/api/v3/mop/${ep}/d/1/${domain}/${encodeMop({ sportTypeId: 1 })}`;
          const resp = await fetch(url);
          results[ep] = { status: resp.status, sample: (await resp.text()).slice(0, 200) };
        } catch (e) {
          results[ep] = { error: e.message };
        }
      }
      return results;
    });
    console.log('\nEndpoint probing:', JSON.stringify(allFootball, null, 2));
    
  } catch (e) {
    console.log('ERROR:', e.message.slice(0, 150));
  }
  await cdp.detach();
  await page.close();
}

await browser.close();
