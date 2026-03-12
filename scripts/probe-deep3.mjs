import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const context = browser.contexts()[0];

// ── Find BetConstruct Swarm WebSocket for POL/CAS/BOX/MIL ──
const bcSites = [
  { code: 'POL', url: 'https://www.poliwin184.com/tr/sports/pre-match/event-view', partnerId: 18770331 },
  { code: 'CAS', url: 'https://www.thecasino244.com/tr/sports/pre-match/event-view' },
  { code: 'BOX', url: 'https://www.betbox2426.com/tr/sports/pre-match/event-view' },
  { code: 'MIL', url: 'https://www.milosbet699.com/tr/sports/pre-match/event-view/' },
];

for (const site of bcSites) {
  console.log(`\n${'='.repeat(60)}\n[${site.code}] Probing BetConstruct config\n${'='.repeat(60)}`);
  const page = await context.newPage();
  
  const wsUrls = new Set();
  const swarmRequests = [];
  
  // Intercept WebSocket creation
  page.on('request', req => {
    const url = req.url();
    if (url.includes('swarm') || url.includes('wss://') || url.includes('bcapps')) {
      swarmRequests.push(url.slice(0, 200));
    }
  });

  try {
    await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(12000);
    
    // Find partner/site config in page
    const config = await page.evaluate(() => {
      const result = {};
      
      // Check for Betconstruct config
      if (window.Swarm) result.swarm = 'found';
      if (window.Config) result.config = JSON.stringify(window.Config).slice(0, 1000);
      if (window.partner_id) result.partnerId = window.partner_id;
      if (window.siteId) result.siteId = window.siteId;
      
      // Look for swarm URL in all script tags
      const scripts = document.querySelectorAll('script:not([src])');
      for (const s of scripts) {
        const text = s.textContent;
        const swarmMatch = text.match(/swarm['":\s]*['"]*(wss?:\/\/[^'"]+)['"]/i);
        if (swarmMatch) result.swarmUrl = swarmMatch[1];
        const siteIdMatch = text.match(/site_id['":\s]*(\d+)/);
        if (siteIdMatch) result.siteId = siteIdMatch[1];
        const partnerMatch = text.match(/partner_?id['":\s]*(\d+)/);
        if (partnerMatch) result.partnerId = partnerMatch[1];
      }
      
      // Check for bcapps config
      const scripts2 = document.querySelectorAll('script[src]');
      for (const s of scripts2) {
        if (s.src.includes('bcapps') || s.src.includes('swarm')) {
          result.bcScript = s.src.slice(0, 200);
        }
      }
      
      // Check performance entries for WebSocket connections
      const entries = performance.getEntriesByType('resource');
      result.wsResources = entries
        .filter(e => e.name.includes('swarm') || e.name.includes('wss'))
        .map(e => e.name.slice(0, 200));
      
      // Also check for CMS API partner info
      const allEntries = entries.filter(e => e.name.includes('cms') || e.name.includes('partner'));
      result.cmsEntries = allEntries.map(e => e.name.slice(0, 200)).slice(0, 5);
      
      return result;
    });
    
    console.log('Config:', JSON.stringify(config, null, 2));
    if (swarmRequests.length) console.log('Swarm requests:', swarmRequests);
    
    // Try to find sport iframe
    const frames = page.frames();
    for (const f of frames) {
      const url = f.url();
      if (url.includes('sport') || url.includes('mbcsport') || url.includes('bcapps')) {
        console.log('Sport frame:', url.slice(0, 200));
      }
    }
    
  } catch (e) {
    console.log('ERROR:', e.message.slice(0, 120));
  }
  await page.close();
}

// ── Find MOP API structure for TUL/IMA ──
console.log('\n\n' + '='.repeat(60) + '\n[TUL] Intercepting all API calls with responses\n' + '='.repeat(60));
{
  const page = await context.newPage();
  const apiResponses = [];
  
  page.on('response', async resp => {
    const url = resp.url();
    if (url.includes('/api/') && !url.includes('google') && !url.includes('livechat') && !url.includes('nxgyserv')) {
      try {
        const text = await resp.text();
        apiResponses.push({ url: url.slice(0, 200), size: text.length, sample: text.slice(0, 300) });
      } catch {}
    }
  });
  
  try {
    await page.goto('https://tulipbet835.com/tr/sport/bet/main', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(10000);
    
    // Try navigating to football
    await page.evaluate(() => {
      // Look for football sport link
      const links = document.querySelectorAll('a, [role="button"], [class*="sport"]');
      for (const l of links) {
        if (l.textContent?.includes('Futbol') || l.textContent?.includes('Soccer')) {
          l.click();
          return true;
        }
      }
      return false;
    });
    await page.waitForTimeout(5000);
    
    console.log(`\nCaptured ${apiResponses.length} API responses:`);
    for (const r of apiResponses) {
      console.log(`\n  ${r.url}`);
      console.log(`  Size: ${r.size} | Sample: ${r.sample.slice(0, 200)}`);
    }
    
  } catch (e) {
    console.log('ERROR:', e.message.slice(0, 100));
  }
  await page.close();
}

await browser.close();
