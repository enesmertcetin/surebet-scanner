import { chromium } from 'playwright';
import fs from 'fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const page = await context.newPage();

  console.log('Bilyoner futbol sayfası açılıyor...');
  await page.goto('https://www.bilyoner.com/iddaa/futbol', { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(5000);
  console.log('Sayfa yüklendi, API çağrılıyor...');

  // Bilyoner API'ye direkt istek at (çerezler/headers Chrome'dan gelecek)
  const apiUrl = 'https://www.bilyoner.com/api/v3/mobile/aggregator/gamelist/all/v1?tabType=1&bulletinType=2';

  const result = await page.evaluate(async (url) => {
    const resp = await fetch(url, { credentials: 'include' });
    if (!resp.ok) return { error: resp.status };
    const data = await resp.json();
    return data;
  }, apiUrl);

  if (result.error) {
    console.log('API hata:', result.error);
    // Önce sayfayı aç
    console.log('Sayfa açılıyor...');
    await page.goto('https://www.bilyoner.com/iddaa/futbol', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(10000);
    
    // Tekrar dene
    const result2 = await page.evaluate(async (url) => {
      const resp = await fetch(url, { credentials: 'include' });
      if (!resp.ok) return { error: resp.status };
      const text = await resp.text();
      return { text, len: text.length };
    }, apiUrl);
    
    if (result2.error) {
      console.log('Hala hata:', result2.error);
      process.exit(1);
    }
    
    fs.writeFileSync('artifacts/bilyoner-raw.json', result2.text);
    console.log(`Ham veri kaydedildi: ${result2.len} byte`);
  } else {
    // Veri geldi
    const events = result.events || {};
    const eventCount = Object.keys(events).length;
    console.log(`${eventCount} etkinlik alındı`);

    fs.writeFileSync('artifacts/bilyoner-football-raw.json', JSON.stringify(result, null, 2));
    console.log('→ artifacts/bilyoner-football-raw.json');

    // Yapıyı incele
    const firstId = Object.keys(events)[0];
    const first = events[firstId];
    console.log('\nÖrnek event keys:', Object.keys(first).join(', '));
    console.log('id:', first.id);
    console.log('competitionId:', first.competitionId);
    
    // marketGroups yapısını incele
    if (first.marketGroups) {
      console.log('\nmarketGroups:', first.marketGroups.length);
      for (const mg of first.marketGroups) {
        console.log(`  odds: ${mg.odds?.length}`);
        if (mg.odds) {
          for (const o of mg.odds.slice(0, 6)) {
            console.log(`    ${o.n} = ${o.val}`);
          }
        }
      }
    }

    // competitions bilgisi
    if (result.competitions) {
      const compKeys = Object.keys(result.competitions);
      console.log(`\ncompetitions: ${compKeys.length}`);
      const firstComp = result.competitions[compKeys[0]];
      if (firstComp) console.log('Örnek comp:', JSON.stringify(firstComp).slice(0, 300));
    }

    // Maç ismi nereden geliyor?
    console.log('\nEvent alanları:');
    for (const [k, v] of Object.entries(first)) {
      if (typeof v === 'string' || typeof v === 'number') {
        console.log(`  ${k}: ${v}`);
      }
    }
  }

  await page.close();
  console.log('\nBitti!');
  process.exit(0);
})();
