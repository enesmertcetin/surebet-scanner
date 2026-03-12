/**
 * Tempobet - Keşif Script'i
 * Site yapısını, iframe'leri, API'leri ve altyapıyı keşfet
 */
import { chromium } from 'playwright';

async function main() {
  console.log('Chrome CDP bağlanıyor...');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0] || await browser.newContext();
  const page = await ctx.newPage();

  // Network isteklerini takip et
  const requests = [];
  page.on('request', req => {
    const url = req.url();
    if (url.includes('api') || url.includes('sport') || url.includes('bet') || 
        url.includes('odds') || url.includes('.json') || url.includes('graphql') ||
        url.includes('wss') || url.includes('ws')) {
      requests.push({ method: req.method(), url: url.substring(0, 200) });
    }
  });

  // WebSocket bağlantılarını takip et
  const wsConnections = [];
  page.on('websocket', ws => {
    console.log(`\n🔌 WebSocket: ${ws.url()}`);
    wsConnections.push(ws.url());
    
    let msgCount = 0;
    ws.on('framereceived', frame => {
      msgCount++;
      if (msgCount <= 5) {
        const data = typeof frame.payload === 'string' ? frame.payload : frame.payload?.toString();
        console.log(`  WS RECV [${data?.length || 0}b]: ${data?.substring(0, 200)}`);
      }
    });
    ws.on('framesent', frame => {
      const data = typeof frame.payload === 'string' ? frame.payload : frame.payload?.toString();
      if (data?.length < 500) console.log(`  WS SENT: ${data?.substring(0, 200)}`);
    });
  });

  console.log('Sayfaya gidiliyor: https://www.1124tempobet.com');
  try {
    await page.goto('https://www.1124tempobet.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    console.log('goto hatası (devam):', e.message.substring(0, 100));
  }
  
  console.log('15 sn bekleniyor...');
  await page.waitForTimeout(15000);

  // Sayfa bilgileri
  console.log('\n═══ SAYFA BİLGİLERİ ═══');
  console.log('URL:', page.url());
  console.log('Title:', await page.title());

  // Frame'leri listele
  const frames = page.frames();
  console.log(`\n═══ FRAMES (${frames.length}) ═══`);
  for (const f of frames) {
    console.log(`  ${f.url().substring(0, 150)}`);
  }

  // Sport/bahis ile ilgili bağlantılar
  console.log(`\n═══ ÖNEMLİ NETWORK İSTEKLERİ (${requests.length}) ═══`);
  const uniq = [...new Set(requests.map(r => `${r.method} ${r.url}`))];
  for (const r of uniq.slice(0, 40)) {
    console.log(`  ${r}`);
  }

  // WebSocket bağlantıları
  console.log(`\n═══ WEBSOCKET BAĞLANTILARI (${wsConnections.length}) ═══`);
  for (const ws of wsConnections) {
    console.log(`  ${ws}`);
  }

  // DOM'daki önemli elementler
  const domInfo = await page.evaluate(() => {
    const scripts = [...document.querySelectorAll('script[src]')].map(s => s.src).filter(s => 
      s.includes('sport') || s.includes('bet') || s.includes('wamp') || s.includes('app') || s.includes('main') || s.includes('vendor') || s.includes('chunk')
    );
    const iframes = [...document.querySelectorAll('iframe')].map(i => ({ src: i.src || i.getAttribute('src'), id: i.id, name: i.name }));
    const metas = [...document.querySelectorAll('meta')].map(m => ({ name: m.name || m.getAttribute('property'), content: m.content })).filter(m => m.name);
    
    // Body text hint
    const bodyText = document.body?.innerText?.substring(0, 2000) || '';
    
    return { scripts, iframes, metas: metas.slice(0, 10), bodyText };
  });

  console.log('\n═══ SCRIPTS ═══');
  for (const s of domInfo.scripts) console.log(`  ${s.substring(0, 150)}`);

  console.log('\n═══ IFRAMES ═══');
  for (const i of domInfo.iframes) console.log(`  src=${i.src?.substring(0, 150)} id=${i.id} name=${i.name}`);

  console.log('\n═══ META ═══');
  for (const m of domInfo.metas) console.log(`  ${m.name}: ${m.content?.substring(0, 100)}`);

  console.log('\n═══ BODY TEXT (ilk 2000 char) ═══');
  console.log(domInfo.bodyText);

  // Sportbook sayfasına git
  console.log('\n\n═══ SPOR sayfasına geçiliyor ═══');
  
  // Spor linki bul
  const sportLink = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a')];
    const sportLinks = links.filter(l => {
      const text = l.innerText?.toLowerCase() || '';
      const href = l.href?.toLowerCase() || '';
      return text.includes('spor') || text.includes('sport') || href.includes('sport') || href.includes('spor');
    });
    return sportLinks.map(l => ({ text: l.innerText?.trim()?.substring(0, 50), href: l.href }));
  });
  console.log('Sport linkleri:', JSON.stringify(sportLink?.slice(0, 10), null, 2));

  // Eğer spor sayfası varsa git
  if (sportLink.length > 0) {
    const bestLink = sportLink.find(l => l.href && !l.href.includes('javascript:')) || sportLink[0];
    if (bestLink?.href) {
      console.log(`\nSpor sayfasına gidiliyor: ${bestLink.href}`);
      try {
        await page.goto(bestLink.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } catch (e) {
        console.log('Spor goto hatası:', e.message.substring(0, 100));
      }
      await page.waitForTimeout(10000);

      const frames2 = page.frames();
      console.log(`\nSpor sayfası FRAMES (${frames2.length}):`);
      for (const f of frames2) {
        console.log(`  ${f.url().substring(0, 150)}`);
      }

      console.log(`\nYeni WS bağlantıları: ${wsConnections.length}`);
      for (const ws of wsConnections) console.log(`  ${ws}`);

      // Yeni network istekleri
      const newReqs = [...new Set(requests.map(r => `${r.method} ${r.url}`))];
      console.log(`\nToplam API istekleri: ${newReqs.length}`);
      for (const r of newReqs.slice(uniq.length, uniq.length + 30)) {
        console.log(`  ${r}`);
      }

      // Spor sayfası DOM
      const sportDom = await page.evaluate(() => {
        const iframes = [...document.querySelectorAll('iframe')].map(i => ({ src: i.src?.substring(0, 200), id: i.id }));
        return { iframes, bodyText: document.body?.innerText?.substring(0, 2000) || '' };
      });
      
      console.log('\nSpor sayfası iframes:');
      for (const i of sportDom.iframes) console.log(`  ${i.src} (id=${i.id})`);
      
      console.log('\nSpor sayfası body text (ilk 2000):');
      console.log(sportDom.bodyText);
    }
  }

  await page.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
