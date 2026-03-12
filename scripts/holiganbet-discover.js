/**
 * Holiganbet API Discovery
 * Chrome CDP ile futbol sayfasına gidip ağ trafiğini yakala
 */
import { chromium } from 'playwright';

const BASE = 'https://www.holiganbet10214.com';
const FOOTBALL_URL = `${BASE}/tr/sports/spor/futbol/1/t%C3%BCm%C3%BC/0/lokasyon`;

async function main() {
  console.log('Chrome CDP bağlanıyor...');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0] || await browser.newContext();
  const page = await ctx.newPage();

  const apiCalls = [];

  // Ağ trafiğini yakala
  page.on('request', req => {
    const url = req.url();
    if (url.includes('/api/') || url.includes('/sportsbook/') || url.includes('graphql') || 
        url.includes('/v1/') || url.includes('/v2/') || url.includes('/v3/') ||
        url.includes('odds') || url.includes('event') || url.includes('sport') ||
        url.includes('match') || url.includes('prematch') || url.includes('market')) {
      apiCalls.push({
        method: req.method(),
        url: url,
        headers: Object.keys(req.headers()),
        postData: req.postData()?.slice(0, 500),
      });
    }
  });

  page.on('response', async res => {
    const url = res.url();
    const ct = res.headers()['content-type'] || '';
    if (ct.includes('json') && !url.includes('.js') && !url.includes('static')) {
      const size = res.headers()['content-length'] || '?';
      console.log(`  [${res.status()}] ${res.request().method()} ${url.slice(0, 150)} (${size} bytes)`);
      
      // İlk birkaç JSON response'ını kaydet
      if (apiCalls.length < 30) {
        try {
          const body = await res.text();
          apiCalls.push({
            type: 'response',
            method: res.request().method(),
            url: url,
            status: res.status(),
            size: body.length,
            preview: body.slice(0, 1000),
          });
        } catch (e) {}
      }
    }
  });

  console.log(`\nFutbol sayfasına gidiliyor: ${FOOTBALL_URL}`);
  await page.goto(FOOTBALL_URL, { waitUntil: 'networkidle', timeout: 60000 });
  console.log('Sayfa yüklendi, 5 sn bekleniyor...');
  await page.waitForTimeout(5000);

  // Sayfadaki iframe var mı kontrol et
  const frames = page.frames();
  console.log(`\nFrame sayısı: ${frames.length}`);
  for (const f of frames) {
    console.log(`  Frame: ${f.url().slice(0, 120)}`);
  }

  // Yakalanan API çağrıları
  console.log(`\n═══ Yakalanan API Çağrıları: ${apiCalls.length} ═══`);
  for (const c of apiCalls) {
    if (c.type === 'response') {
      console.log(`\n[RES] ${c.method} ${c.url.slice(0, 150)}`);
      console.log(`  Status: ${c.status}, Size: ${c.size}`);
      console.log(`  Preview: ${c.preview.slice(0, 300)}`);
    } else {
      console.log(`\n[REQ] ${c.method} ${c.url.slice(0, 150)}`);
      if (c.postData) console.log(`  Body: ${c.postData.slice(0, 300)}`);
    }
  }

  // Sayfadan mevcut JS context'inden ipuçları al
  const pageInfo = await page.evaluate(() => {
    const info = {};
    // window altındaki ilginç objeleri bul
    for (const key of Object.keys(window)) {
      const val = window[key];
      if (val && typeof val === 'object' && !Array.isArray(val) && key.startsWith('__')) {
        info[key] = typeof val;
      }
    }
    // Store/state varsa
    if (window.__NUXT__) info.__NUXT__ = 'exists';
    if (window.__NEXT_DATA__) info.__NEXT_DATA__ = 'exists';
    if (window.__REDUX_DEVTOOLS_EXTENSION__) info.redux = 'exists';
    
    // URL'den sport ID bul
    info.currentUrl = location.href;
    info.title = document.title;
    
    // Script src'leri
    const scripts = [...document.querySelectorAll('script[src]')].map(s => s.src).filter(s => !s.includes('cdn') && !s.includes('google'));
    info.scripts = scripts.slice(0, 10);
    
    return info;
  });
  console.log('\n═══ Sayfa Bilgisi ═══');
  console.log(JSON.stringify(pageInfo, null, 2));

  await page.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
