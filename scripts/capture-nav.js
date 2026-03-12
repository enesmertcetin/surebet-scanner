import { chromium } from 'playwright';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const contexts = browser.contexts();
  const page = contexts[0].pages()[0];

  // Sayfayı navigate et ve bekle
  console.log('Sayfa yükleniyor...');
  await page.goto('https://dumanbet885.com/tr/Sports/digitain', { waitUntil: 'domcontentloaded', timeout: 120_000 });
  console.log('45 sn bekleniyor...');
  await sleep(45_000);

  console.log('Frameler:');
  page.frames().forEach((f,i) => console.log(`  [${i}] ${f.url().slice(0,120)}`));

  const digitainFrame = page.frames().find(f => f.url().includes('SportsBook/Home'));
  if (!digitainFrame) {
    console.log('Digitain frame bulunamadi!');
    page.frames().forEach((f,i) => console.log(`  [${i}] ${f.url().slice(0,120)}`));
    process.exit(1);
  }
  console.log('Digitain frame bulundu:', digitainFrame.url().slice(0,80));

  // Network isteklerini dinle
  const requests = [];
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('dmnppsportsdigi') && !url.includes('RequestHelper') && !url.includes('.js') && !url.includes('.css') && !url.includes('.svg') && !url.includes('.png') && !url.includes('.woff')) {
      requests.push({ method: req.method(), url: url });
    }
  });

  console.log('\nNetwork dinleniyor... 5 sn mevcut trafik...');
  await sleep(5000);

  if (requests.length > 0) {
    console.log(`\nYakalanan ${requests.length} istek:`);
    requests.forEach((r, i) => {
      const shortUrl = r.url.replace(/https:\/\/sport\.dmnppsportsdigi\.com\/[^/]+\//, '');
      console.log(`  [${i}] ${r.method} ${shortUrl}`);
    });
  }

  // Futbol'a tıkla
  console.log('\n━━ Futbol menüsüne tıklanıyor...');
  requests.length = 0;

  // Digitain frame içinde futbol linkini bul ve tıkla
  try {
    // Sport menüsünde Futbol/Football elementini bul
    const clicked = await digitainFrame.evaluate(() => {
      // "Futbol" veya "Football" yazan elemente tıkla
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        if (el.textContent.trim() === 'Futbol' && el.children.length === 0) {
          el.click();
          return `Tiklandi: ${el.tagName} - ${el.textContent.trim()}`;
        }
      }
      // Alternatif: sportId=1 içeren link
      const sportLinks = document.querySelectorAll('[href*="sportId=1"], [data-sport-id="1"], .sport-item');
      for (const el of sportLinks) {
        if (el.textContent.includes('Futbol') || el.textContent.includes('Football')) {
          el.click();
          return `Tiklandi (link): ${el.tagName} - ${el.textContent.trim().slice(0,50)}`;
        }
      }
      // Son çare: ilk sport item'a tıkla
      const items = document.querySelectorAll('.sport-list-item, .sport-item, [class*="sport"]');
      const found = [];
      items.forEach(el => found.push(`${el.tagName}.${el.className.slice(0,30)}: ${el.textContent.trim().slice(0,30)}`));
      return `Futbol bulunamadi. Bulunanlar: ${found.slice(0,10).join(' | ')}`;
    });
    console.log('  ' + clicked);
  } catch (err) {
    console.log('  Tıklama hatası:', err.message.slice(0,100));
  }

  // Biraz bekle ve yakalananlara bak
  console.log('\n10 sn bekleniyor...');
  await sleep(10000);

  if (requests.length > 0) {
    console.log(`\nFutbol sonrası yakalanan ${requests.length} istek:`);
    requests.forEach((r, i) => {
      const shortUrl = r.url.replace(/https:\/\/sport\.dmnppsportsdigi\.com\/[^/]+\//, '');
      console.log(`  [${i}] ${r.method} ${shortUrl}`);
    });
  } else {
    console.log('\nYeni istek yok.');
  }

  // Şimdi Vue app'ın router state'ine bakalım
  console.log('\n━━ Vue/Angular router durumu:');
  try {
    const routerState = await digitainFrame.evaluate(() => {
      // Vue devtools
      if (window.__vue_app__) return 'Vue: ' + JSON.stringify(window.__vue_app__.$route);
      // Angular
      if (window.ng) return 'Angular detected';
      // Hash/URL
      return 'URL: ' + location.href + ' | Hash: ' + location.hash;
    });
    console.log('  ' + routerState);
  } catch (e) {
    console.log('  ' + e.message.slice(0,100));
  }

  console.log('\nBitti!');
  try { await browser.close(); } catch {}
  process.exit(0);
})();
