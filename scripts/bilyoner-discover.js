import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const page = await context.newPage();

  // Network isteklerini yakala
  const apiCalls = [];
  page.on('request', (req) => {
    const url = req.url();
    if ((url.includes('bilyoner.com') || url.includes('sportprogram') || url.includes('iddaa')) &&
        !url.includes('.js') && !url.includes('.css') && !url.includes('.png') && 
        !url.includes('.svg') && !url.includes('.woff') && !url.includes('.ico') &&
        !url.includes('google') && !url.includes('facebook') && !url.includes('adjust') &&
        !url.includes('analytics') && !url.includes('tracking') && !url.includes('cookie') &&
        !url.includes('sentry') && !url.includes('hotjar')) {
      apiCalls.push({
        method: req.method(),
        url: url,
        headers: req.headers(),
      });
    }
  });

  page.on('response', async (resp) => {
    const url = resp.url();
    if (url.includes('bilyoner.com/api') || url.includes('bilyoner.com/rest') ||
        url.includes('sportprogram') || url.includes('/program/') ||
        url.includes('event') || url.includes('match') || url.includes('odds')) {
      try {
        const ct = resp.headers()['content-type'] || '';
        if (ct.includes('json')) {
          const body = await resp.text();
          const entry = apiCalls.find(a => a.url === url);
          if (entry) entry.responsePreview = body.slice(0, 500);
          entry && (entry.responseLen = body.length);
        }
      } catch {}
    }
  });

  console.log('Bilyoner futbol sayfası açılıyor...');
  await page.goto('https://www.bilyoner.com/iddaa/futbol', { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log('15 sn bekleniyor...');
  await sleep(15000);

  // API çağrılarını filtrele ve göster
  console.log(`\n━━ Yakalanan ${apiCalls.length} istek:\n`);
  
  const interesting = apiCalls.filter(a => 
    (a.url.includes('/api/') || a.url.includes('/rest/') || 
     a.url.includes('program') || a.url.includes('event') || 
     a.url.includes('match') || a.url.includes('odds') ||
     a.url.includes('sport') || a.url.includes('bulletin'))
  );

  if (interesting.length > 0) {
    console.log(`İlginç API çağrıları (${interesting.length}):`);
    for (const a of interesting) {
      console.log(`  ${a.method} ${a.url.slice(0, 200)}`);
      if (a.responsePreview) console.log(`    Preview: ${a.responsePreview.slice(0, 300)}`);
      if (a.responseLen) console.log(`    Len: ${a.responseLen}`);
    }
  }

  // Tüm bilyoner API çağrılarını göster
  console.log('\n━━ Tüm bilyoner.com istekleri:');
  const bilyonerCalls = apiCalls.filter(a => a.url.includes('bilyoner.com'));
  for (const a of bilyonerCalls) {
    const path = a.url.replace('https://www.bilyoner.com', '');
    if (!path.startsWith('/public/') && !path.startsWith('/_next/')) {
      console.log(`  ${a.method} ${path.slice(0, 200)}`);
    }
  }

  // Sayfayı bir aşağı kaydır (lazy loading tetikle)
  console.log('\n━━ Scroll yapılıyor...');
  apiCalls.length = 0;
  await page.evaluate(() => window.scrollTo(0, 3000));
  await sleep(5000);
  
  const afterScroll = apiCalls.filter(a => a.url.includes('bilyoner.com') && !a.url.includes('/public/'));
  console.log(`Scroll sonrası ${afterScroll.length} yeni istek:`);
  for (const a of afterScroll) {
    console.log(`  ${a.method} ${a.url.replace('https://www.bilyoner.com', '').slice(0, 200)}`);
  }

  await page.close();
  console.log('\nBitti!');
  process.exit(0);
})();
