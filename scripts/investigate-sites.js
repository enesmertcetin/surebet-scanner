import { chromium } from 'playwright';

async function investigateSite(ctx, name, url, waitMs = 12000) {
  console.log(`\n=== ${name} ===`);
  const page = await ctx.newPage();
  
  const apiRequests = [];
  const wsMessages = [];
  
  // Intercept network
  page.on('request', req => {
    const u = req.url();
    if (u.includes('/api/') || u.includes('/Api/') || u.includes('swarm') || 
        u.includes('sport') && (u.includes('.json') || u.includes('odd') || u.includes('match') || u.includes('event') || u.includes('market') || u.includes('competition') || u.includes('prematch'))) {
      apiRequests.push({ method: req.method(), url: u.substring(0, 250), type: req.resourceType() });
    }
  });

  page.on('response', async res => {
    const u = res.url();
    if ((u.includes('/api/') || u.includes('/Api/') || u.includes('swarm') || u.includes('prematch') || u.includes('sport') && (u.includes('event') || u.includes('match') || u.includes('odd') || u.includes('competition'))) && res.status() === 200) {
      try {
        const ct = res.headers()['content-type'] || '';
        if (ct.includes('json') || ct.includes('text')) {
          const body = await res.text();
          if (body.length > 100) {
            apiRequests.push({ url: u.substring(0, 250), size: body.length, preview: body.substring(0, 300) });
          }
        }
      } catch {}
    }
  });

  // Listen for WebSocket
  page.on('websocket', ws => {
    console.log(`  WS opened: ${ws.url().substring(0, 200)}`);
    ws.on('framereceived', frame => {
      if (wsMessages.length < 5) {
        wsMessages.push({ type: 'recv', data: (typeof frame.payload === 'string' ? frame.payload : '(binary)').substring(0, 300) });
      }
    });
    ws.on('framesent', frame => {
      if (wsMessages.length < 10) {
        wsMessages.push({ type: 'sent', data: (typeof frame.payload === 'string' ? frame.payload : '(binary)').substring(0, 300) });
      }
    });
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    console.log('  goto err:', e.message);
  }
  
  await page.waitForTimeout(waitMs);
  
  // Also check frames for WebSocket
  for (const frame of page.frames()) {
    const fUrl = frame.url();
    if (fUrl.includes('sport') || fUrl.includes('mbc')) {
      console.log(`  Checking frame: ${fUrl.substring(0, 150)}`);
    }
  }
  
  console.log(`  API Requests (${apiRequests.length}):`);
  for (const r of apiRequests.slice(0, 20)) {
    if (r.preview) {
      console.log(`    [RESP] ${r.url}`);
      console.log(`           size=${r.size} preview=${r.preview.substring(0, 200)}`);
    } else {
      console.log(`    [${r.method}] ${r.url}`);
    }
  }
  
  if (wsMessages.length) {
    console.log(`  WebSocket messages (${wsMessages.length}):`);
    for (const m of wsMessages) console.log(`    [${m.type}] ${m.data}`);
  }
  
  await page.close();
}

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  
  // Investigate Sekabet
  await investigateSite(ctx, 'SEKABET', 'https://sekabett1521.com/bahis', 15000);
  
  // Investigate Meritwin (BetConstruct)
  await investigateSite(ctx, 'MERITWIN', 'https://meritwin343.com/sports', 15000);
  
  // Investigate Risebet (BetConstruct)
  await investigateSite(ctx, 'RISEBET', 'https://www.risebet244.com/sportsbook', 15000);
  
  try { await browser.close(); } catch {}
})().catch(console.error);
