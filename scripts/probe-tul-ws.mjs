import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const context = browser.contexts()[0];

// Capture overview WS data from Tulipbet
console.log('[TUL] Capturing overview WebSocket data...');
const page = await context.newPage();
const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.enable');

let overviewWsId = null;
const overviewMessages = [];

cdp.on('Network.webSocketCreated', params => {
  if (params.url.includes('overview')) {
    overviewWsId = params.requestId;
    console.log('Overview WS:', params.url);
  }
});

cdp.on('Network.webSocketFrameReceived', params => {
  if (params.requestId === overviewWsId) {
    const data = params.response?.payloadData;
    if (data && data.length > 100) {
      overviewMessages.push(data);
    }
  }
});

try {
  await page.goto('https://tulipbet835.com/tr/sport/bet/main', { 
    waitUntil: 'domcontentloaded', timeout: 30000 
  });
  await page.waitForTimeout(15000);
  
  console.log(`\nReceived ${overviewMessages.length} large overview WS messages`);
  
  // Parse and analyze the overview messages
  for (let i = 0; i < Math.min(overviewMessages.length, 3); i++) {
    const msg = overviewMessages[i];
    console.log(`\nMsg ${i}: ${msg.length} chars`);
    try {
      const parsed = JSON.parse(msg);
      console.log('  Keys:', Object.keys(parsed));
      
      // If it contains ms (messages) array
      if (parsed.ms) {
        console.log('  ms count:', parsed.ms.length);
        const types = {};
        for (const m of parsed.ms) {
          types[m.t] = (types[m.t] || 0) + 1;
        }
        console.log('  Message types:', types);
        
        // Show sample of each type
        for (const type of Object.keys(types).slice(0, 5)) {
          const sample = parsed.ms.find(m => m.t === type);
          console.log(`\n  Sample "${type}":`, JSON.stringify(sample.d).slice(0, 400));
        }
      }
      
      // If it's a direct data object
      if (parsed.data || parsed.fixtures || parsed.fxs) {
        console.log('  Has data/fixtures!');
      }
    } catch (e) {
      console.log('  Parse error, raw start:', msg.slice(0, 200));
    }
  }
  
  // Also try the REST endpoints with proper sport content URL
  console.log('\n\n--- Trying REST endpoints for football ---');
  const results = await page.evaluate(async () => {
    function encodeMop(body) {
      return btoa(encodeURIComponent(JSON.stringify({ requestBody: body })));
    }
    const domain = location.hostname;
    const base = location.origin;
    const output = {};
    
    // Try sport-content
    const endpoints = [
      { name: 'sport-content', body: { sportTypeId: 170, device: 'd', lang: 1 } },
      { name: 'sport-content', body: { sportTypeId: 170 } },
      { name: 'prematch-overview', body: { sportTypeId: 170 } },
      { name: 'prematch-overview', body: {} },
      { name: 'sport-region-league', body: { sportTypeId: 170 } },
      { name: 'prematch-data', body: { sportTypeId: 170 } },
      { name: 'prematch-left-menu', body: { sportTypeId: 170, timeRangeInHours: null } },
      { name: 'fixture-odd-list', body: { sportTypeId: 170 } },
      { name: 'sport-fixture-odds', body: { sportTypeId: 170 } },
      { name: 'regions', body: { sportTypeId: 170 } },
      { name: 'leagues', body: { sportTypeId: 170 } },
      { name: 'region-leagues', body: { sportTypeId: 170 } },
    ];
    
    for (const ep of endpoints) {
      try {
        const url = `${base}/api/v3/mop/${ep.name}/d/1/${domain}/${encodeMop(ep.body)}`;
        const resp = await fetch(url);
        const text = await resp.text();
        output[ep.name + '_' + JSON.stringify(ep.body).slice(0, 30)] = {
          status: resp.status,
          sample: text.slice(0, 200)
        };
      } catch (e) {
        output[ep.name] = { error: e.message.slice(0, 80) };
      }
    }
    return output;
  });
  
  console.log('\nREST endpoint results:');
  for (const [k, v] of Object.entries(results)) {
    if (v.status !== 404) {
      console.log(`  ✓ ${k}: status=${v.status}, sample=${v.sample?.slice(0, 150)}`);
    }
  }
  
} catch (e) {
  console.log('ERROR:', e.message.slice(0, 150));
}

await cdp.detach();
await page.close();
await browser.close();
