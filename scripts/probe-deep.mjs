import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const context = browser.contexts()[0];

// ── PROBE 1: Poliwin (representative of POL/CAS/BOX/MIL group) ──
console.log('\n' + '='.repeat(70));
console.log('[POL] Deep API probe - poliwin184.com');
console.log('='.repeat(70));

{
  const page = await context.newPage();
  const apiCalls = [];
  
  page.on('request', req => {
    const url = req.url();
    const method = req.method();
    if ((url.includes('/api/') || url.includes('/graphql') || url.includes('sport') || url.includes('prematch') || url.includes('event') || url.includes('match') || url.includes('odds') || url.includes('market')) 
      && !url.includes('recaptcha') && !url.includes('google') && !url.includes('.js') && !url.includes('.css')) {
      const postData = req.postData();
      apiCalls.push({ method, url: url.slice(0, 200), postData: postData?.slice(0, 300) });
    }
  });
  
  page.on('response', async resp => {
    const url = resp.url();
    if (url.includes('/api/') && url.includes('sport')) {
      try {
        const body = await resp.text();
        if (body.length < 2000) {
          console.log(`  RESPONSE ${url.slice(0, 100)}: ${body.slice(0, 300)}`);
        } else {
          console.log(`  RESPONSE ${url.slice(0, 100)}: [${body.length} bytes]`);
        }
      } catch {}
    }
  });

  try {
    await page.goto('https://www.poliwin184.com/tr/sports/pre-match/event-view', { 
      waitUntil: 'networkidle', timeout: 30000 
    });
    await page.waitForTimeout(5000);
    
    // Click on football/soccer if needed
    const footballLink = await page.$('a[href*="Soccer"], a[href*="soccer"], a[href*="futbol"]');
    if (footballLink) {
      await footballLink.click();
      await page.waitForTimeout(3000);
    }
    
    console.log('\nCaptured API calls:');
    for (const c of apiCalls) {
      console.log(`  ${c.method} ${c.url}`);
      if (c.postData) console.log(`    POST: ${c.postData}`);
    }
    
    // Check window for API configuration
    const config = await page.evaluate(() => {
      const result = {};
      // Check common config locations
      if (window.__NEXT_DATA__) result.__NEXT_DATA__ = JSON.stringify(window.__NEXT_DATA__).slice(0, 500);
      if (window.__NUXT__) result.__NUXT__ = 'found';
      if (window.siteConfig) result.siteConfig = JSON.stringify(window.siteConfig).slice(0, 500);
      if (window.appConfig) result.appConfig = JSON.stringify(window.appConfig).slice(0, 500);
      
      // Search for sport API in scripts
      const scripts = document.querySelectorAll('script:not([src])');
      for (const s of scripts) {
        const text = s.textContent;
        if (text.includes('api') && text.includes('sport') && text.length < 5000) {
          result.inlineScript = text.slice(0, 500);
          break;
        }
      }
      
      // Check for SPA state
      const appEl = document.querySelector('#app, #__next, #__nuxt, [data-app]');
      if (appEl) result.appRoot = appEl.tagName + '#' + appEl.id;
      
      return result;
    });
    console.log('\nPage config:', JSON.stringify(config, null, 2));

  } catch (e) {
    console.log('ERROR:', e.message.slice(0, 150));
  }
  await page.close();
}

// ── PROBE 2: Tulipbet (representative of TUL/IMA group) ──
console.log('\n' + '='.repeat(70));
console.log('[TUL] Deep API probe - tulipbet835.com');
console.log('='.repeat(70));

{
  const page = await context.newPage();
  const apiCalls = [];
  
  page.on('request', req => {
    const url = req.url();
    const method = req.method();
    if (!url.includes('.js') && !url.includes('.css') && !url.includes('.png') && !url.includes('.svg')
        && !url.includes('google') && !url.includes('recaptcha') && !url.includes('livechat')
        && (url.includes('/api/') || url.includes('/odin/') || url.includes('sport') || url.includes('mop') || url.includes('match') || url.includes('odds'))) {
      const postData = req.postData();
      apiCalls.push({ method, url: url.slice(0, 250), postData: postData?.slice(0, 500) });
    }
  });

  try {
    await page.goto('https://tulipbet835.com/tr/sport/bet/main', { 
      waitUntil: 'networkidle', timeout: 30000 
    });
    await page.waitForTimeout(8000);
    
    // Try clicking football
    const footballEl = await page.$('[data-sport-id="1"], [href*="football"], [href*="futbol"]');
    if (footballEl) {
      await footballEl.click();
      await page.waitForTimeout(3000);
    }
    
    console.log('\nCaptured API calls:');
    for (const c of apiCalls) {
      console.log(`  ${c.method} ${c.url}`);
      if (c.postData) console.log(`    POST: ${c.postData}`);
    }
    
    // Check WebSocket connections
    const wsInfo = await page.evaluate(() => {
      // Check for ws connections stored in global scope
      const result = {};
      if (window._ws) result.ws = true;
      // Check performance entries for WS
      const entries = performance.getEntriesByType('resource').filter(e => e.name.includes('ws'));
      result.wsEntries = entries.map(e => e.name).slice(0, 5);
      return result;
    });
    console.log('\nWS info:', JSON.stringify(wsInfo));
    
    // Check page config
    const config = await page.evaluate(() => {
      const result = {};
      const scripts = document.querySelectorAll('script:not([src])');
      for (const s of scripts) {
        const text = s.textContent;
        if (text.includes('api') || text.includes('odin') || text.includes('sport')) {
          if (text.length < 3000) result.script = text.slice(0, 800);
          const apiMatch = text.match(/["'](\/(?:api|odin)[^"']+)["']/g);
          if (apiMatch) result.apiPaths = apiMatch.slice(0, 10);
        }
      }
      // Check for Angular/React/Vue
      if (document.querySelector('[ng-app], [data-ng-app]')) result.framework = 'angular';
      if (document.querySelector('#__next')) result.framework = 'next';
      if (document.querySelector('#app')) result.framework = 'vue/other';
      return result;
    });
    console.log('Config:', JSON.stringify(config, null, 2));
    
  } catch (e) {
    console.log('ERROR:', e.message.slice(0, 150));
  }
  await page.close();
}

await browser.close();
