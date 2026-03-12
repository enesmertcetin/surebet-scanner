import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const context = browser.contexts()[0];

const sites = [
  { code: 'POL', url: 'https://www.poliwin184.com/tr/sports/pre-match/event-view', type: 'digitain' },
  { code: 'CAS', url: 'https://www.thecasino244.com/tr/sports/pre-match/event-view', type: 'digitain' },
  { code: 'BOX', url: 'https://www.betbox2426.com/tr/sports/pre-match/event-view', type: 'digitain' },
  { code: 'MIL', url: 'https://www.milosbet699.com/tr/sports/pre-match/event-view/', type: 'digitain' },
  { code: 'TUL', url: 'https://tulipbet835.com/tr/sport/bet/main', type: 'other' },
  { code: 'IMA', url: 'https://imajbet1584.com/tr/sport/bet/main', type: 'other' },
];

for (const site of sites) {
  console.log(`\n${'='.repeat(60)}\n[${site.code}] ${site.url}\n${'='.repeat(60)}`);
  const page = await context.newPage();
  
  // Capture network requests to find API patterns
  const apiRequests = [];
  page.on('request', req => {
    const url = req.url();
    if (url.includes('sport') && (url.includes('api') || url.includes('swarm') || url.includes('RequestHelper') || url.includes('GetCountry') || url.includes('GetChamps') || url.includes('partner'))) {
      apiRequests.push(url);
    }
  });
  
  const frameUrls = [];
  page.on('framenavigated', frame => {
    const url = frame.url();
    if (url !== 'about:blank' && !url.startsWith('javascript:')) {
      frameUrls.push(url);
    }
  });
  
  try {
    await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(8000);
    
    // Check frames
    const frames = page.frames().map(f => f.url()).filter(u => u !== 'about:blank');
    console.log('Frames:', frames);
    
    // Check for Digitain-specific iframe patterns  
    const digitainFrame = page.frames().find(f => 
      f.url().includes('Tools/RequestHelper') || 
      f.url().includes('sport.') ||
      f.url().includes('digi')
    );
    if (digitainFrame) {
      console.log('DIGITAIN FRAME FOUND:', digitainFrame.url());
    }
    
    // Check for WebSocket URLs in page scripts
    const wsUrls = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script'));
      const found = [];
      for (const s of scripts) {
        const text = s.textContent || '';
        const matches = text.match(/wss?:\/\/[^\s'"]+/g);
        if (matches) found.push(...matches);
      }
      return found;
    });
    if (wsUrls.length) console.log('WebSocket URLs:', wsUrls);
    
    // Dump API requests captured
    if (apiRequests.length) {
      console.log('API Requests:', [...new Set(apiRequests)].slice(0, 5));
    }
    
    // For Digitain sites, try to find partner info from frames
    for (const frame of page.frames()) {
      const url = frame.url();
      if (url.includes('sport.') || url.includes('digi') || url.includes('sportsbook')) {
        const partnerMatch = url.match(/\/([a-f0-9-]{36})\//);
        if (partnerMatch) console.log('Partner UUID:', partnerMatch[1]);
        const domainMatch = url.match(/(sport\.[^/]+)/);
        if (domainMatch) console.log('Sport Domain:', domainMatch[1]);
      }
    }
    
    console.log('Frame URLs collected:', frameUrls.filter(u => u.includes('sport')));
    
  } catch (e) {
    console.log('ERROR:', e.message.slice(0, 120));
  }
  
  await page.close();
}

await browser.close();
