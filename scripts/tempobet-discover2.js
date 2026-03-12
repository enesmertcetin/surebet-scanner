/**
 * Tempobet - API Keşif (Faz 2)
 * sports.html sayfasının API çağrılarını yakala
 */
import { chromium } from 'playwright';

async function main() {
  console.log('Chrome CDP bağlanıyor...');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0] || await browser.newContext();
  
  // Mevcut tempobet sayfasını kullan
  let page = ctx.pages().find(p => p.url().includes('tempobet'));
  if (!page) {
    page = await ctx.newPage();
  }

  // TÜM network isteklerini yakala
  const apiCalls = [];
  page.on('request', req => {
    const url = req.url();
    // HTML, CSS, JS, img hariç tüm istekleri kaydet
    if (!url.match(/\.(css|js|png|jpg|gif|svg|woff|ttf|ico)(\?|$)/) && 
        !url.includes('google-analytics') && !url.includes('liveperson') &&
        !url.includes('lpsnmedia') && !url.includes('_Incapsula')) {
      apiCalls.push({
        method: req.method(),
        url,
        postData: req.postData()?.substring(0, 500),
        headers: Object.fromEntries(
          Object.entries(req.headers()).filter(([k]) => 
            ['content-type', 'x-requested-with', 'accept', 'authorization'].includes(k.toLowerCase())
          )
        ),
      });
    }
  });

  const apiResponses = [];
  page.on('response', async resp => {
    const url = resp.url();
    if (url.includes('.tpl') || url.includes('/api/') || url.includes('sport') || 
        url.includes('odds') || url.includes('event') || url.includes('match') ||
        url.includes('market') || url.includes('league') || url.includes('country')) {
      try {
        const body = await resp.text();
        apiResponses.push({
          url: url.substring(0, 200),
          status: resp.status(),
          size: body.length,
          preview: body.substring(0, 500),
        });
      } catch {}
    }
  });

  // WebSocket'leri izle
  page.on('websocket', ws => {
    console.log(`🔌 WS: ${ws.url()}`);
    ws.on('framereceived', f => {
      const d = typeof f.payload === 'string' ? f.payload : '';
      console.log(`  WS RECV [${d.length}b]: ${d.substring(0, 300)}`);
    });
    ws.on('framesent', f => {
      const d = typeof f.payload === 'string' ? f.payload : '';
      console.log(`  WS SENT [${d.length}b]: ${d.substring(0, 300)}`);
    });
  });

  console.log('sports.html sayfasına gidiliyor...');
  await page.goto('https://www.1124tempobet.com/sports.html', { 
    waitUntil: 'domcontentloaded', timeout: 30000 
  });
  await page.waitForTimeout(10000);

  console.log(`\n═══ API ÇAĞRILARI (${apiCalls.length}) ═══`);
  for (const c of apiCalls) {
    console.log(`  ${c.method} ${c.url.substring(0, 180)}`);
    if (c.postData) console.log(`    POST: ${c.postData.substring(0, 300)}`);
    if (Object.keys(c.headers).length) console.log(`    Headers: ${JSON.stringify(c.headers)}`);
  }

  console.log(`\n═══ API RESPONSES (${apiResponses.length}) ═══`);
  for (const r of apiResponses) {
    console.log(`  [${r.status}] ${r.url} (${r.size}b)`);
    console.log(`    ${r.preview.substring(0, 300)}`);
    console.log('');
  }

  // Template dosyasını oku - sport.tpl'nin içeriği
  console.log('\n═══ sport.tpl TEMPLATE ═══');
  try {
    const tplResp = await page.evaluate(async () => {
      const r = await fetch('/tempobet_new/templates/sport.tpl?v=707');
      return await r.text();
    });
    console.log(tplResp.substring(0, 3000));
  } catch (e) {
    console.log('Template okuma hatası:', e.message);
  }

  // custom.js'deki API endpoint'lerini bul
  console.log('\n═══ custom.js API ENDPOINT KEŞFİ ═══');
  const endpoints = await page.evaluate(() => {
    const text = document.body?.outerHTML || '';
    // URL pattern'leri bul
    const urlMatches = text.match(/["'](\/[a-z_]+\.(php|aspx|json|html|do|action)[^"']*?)["']/gi) || [];
    const ajaxMatches = text.match(/["'](https?:\/\/[^"'\s]+(?:api|sport|event|match|odds|league|country)[^"'\s]*?)["']/gi) || [];
    
    // Global değişkenler
    const globals = {};
    try {
      if (window.SBTech) globals.SBTech = 'exists';
      if (window.sbtech) globals.sbtech = 'exists';
      if (window.BetConstruct) globals.BetConstruct = 'exists';
      if (window.Digitain) globals.Digitain = 'exists';
    } catch {}

    // jQuery ajax setup
    let ajaxSetup = null;
    try { ajaxSetup = $.ajaxSetup()?.url; } catch {}

    return { 
      urlMatches: [...new Set(urlMatches)].slice(0, 20),
      ajaxMatches: [...new Set(ajaxMatches)].slice(0, 20),
      globals,
      ajaxSetup,
    };
  });
  console.log('URL patterns:', JSON.stringify(endpoints.urlMatches, null, 2));
  console.log('API matches:', JSON.stringify(endpoints.ajaxMatches, null, 2));
  console.log('Globals:', JSON.stringify(endpoints.globals));

  // JS'deki API fonksiyonlarını ara
  console.log('\n═══ JS FONKSİYONLARI ═══');
  const jsFns = await page.evaluate(() => {
    // custom.js'deki fonksiyon adlarını bul
    const fnNames = Object.getOwnPropertyNames(window).filter(n => {
      const v = window[n];
      return typeof v === 'function' && !n.startsWith('_') && !n.startsWith('$') && 
             n.length > 3 && n.length < 50 &&
             (n.toLowerCase().includes('sport') || n.toLowerCase().includes('bet') || 
              n.toLowerCase().includes('odd') || n.toLowerCase().includes('event') ||
              n.toLowerCase().includes('match') || n.toLowerCase().includes('league') ||
              n.toLowerCase().includes('load') || n.toLowerCase().includes('fetch') ||
              n.toLowerCase().includes('get') || n.toLowerCase().includes('api'));
    });

    // Global config objeleri
    const configKeys = Object.getOwnPropertyNames(window).filter(n => {
      const v = window[n];
      return v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof HTMLElement) &&
             n.length > 2 && n.length < 30 && /^[A-Z]/.test(n);
    });

    return { fnNames: fnNames.slice(0, 30), configKeys: configKeys.slice(0, 20) };
  });
  console.log('Sport-related functions:', JSON.stringify(jsFns.fnNames));
  console.log('Config objects:', JSON.stringify(jsFns.configKeys));

  // Futbol linkine tıklayıp network isteklerini izle
  console.log('\n═══ FUTBOL SAYFASI ═══');
  apiCalls.length = 0; // reset
  apiResponses.length = 0;

  // Futbol linkini bul ve tıkla
  const clicked = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a')];
    const futbolLink = links.find(l => {
      const text = l.innerText?.trim();
      return text === 'Futbol' && l.href;
    });
    if (futbolLink) {
      futbolLink.click();
      return futbolLink.href;
    }
    // Alternatif: sport1.html
    const sport1 = links.find(l => l.href?.includes('sport1.html'));
    if (sport1) { sport1.click(); return sport1.href; }
    return null;
  });
  console.log('Tıklanan link:', clicked);
  
  await page.waitForTimeout(8000);

  console.log(`\nFutbol API çağrıları (${apiCalls.length}):`);
  for (const c of apiCalls) {
    console.log(`  ${c.method} ${c.url.substring(0, 200)}`);
    if (c.postData) console.log(`    POST: ${c.postData.substring(0, 300)}`);
  }

  console.log(`\nFutbol API yanıtları (${apiResponses.length}):`);
  for (const r of apiResponses) {
    console.log(`  [${r.status}] ${r.url} (${r.size}b)`);
    console.log(`    ${r.preview.substring(0, 400)}`);
    console.log('');
  }

  await page.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
