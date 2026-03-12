/**
 * Holiganbet iframe API keşfi
 * sports2.holiganbet10214.com iframe'indeki API çağrılarını yakala
 */
import { chromium } from 'playwright';

async function main() {
  console.log('Chrome CDP bağlanıyor...');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0] || await browser.newContext();
  const page = await ctx.newPage();

  const apiCalls = [];
  const wsMessages = [];

  // TÜM ağ trafiğini yakala (iframe dahil)
  page.on('request', req => {
    const url = req.url();
    // sports2 subdomain veya api subdomain çağrıları
    if (url.includes('sports2.') || url.includes('api.holiganbet') || 
        url.includes('/api/') || url.includes('/v1/') || url.includes('/v2/') ||
        url.includes('wss://') || url.includes('websocket')) {
      if (!url.includes('.js') && !url.includes('.css') && !url.includes('.svg') && 
          !url.includes('.png') && !url.includes('.woff') && !url.includes('challenge-platform') &&
          !url.includes('rum?') && !url.includes('cdn-cgi')) {
        apiCalls.push({
          method: req.method(),
          url: url,
          postData: req.postData()?.slice(0, 1000),
          time: Date.now(),
        });
        console.log(`  [REQ] ${req.method()} ${url.slice(0, 160)}`);
      }
    }
  });

  page.on('response', async res => {
    const url = res.url();
    if ((url.includes('sports2.') || url.includes('api.holiganbet')) && 
        !url.includes('.js') && !url.includes('.css') && !url.includes('.svg') &&
        !url.includes('.png') && !url.includes('.woff') && !url.includes('challenge-platform') &&
        !url.includes('rum?') && !url.includes('cdn-cgi')) {
      const ct = res.headers()['content-type'] || '';
      try {
        const body = await res.text();
        if (body.length > 10 && (ct.includes('json') || body.startsWith('{') || body.startsWith('['))) {
          console.log(`  [RES ${res.status()}] ${url.slice(0, 120)} (${body.length} bytes)`);
          apiCalls.push({
            type: 'response',
            url,
            status: res.status(),
            size: body.length,
            preview: body.slice(0, 2000),
          });
        }
      } catch {}
    }
  });

  // WebSocket'leri de izle
  page.on('websocket', ws => {
    console.log(`\n  [WS] WebSocket açıldı: ${ws.url()}`);
    ws.on('framereceived', frame => {
      const data = frame.payload?.toString()?.slice(0, 500);
      if (data && wsMessages.length < 30) {
        wsMessages.push({ url: ws.url(), data });
        if (wsMessages.length <= 5) console.log(`  [WS MSG] ${data.slice(0, 200)}`);
      }
    });
    ws.on('framesent', frame => {
      const data = frame.payload?.toString()?.slice(0, 500);
      if (data && wsMessages.length < 30) {
        wsMessages.push({ url: ws.url(), sent: true, data });
        if (wsMessages.length <= 5) console.log(`  [WS SENT] ${data.slice(0, 200)}`);
      }
    });
  });

  const FOOTBALL_URL = 'https://www.holiganbet10214.com/tr/sports/spor/futbol/1/t%C3%BCm%C3%BC/0/lokasyon';
  console.log(`\nSayfaya gidiliyor: ${FOOTBALL_URL}`);
  await page.goto(FOOTBALL_URL, { waitUntil: 'networkidle', timeout: 60000 });
  
  console.log('\n--- Sayfa yüklendi, 8 sn bekleniyor (iframe yüklenmesi) ---');
  await page.waitForTimeout(8000);

  // iframe'e eriş ve prematch sayfasına git
  const frames = page.frames();
  console.log(`\nFrame sayısı: ${frames.length}`);
  const sportFrame = frames.find(f => f.url().includes('sports2.'));
  
  if (sportFrame) {
    console.log(`Spor frame bulundu: ${sportFrame.url()}`);
    
    // Frame içindeki HTML/DOM'dan bilgi al
    try {
      const frameInfo = await sportFrame.evaluate(() => {
        // event/match elementlerini bul 
        const els = document.querySelectorAll('[class*="event"], [class*="match"], [class*="game"]');
        const classes = [...new Set([...document.querySelectorAll('*')].slice(0, 200).flatMap(e => [...e.classList]))].filter(c => c.match(/event|match|odd|market|sport|league|compet/i));
        
        // script/store bilgisi
        const stores = {};
        if (window.__STORE__) stores.__STORE__ = 'exists';
        if (window.__INITIAL_STATE__) stores.__INITIAL_STATE__ = 'exists';
        if (window.store) stores.store = typeof window.store;
        if (window.app) stores.app = typeof window.app;
        
        // Svelte stores varsa
        const windowKeys = Object.keys(window).filter(k => 
          k.includes('store') || k.includes('state') || k.includes('config') || 
          k.includes('api') || k.includes('socket') || k.includes('ws')
        );
        
        return {
          url: location.href,
          eventElements: els.length,
          relevantClasses: classes.slice(0, 30),
          stores,
          windowKeys: windowKeys.slice(0, 20),
          bodyText: document.body?.innerText?.slice(0, 2000),
        };
      });
      console.log('\n═══ Sport Frame Bilgisi ═══');
      console.log('URL:', frameInfo.url);
      console.log('Event elements:', frameInfo.eventElements);
      console.log('Relevant classes:', frameInfo.relevantClasses);
      console.log('Stores:', frameInfo.stores);
      console.log('Window keys:', frameInfo.windowKeys);
      console.log('\nBody text (ilk 1500):\n', frameInfo.bodyText?.slice(0, 1500));
    } catch (e) {
      console.log('Frame evaluate error:', e.message);
    }
  }

  // API çağrılarını özetle
  console.log(`\n═══ Özet: ${apiCalls.length} API çağrısı, ${wsMessages.length} WS mesajı ═══`);
  
  const responses = apiCalls.filter(c => c.type === 'response');
  console.log(`\nJSON Responses (${responses.length}):`);
  for (const r of responses) {
    console.log(`\n  ${r.url.slice(0, 150)}`);
    console.log(`  Size: ${r.size}, Status: ${r.status}`);
    console.log(`  Preview: ${r.preview?.slice(0, 500)}`);
  }

  if (wsMessages.length > 0) {
    console.log(`\nWebSocket mesajları (${wsMessages.length}):`);
    for (const m of wsMessages.slice(0, 10)) {
      console.log(`  ${m.sent ? 'SENT' : 'RECV'}: ${m.data?.slice(0, 300)}`);
    }
  }

  await page.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
