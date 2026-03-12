import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const context = browser.contexts()[0];

console.log('[TUL] Intercepting API calls when navigating to Football...');
const page = await context.newPage();
const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.enable');

const apiCalls = [];
cdp.on('Network.requestWillBeSent', params => {
  const url = params.request.url;
  if (url.includes('/api/') && !url.includes('google') && !url.includes('livechat') && !url.includes('nxgyserv')) {
    apiCalls.push({ url: url.slice(0, 300), method: params.request.method });
  }
});

const wsFrames = [];
cdp.on('Network.webSocketFrameSent', params => {
  const p = params.response?.payloadData;
  if (p && p.length < 2000 && !p.startsWith('?')) wsFrames.push({ dir: 'SENT', data: p.slice(0, 500) });
});
cdp.on('Network.webSocketFrameReceived', params => {
  const p = params.response?.payloadData;
  if (p && p.length < 500) wsFrames.push({ dir: 'RECV', data: p.slice(0, 500) });
});

try {
  await page.goto('https://tulipbet835.com/tr/sport/bet/main', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(8000);
  
  console.log('=== Initial load API calls ===');
  for (const c of apiCalls) console.log(`  ${c.method} ${c.url}`);
  
  // Now click on Football
  apiCalls.length = 0;
  wsFrames.length = 0;
  
  console.log('\n--- Clicking on Futbol... ---');
  
  // Try multiple selectors to find football option 
  const clicked = await page.evaluate(() => {
    // Look for football in the left menu
    const allEls = document.querySelectorAll('a, button, div, span, li');
    for (const el of allEls) {
      const text = el.textContent?.trim();
      if (text === 'Futbol' || text === 'Futbol ') {
        // Check if it's a direct clickable element (not a parent of many)
        if (el.children.length <= 3) {
          el.click();
          return `Clicked: ${el.tagName}.${el.className} = "${text}"`;
        }
      }
    }
    // Try href-based
    const links = document.querySelectorAll('a[href*="futbol"], a[href*="soccer"], a[href*="sport/170"]');
    if (links.length) {
      links[0].click();
      return `Clicked link: ${links[0].href}`;
    }
    return 'Not found';
  });
  console.log('Click result:', clicked);
  await page.waitForTimeout(5000);
  
  console.log('\n=== After Football click API calls ===');
  for (const c of apiCalls) console.log(`  ${c.method} ${c.url}`);
  
  console.log('\n=== WebSocket frames ===');
  for (const f of wsFrames.slice(0, 20)) console.log(`  ${f.dir}: ${f.data}`);
  
  // Decode any base64 MOP API URLs found
  for (const c of apiCalls) {
    if (c.url.includes('/api/v3/mop/')) {
      const parts = c.url.split('/');
      const b64Part = parts[parts.length - 1];
      if (b64Part && b64Part.length > 20) {
        try {
          const decoded = decodeURIComponent(atob(b64Part));
          console.log(`\n  Decoded: ${c.url.split(b64Part)[0]}...`);
          console.log(`  Body: ${decoded}`);
        } catch {}
      }
    }
  }

  // Also try: click on a specific league (e.g., first one visible)
  apiCalls.length = 0;
  console.log('\n--- Clicking on first league... ---');
  
  const leagueClicked = await page.evaluate(() => {
    // Look for league/competition links
    const els = document.querySelectorAll('[class*="league"], [class*="competition"], [class*="region"]');
    for (const el of els) {
      const text = el.textContent?.trim();
      if (text && text.length < 50 && !text.includes('Futbol')) {
        el.click();
        return `Clicked: ${text}`;
      }
    }
    // Try any clickable thing in the sport menu
    const items = document.querySelectorAll('.sport-menu-item, .menu-item, [data-league], [data-region]');
    for (const item of items) {
      item.click();
      return `Clicked: ${item.textContent?.trim()?.slice(0, 50)}`;
    }
    return 'Not found';
  });
  console.log('League click:', leagueClicked);
  await page.waitForTimeout(5000);
  
  console.log('\n=== After league click API calls ===');
  for (const c of apiCalls) console.log(`  ${c.method} ${c.url}`);
  
  for (const c of apiCalls) {
    if (c.url.includes('/api/v3/mop/')) {
      const parts = c.url.split('/');
      const b64Part = parts[parts.length - 1];
      if (b64Part && b64Part.length > 20) {
        try {
          const decoded = decodeURIComponent(Buffer.from(b64Part, 'base64').toString('utf8'));
          console.log(`\n  Decoded: ${decoded}`);
        } catch {}
      }
    }
  }

} catch (e) {
  console.log('ERROR:', e.message.slice(0, 150));
}

await cdp.detach();
await page.close();
await browser.close();
