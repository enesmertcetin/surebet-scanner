/**
 * Holiganbet - prematch futbol verilerini çek
 * 1) WAMP WS bağlantısı üzerinden prematch matches aggregator'ı tetikle
 * 2) veya iframe'de "Gelecek Etkinlikler"e tıklayıp WS verilerini yakala
 */
import { chromium } from 'playwright';
import fs from 'fs';

async function main() {
  console.log('Chrome CDP bağlanıyor...');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0] || await browser.newContext();
  const page = await ctx.newPage();

  const allWsData = [];
  let biggestMsg = '';

  page.on('websocket', ws => {
    if (!ws.url().includes('sportsapi')) return;
    console.log(`[WS] ${ws.url()}`);
    
    ws.on('framesent', frame => {
      const data = frame.payload?.toString();
      if (data?.includes('matches-aggregator') || data?.includes('NOT_LIVE') || 
          data?.includes('upcoming') || data?.includes('initialDump')) {
        console.log(`  [SENT] ${data.slice(0, 300)}`);
      }
    });
    
    ws.on('framereceived', frame => {
      const data = frame.payload?.toString();
      if (!data || data.length < 50) return;
      
      allWsData.push(data);
      if (data.length > biggestMsg.length) biggestMsg = data;
      
      // Büyük mesajları özellikle logla
      if (data.length > 5000) {
        console.log(`  [RECV] ${data.length} bytes - ${data.slice(0, 300)}`);
      }
    });
  });

  const FOOTBALL_URL = 'https://www.holiganbet10214.com/tr/sports/i/spor/futbol/1/t%C3%BCm%C3%BC/0/lokasyon';
  console.log(`\nSayfaya gidiliyor: ${FOOTBALL_URL}`);
  await page.goto(FOOTBALL_URL, { waitUntil: 'networkidle', timeout: 60000 });
  
  console.log('Sayfa yüklendi, 5 sn bekleniyor...');
  await page.waitForTimeout(5000);

  // iframe'i bul
  const sportFrame = page.frames().find(f => f.url().includes('sports2.'));
  if (!sportFrame) {
    console.log('Sport frame bulunamadı!');
    await page.close(); await browser.close(); return;
  }
  console.log(`Sport frame: ${sportFrame.url()}`);

  // "Gelecek Etkinlikler" sekmesine tıkla
  console.log('\n"Gelecek Etkinlikler" sekmesine tıklanıyor...');
  try {
    // Text-based click
    const clicked = await sportFrame.evaluate(() => {
      const items = document.querySelectorAll('[class*="MenuItem"], [class*="menu-item"], a, span, div');
      for (const el of items) {
        const text = el.textContent?.trim();
        if (text === 'Gelecek Etkinlikler' || text === 'Upcoming Events') {
          el.click();
          return `Clicked: ${el.tagName} - ${text}`;
        }
      }
      // Alt yöntem: sınıf adı ile
      const nextEventsBtn = document.querySelector('[class*="NextEvents"]');
      if (nextEventsBtn) {
        nextEventsBtn.click();
        return 'Clicked via NextEvents class';
      }
      return 'Not found';
    });
    console.log(`Tıklama sonucu: ${clicked}`);
  } catch (e) {
    console.log('Tıklama hatası:', e.message);
  }

  console.log('10 sn bekleniyor (prematch verileri yükleniyor)...');
  await page.waitForTimeout(10000);

  // Şimdi iframe içinden WAMP RPC ile prematch maçları çekelim
  console.log('\nWAMP RPC ile prematch verisi çekiliyor...');
  
  const prematchData = await sportFrame.evaluate(async () => {
    const wampy = window.omWebapiWampy;
    if (!wampy) return { error: 'wampy yok' };
    
    // wampy methods
    const methods = Object.keys(wampy).filter(k => typeof wampy[k] === 'function');

    // store'dan prematch verisi kontrol et
    const store = window.store;
    if (!store) return { error: 'store yok' }; 
    
    const state = store.getState();
    const keys = Object.keys(state);
    
    // Prematch ile ilgili state slices
    const prematchKeys = keys.filter(k => 
      k.toLowerCase().includes('upcoming') || 
      k.toLowerCase().includes('prematch') || 
      k.toLowerCase().includes('notlive') || 
      k.toLowerCase().includes('not_live') ||
      k.toLowerCase().includes('grouped') ||
      k.toLowerCase().includes('match')
    );

    const result = {
      wampyMethods: methods,
      allStateKeys: keys,
      prematchKeys,
    };

    // Her prematch key'in verisini topla
    for (const key of prematchKeys) {
      const val = state[key];
      if (!val) continue;
      try {
        const json = JSON.stringify(val);
        result[key + '_size'] = json.length;
        result[key + '_preview'] = json.slice(0, 2000);
      } catch {}
    }
    
    return result;
  });

  console.log('\n═══ Prematch Data ═══');
  console.log('Wampy methods:', prematchData.wampyMethods);
  console.log('All state keys:', prematchData.allStateKeys);
  console.log('Prematch keys:', prematchData.prematchKeys);
  
  for (const key of (prematchData.prematchKeys || [])) {
    console.log(`\n--- ${key} (${prematchData[key + '_size']} bytes) ---`);
    console.log(prematchData[key + '_preview']?.slice(0, 1000));
  }

  // WS mesajları
  console.log(`\n═══ Toplam WS mesajı: ${allWsData.length} ═══`);
  const large = allWsData.filter(d => d.length > 10000).sort((a, b) => b.length - a.length);
  console.log(`Büyük mesajlar (>10KB): ${large.length}`);
  
  for (const msg of large.slice(0, 3)) {
    console.log(`\n${msg.length} bytes: ${msg.slice(0, 500)}`);
  }

  // En büyük mesajı kaydet
  if (biggestMsg.length > 1000) {
    fs.writeFileSync('artifacts/holiganbet-ws-prematch.json', biggestMsg, 'utf8');
    console.log(`\nEn büyük mesaj kaydedildi: ${biggestMsg.length} bytes`);
  }

  await page.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
