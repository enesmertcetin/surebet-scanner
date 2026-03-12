/**
 * Tempobet - HTML içinden veri çıkarma (Faz 3)
 * Server-rendered site - tüm veriler HTML'de
 */
import { chromium } from 'playwright';
import fs from 'fs';

async function main() {
  console.log('Chrome CDP bağlanıyor...');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0] || await browser.newContext();
  const page = await ctx.newPage();

  // Network interceptor - HTML yanıtlarını sakla
  const htmlResponses = [];
  page.on('response', async resp => {
    const url = resp.url();
    const ct = resp.headers()['content-type'] || '';
    if (ct.includes('text/html') && url.includes('sport')) {
      try {
        const body = await resp.text();
        htmlResponses.push({ url, size: body.length, body });
      } catch {}
    }
  });

  // sports.html'e fetch ile eriş
  console.log('sport1.html (Futbol) sayfasına gidiliyor...');
  await page.goto('https://www.1124tempobet.com/sport1.html', { 
    waitUntil: 'domcontentloaded', timeout: 30000 
  });
  await page.waitForTimeout(8000);

  const sportsHtml = await page.content();
  
  console.log(`sport1.html boyutu: ${sportsHtml.length} bytes`);
  
  // HTML'deki inline JS'den veriyi çıkar
  // jsviews template data'sını bul
  const dataMatch = sportsHtml.match(/\$\.templates\([^)]+\)\s*\.link\s*\(\s*"[^"]*"\s*,\s*({[\s\S]*?})\s*\)/);
  if (dataMatch) {
    console.log('\njsViews data bulundu:', dataMatch[1]?.substring(0, 500));
  }

  // JSON verileri bul
  const jsonMatches = sportsHtml.match(/var\s+(\w+)\s*=\s*(\{[^;]{100,}?\});/g) || [];
  console.log(`\nInline JSON değişkenleri: ${jsonMatches.length}`);
  for (const m of jsonMatches.slice(0, 5)) {
    console.log(`  ${m.substring(0, 300)}`);
  }

  // data-* attribute'larını bul
  const dataAttrs = sportsHtml.match(/data-[a-z]+=["'][^"']+["']/gi) || [];
  const uniqueDataAttrs = [...new Set(dataAttrs.map(d => d.split('=')[0]))];
  console.log(`\ndata-* attributes: ${uniqueDataAttrs.join(', ')}`);

  // Script tag'ları içindeki önemli kısımları bul
  const scriptTags = sportsHtml.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
  console.log(`\nScript tag sayısı: ${scriptTags.length}`);
  
  for (let i = 0; i < scriptTags.length; i++) {
    const content = scriptTags[i].replace(/<\/?script[^>]*>/gi, '').trim();
    if (content.length > 50 && content.length < 50000 && 
        (content.includes('sport') || content.includes('event') || content.includes('odds') || 
         content.includes('market') || content.includes('match') || content.includes('league') ||
         content.includes('link') || content.includes('$.templates') || content.includes('filter'))) {
      console.log(`\n=== Script #${i} (${content.length} chars) ===`);
      console.log(content.substring(0, 2000));
    }
  }

  // sport1.html (Futbol) verisi zaten yüklenmiş durumda
  const sport1Html = sportsHtml; // zaten sport1.html'deyiz
  console.log('\n\n═══ sport1.html (FUTBOL) ═══');
  console.log(`sport1.html boyutu: ${sport1Html.length} bytes`);

  // Futbol sayfasındaki inline veriler
  const sport1Scripts = sport1Html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
  console.log(`Script tag sayısı: ${sport1Scripts.length}`);
  
  for (let i = 0; i < sport1Scripts.length; i++) {
    const content = sport1Scripts[i].replace(/<\/?script[^>]*>/gi, '').trim();
    if (content.length > 100 && 
        (content.includes('.link') || content.includes('market') || content.includes('odds') || 
         content.includes('event') || content.includes('league') || content.includes('coupon'))) {
      console.log(`\n=== Futbol Script #${i} (${content.length} chars) ===`);
      console.log(content.substring(0, 3000));
    }
  }

  // HTML'den DOM parse ederek maç listesini çıkar
  console.log('\n\n═══ DOM PARSE: FUTBOL MAÇLARI ═══');
  // Zaten sport1.html'deyiz

  const matchData = await page.evaluate(() => {
    // Tablo yapısını incele
    const tables = document.querySelectorAll('table');
    console.log('Tables:', tables.length);

    // .coupon class'lı elementleri bul (bahis kuponu tablosu)
    const coupons = document.querySelectorAll('.coupon');
    
    // Maç satırlarını bul
    const rows = document.querySelectorAll('tr, .event-row, .match-row, .game-row, [data-eid]');
    
    // Tüm text içeriğini al
    const bodyText = document.body?.innerText || '';
    
    // İlk market/odds tablosunu bul
    const marketHeaders = [...document.querySelectorAll('th, .header, h2, h3')].map(h => h.innerText?.trim()).filter(Boolean);
    
    // Oranları içeren elementler
    const oddsElements = [...document.querySelectorAll('.odd, .odds, .price, .betbox, .betButton, [data-odd], [data-price], [data-fi]')];
    
    // Event container'ları bul
    const events = [...document.querySelectorAll('.event, .match, .game, [data-eid], .bets, [class*="event"], [class*="match"]')];
    
    // ID ile eşleşecek elementleri bul
    const idElements = [...document.querySelectorAll('[id]')].filter(el => 
      el.id.match(/sport|event|match|league|country|coupon/i)
    ).map(el => ({ id: el.id, tag: el.tagName, classes: el.className?.substring?.(0, 100) }));

    return {
      tableCount: tables.length,
      couponCount: coupons.length,
      rowCount: rows.length,
      marketHeaders: marketHeaders.slice(0, 20),
      oddsCount: oddsElements.length,
      eventCount: events.length,
      idElements: idElements.slice(0, 20),
      bodyTextSample: bodyText.substring(0, 3000),
      oddsPreview: oddsElements.slice(0, 10).map(el => ({
        tag: el.tagName,
        class: el.className?.substring?.(0, 60),
        text: el.innerText?.trim()?.substring(0, 60),
        dataAttrs: Object.fromEntries([...el.attributes].filter(a => a.name.startsWith('data-')).map(a => [a.name, a.value?.substring(0, 50)])),
      })),
    };
  });

  console.log('Tables:', matchData.tableCount);
  console.log('Coupons:', matchData.couponCount);
  console.log('Rows:', matchData.rowCount);
  console.log('Odds elements:', matchData.oddsCount);
  console.log('Events:', matchData.eventCount);
  console.log('Market headers:', JSON.stringify(matchData.marketHeaders));
  console.log('ID elements:', JSON.stringify(matchData.idElements, null, 2));
  console.log('\nOdds preview:', JSON.stringify(matchData.oddsPreview, null, 2));
  console.log('\nBody text (ilk 3000):\n', matchData.bodyTextSample);

  // HTML'i kaydet
  fs.writeFileSync('artifacts/tempobet-sport1.html', sport1Html, 'utf8');
  console.log('\n→ artifacts/tempobet-sport1.html kaydedildi');

  await page.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
