/**
 * Holiganbet - WAMP RPC ile prematch veri çekimi
 * WebSocket'e doğrudan bağlanıp upcoming matches aggregator'ı çağır
 */
import { chromium } from 'playwright';
import fs from 'fs';

async function main() {
  console.log('Chrome CDP bağlanıyor...');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0] || await browser.newContext();
  const page = await ctx.newPage();

  // WS mesajlarını topla
  const allSent = [];
  const allRecv = [];

  page.on('websocket', ws => {
    if (!ws.url().includes('sportsapi')) return;
    ws.on('framesent', frame => {
      const d = frame.payload?.toString();
      if (d && d.length > 20) allSent.push(d);
    });
    ws.on('framereceived', frame => {
      const d = frame.payload?.toString();
      if (d && d.length > 50) allRecv.push(d);
    });
  });

  // Turnuva sayfasına git (SuperLig gibi tek bir lig)
  const SUPERLIG_URL = 'https://www.holiganbet10214.com/tr/sports/turnuva-konumu/futbol/1/t%C3%BCrkiye/221/t%C3%BCrkiye-s%C3%BCper-lig-2025-2026/275197217130811392';
  console.log(`Türkiye Süper Lig sayfasına gidiliyor...`);
  await page.goto(SUPERLIG_URL, { waitUntil: 'networkidle', timeout: 60000 });
  
  console.log('10 sn bekleniyor...');
  await page.waitForTimeout(10000);

  // Sent mesajlarından turnuva/upcoming ile ilgili olanları bul
  console.log(`\n═══ SENT messages: ${allSent.length} ═══`);
  for (const m of allSent) {
    // Sadece 48 (CALL) ve 64 (SUBSCRIBE) mesajlarını göster
    if (m.startsWith('[48,') || m.startsWith('[64,')) {
      // Hep bildiğimiz topic'leri atla
      if (m.includes('registrationDismissed') || m.includes('configureFonts')) continue;
      console.log(`  ${m.slice(0, 300)}`);
    }
  }

  // Büyük RECV mesajları (veri içerenler)
  console.log(`\n═══ RECV messages: ${allRecv.length} ═══`);
  const sortedRecv = [...allRecv].sort((a, b) => b.length - a.length);
  for (const m of sortedRecv.slice(0, 10)) {
    console.log(`\n  ${m.length} bytes: ${m.slice(0, 400)}`);
  }

  // En büyük mesajı kaydet
  if (sortedRecv[0]?.length > 5000) {
    fs.writeFileSync('artifacts/holiganbet-superlig-ws.json', sortedRecv[0], 'utf8');
    console.log(`\n→ En büyük mesaj kaydedildi: ${sortedRecv[0].length} bytes`);
  }

  // iframe DOM'u kontrol et
  const sportFrame = page.frames().find(f => f.url().includes('sports2.'));
  if (sportFrame) {
    const domText = await sportFrame.evaluate(() => document.body?.innerText?.slice(0, 5000) || '');
    console.log('\n═══ DOM (ilk 3000 char) ═══');
    console.log(domText.slice(0, 3000));
  }

  await page.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
