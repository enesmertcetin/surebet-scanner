/**
 * Holiganbet - DOM'dan prematch futbol verilerini çek
 * iframe'de "Gelecek Etkinlikler"e tıklayıp, render edilmiş verileri oku
 * Ayrıca WAMP mesajlarını yakınlaştırmak için tüm SENT/RECV'leri logla
 */
import { chromium } from 'playwright';
import fs from 'fs';

async function main() {
  console.log('Chrome CDP bağlanıyor...');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0] || await browser.newContext();
  const page = await ctx.newPage();

  const wsRecv = [];

  page.on('websocket', ws => {
    if (!ws.url().includes('sportsapi')) return;
    
    ws.on('framesent', frame => {
      const data = frame.payload?.toString();
      if (data && data.length > 20 && !data.startsWith('[70,')) {
        console.log(`  [SENT] ${data.slice(0, 250)}`);
      }
    });
    
    ws.on('framereceived', frame => {
      const data = frame.payload?.toString();
      if (!data || data.length < 100) return;
      wsRecv.push(data);
      if (data.length > 5000) {
        console.log(`  [RECV] ${data.length} bytes`);
      }
    });
  });

  const FOOTBALL_URL = 'https://www.holiganbet10214.com/tr/sports/i/spor/futbol/1/t%C3%BCm%C3%BC/0/lokasyon';
  console.log(`Sayfaya gidiliyor...`);
  await page.goto(FOOTBALL_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(5000);

  const sportFrame = page.frames().find(f => f.url().includes('sports2.'));
  if (!sportFrame) { console.log('Frame yok!'); return; }

  // Gelecek Etkinlikler sekmesine tıkla
  console.log('\n"Gelecek Etkinlikler" tıklanıyor...');
  await sportFrame.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find(e => e.textContent?.trim() === 'Gelecek Etkinlikler');
    if (el) el.click();
  });
  
  console.log('8 sn bekleniyor...');
  await page.waitForTimeout(8000);

  // Şimdi store'u kontrol et — "upcoming" veya "notLive" ilgili bir slice var mı?
  const storeCheck = await sportFrame.evaluate(() => {
    const state = window.store?.getState();
    if (!state) return 'no store';
    const keys = Object.keys(state);
    const result = {};
    for (const k of keys) {
      const v = state[k];
      const size = JSON.stringify(v)?.length || 0;
      if (size > 1000) result[k] = size;
    }
    return result;
  });
  console.log('Store büyük slice\'lar:', storeCheck);

  // upcoming slice varsa çek
  const upcomingSliceKey = Object.keys(storeCheck).find(k => 
    k.includes('upcoming') || k.includes('Upcoming') || k.includes('notLive') || 
    k.includes('NOT_LIVE') || (!k.includes('live') && k.includes('Grouped'))
  );
  
  if (upcomingSliceKey) {
    console.log(`\nUpcoming slice bulundu: ${upcomingSliceKey}`);
    const sliceData = await sportFrame.evaluate((key) => {
      return JSON.stringify(window.store.getState()[key]);
    }, upcomingSliceKey);
    fs.writeFileSync('artifacts/holiganbet-upcoming-store.json', sliceData, 'utf8');
    console.log(`Kaydedildi: ${sliceData.length} bytes`);
  }

  // DOM'dan maç verilerini çek — her lig için turnuva ve maçları topla
  console.log('\nDOM\'dan maç verileri çekiliyor...');
  const domData = await sportFrame.evaluate(() => {
    const text = document.body?.innerText || '';
    return text;
  });
  
  // İlk 5000 karakter 
  console.log('\nDOM text (ilk 3000):');
  console.log(domData.slice(0, 3000));

  // Tüm tıklanabilir turnuvalar
  const tournaments = await sportFrame.evaluate(() => {
    // Turnuva/lig linklerini bul
    const links = [...document.querySelectorAll('a[href*="turnuva"], a[href*="tournament"], [class*="Tournament"], [class*="GroupHeader"]')];
    return links.map(l => ({
      text: l.textContent?.trim()?.slice(0, 100),
      href: l.href || l.getAttribute('href'),
      tag: l.tagName,
      cls: l.className?.slice(0, 80),
    })).slice(0, 30);
  });
  console.log('\nTurnuvalar:', JSON.stringify(tournaments, null, 2));

  // WS mesajlarından prematch olanları bul
  const prematchMsgs = wsRecv.filter(m => 
    m.includes('NOT_LIVE') || m.includes('upcoming') || m.includes('UPCOMING') ||
    m.includes('groupedMatchList')
  );
  console.log(`\nPrematch WS mesajları: ${prematchMsgs.length}`);
  for (const m of prematchMsgs.slice(0, 3)) {
    console.log(`  ${m.length} bytes: ${m.slice(0, 500)}`);
  }

  // Büyük WS mesajlarını kaydet
  const largeWs = wsRecv.filter(m => m.length > 50000).sort((a, b) => b.length - a.length);
  if (largeWs.length > 0) {
    fs.writeFileSync('artifacts/holiganbet-ws-all-large.json', JSON.stringify(largeWs.map(m => m.slice(0, 50000))), 'utf8');
    console.log(`\n${largeWs.length} büyük WS mesajı kaydedildi`);
  }

  await page.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
