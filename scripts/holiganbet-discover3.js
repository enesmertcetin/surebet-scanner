/**
 * Holiganbet - iframe store'dan futbol verilerini çek
 * WAMP WebSocket üzerinden veri akıyor, ama store'da cache'lenmiş olabilir
 */
import { chromium } from 'playwright';
import fs from 'fs';

async function main() {
  console.log('Chrome CDP bağlanıyor...');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0] || await browser.newContext();
  const page = await ctx.newPage();

  // Tüm ws mesajlarını logla
  const wsMessages = [];
  page.on('websocket', ws => {
    if (ws.url().includes('sportsapi')) {
      console.log(`[WS] ${ws.url()}`);
      ws.on('framereceived', frame => {
        const data = frame.payload?.toString();
        if (data && data.length > 100) {
          wsMessages.push(data);
          console.log(`  [WS RECV] ${data.length} bytes - ${data.slice(0, 200)}`);
        }
      });
      ws.on('framesent', frame => {
        const data = frame.payload?.toString();
        if (data && data.length > 10) {
          console.log(`  [WS SENT] ${data.slice(0, 200)}`);
        }
      });
    }
  });

  // Prematch futbol sayfasına git (canlı değil!)
  const PREMATCH_URL = 'https://www.holiganbet10214.com/tr/sports/i/spor/futbol/1/t%C3%BCm%C3%BC/0/lokasyon';
  console.log(`\nPrematch sayfasına gidiliyor: ${PREMATCH_URL}`);
  await page.goto(PREMATCH_URL, { waitUntil: 'networkidle', timeout: 60000 });
  
  console.log('Sayfa yüklendi, 10 sn bekleniyor...');
  await page.waitForTimeout(10000);

  // iframe'i bul
  const frames = page.frames();
  const sportFrame = frames.find(f => f.url().includes('sports2.'));
  
  if (!sportFrame) {
    console.log('Sport frame bulunamadı!');
    console.log('Mevcut frameler:', frames.map(f => f.url().slice(0, 100)));
    await page.close();
    await browser.close();
    return;
  }

  console.log(`\nSport frame: ${sportFrame.url()}`);

  // Store'dan veri çek
  const storeData = await sportFrame.evaluate(() => {
    const s = window.store;
    if (!s) return { error: 'store yok' };
    
    const result = {};
    
    // Store yapısını keşfet
    const storeKeys = Object.keys(s);
    result.storeKeys = storeKeys;
    
    // getState varsa (Redux benzeri)
    if (typeof s.getState === 'function') {
      const state = s.getState();
      result.stateKeys = Object.keys(state);
      
      // Spor/etkinlik verileri
      for (const key of Object.keys(state)) {
        const val = state[key];
        if (val && typeof val === 'object') {
          const subKeys = Object.keys(val);
          result[`state.${key}_keys`] = subKeys.slice(0, 20);
          result[`state.${key}_type`] = Array.isArray(val) ? `array(${val.length})` : `obj(${subKeys.length} keys)`;
          
          // Eğer events/matches varsa, bir örnek al
          if (key.toLowerCase().includes('event') || key.toLowerCase().includes('match') || 
              key.toLowerCase().includes('sport') || key.toLowerCase().includes('market') ||
              key.toLowerCase().includes('odd') || key.toLowerCase().includes('compet')) {
            try {
              const sample = JSON.stringify(val).slice(0, 3000);
              result[`state.${key}_sample`] = sample;
            } catch {}
          }
        }
      }
    }
    
    // dispatch, subscribe vb. metodlar
    result.storeMethods = storeKeys.filter(k => typeof s[k] === 'function');
    
    // omWebapiWampy kontrol
    if (window.omWebapiWampy) {
      result.wampy = Object.keys(window.omWebapiWampy);
    }
    
    return result;
  });

  console.log('\n═══ Store Yapısı ═══');
  console.log(JSON.stringify(storeData, null, 2).slice(0, 10000));

  // WS mesajlarını kaydet
  if (wsMessages.length > 0) {
    console.log(`\n═══ WS Mesajları: ${wsMessages.length} büyük mesaj ═══`);
    for (let i = 0; i < Math.min(5, wsMessages.length); i++) {
      console.log(`\nMesaj ${i+1} (${wsMessages[i].length} bytes):`);
      console.log(wsMessages[i].slice(0, 2000));
    }
    
    // En büyük mesajı dosyaya kaydet (muhtemelen event verisi)
    const largest = wsMessages.sort((a, b) => b.length - a.length)[0];
    if (largest) {
      fs.writeFileSync('artifacts/holiganbet-ws-largest.json', largest, 'utf8');
      console.log(`\nEn büyük WS mesajı kaydedildi: ${largest.length} bytes`);
    }
  }

  await page.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
