import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const contexts = browser.contexts();
  const page = contexts[0].pages()[0];
  
  console.log('Sayfa yükleniyor...');
  await page.goto('https://dumanbet885.com/tr/Sports/digitain', { waitUntil: 'domcontentloaded', timeout: 120_000 });
  console.log('40 sn bekleniyor...');
  await sleep(40_000);
  
  const digitainFrame = page.frames().find(f => f.url().includes('SportsBook/Home'));
  if (!digitainFrame) { console.log('Frame yok!'); process.exit(1); }
  console.log('OK\n');

  // Network isteklerini dinle
  const captured = [];
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('dmnppsportsdigi') && !url.includes('RequestHelper') && 
        !url.includes('.js') && !url.includes('.css') && !url.includes('.svg') && 
        !url.includes('.png') && !url.includes('.woff') && !url.includes('.ttf') &&
        !url.includes('signalr') && !url.includes('SportsBook')) {
      const shortUrl = url.replace(/https:\/\/sport\.dmnppsportsdigi\.com\/[^/]+\//, '');
      captured.push({ method: req.method(), url: shortUrl, ts: Date.now() });
    }
  });

  // ── 1) "Genel Görünüm" tabına tıkla (Overview) ──
  console.log('━━ "Genel Görünüm" tabına tıklanıyor...');
  captured.length = 0;
  
  const clickResult1 = await digitainFrame.evaluate(() => {
    const items = document.querySelectorAll('.tg__submenu__item');
    for (const el of items) {
      if (el.textContent.trim() === 'Genel Görünüm') {
        el.click();
        return 'Tıklandı: Genel Görünüm';
      }
    }
    return 'Bulunamadı! Items: ' + Array.from(items).map(i => i.textContent.trim()).join(', ');
  });
  console.log('  ' + clickResult1);
  
  await sleep(8000);
  console.log(`  Yakalanan: ${captured.length} istek`);
  captured.forEach((r, i) => console.log(`    [${i}] ${r.method} ${r.url.slice(0, 200)}`));

  // ── 2) Sol panelde bir şampiyonaya tıkla (Türkiye Super Lig) ──
  console.log('\n━━ "Türkiye. Super Lig"e tıklanıyor...');
  captured.length = 0;
  
  const clickResult2 = await digitainFrame.evaluate(() => {
    const items = document.querySelectorAll('.tg__left_menu_item');
    for (const el of items) {
      if (el.textContent.includes('Türkiye') && el.textContent.includes('Super Lig')) {
        el.click();
        return 'Tıklandı: ' + el.textContent.trim();
      }
    }
    // İlk lig item'a tıkla
    if (items.length > 0) {
      items[0].click();
      return 'İlk item tıklandı: ' + items[0].textContent.trim();
    }
    return 'Bulunamadı!';
  });
  console.log('  ' + clickResult2);
  
  await sleep(8000);
  console.log(`  Yakalanan: ${captured.length} istek`);
  captured.forEach((r, i) => console.log(`    [${i}] ${r.method} ${r.url.slice(0, 200)}`));

  // ── 3) "Etkinlik Görünümü" tabına tıkla ──
  console.log('\n━━ "Etkinlik Görünümü" tabına tıklanıyor...');
  captured.length = 0;
  
  const clickResult3 = await digitainFrame.evaluate(() => {
    const items = document.querySelectorAll('.tg__submenu__item');
    for (const el of items) {
      if (el.textContent.trim() === 'Etkinlik Görünümü') {
        el.click();
        return 'Tıklandı: Etkinlik Görünümü';
      }
    }
    return 'Bulunamadı!';
  });
  console.log('  ' + clickResult3);
  
  await sleep(8000);
  console.log(`  Yakalanan: ${captured.length} istek`);
  captured.forEach((r, i) => console.log(`    [${i}] ${r.method} ${r.url.slice(0, 200)}`));

  // ── 4) Futbol sporuna tıkla (sol panelden) ──
  console.log('\n━━ "Futbol" sporuna tıklanıyor...');
  captured.length = 0;
  
  const clickResult4 = await digitainFrame.evaluate(() => {
    // Önce sport_front_icon-1 (futbol ikonu) elementinin parentını bul
    const icons = document.querySelectorAll('.sport_front_icon-1');
    for (const icon of icons) {
      const parent = icon.closest('.tg__left_menu_item') || icon.parentElement;
      if (parent) {
        parent.click();
        return 'Futbol ikonu tıklandı: ' + parent.textContent.trim().slice(0, 50);
      }
    }
    // Tüm sol menü item'larından Futbol'u bul
    const items = document.querySelectorAll('.tg__left_menu_item, [class*="left_menu"]');
    for (const el of items) {
      if (el.textContent.trim().startsWith('Futbol')) {
        el.click();
        return 'Futbol menü item tıklandı: ' + el.textContent.trim().slice(0, 50);
      }
    }
    return 'Futbol bulunamadı. Menü items: ' + Array.from(document.querySelectorAll('.tg__left_menu_item')).map(e => e.textContent.trim().slice(0,30)).join(' | ');
  });
  console.log('  ' + clickResult4);
  
  await sleep(8000);
  console.log(`  Yakalanan: ${captured.length} istek`);
  captured.forEach((r, i) => console.log(`    [${i}] ${r.method} ${r.url.slice(0, 200)}`));

  console.log('\nBitti!');
  try { await browser.close(); } catch {}
  process.exit(0);
})();
