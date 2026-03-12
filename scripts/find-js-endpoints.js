import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0].pages()[0];

  console.log('Navigating...');
  await page.goto('https://dumanbet885.com/tr/Sports/digitain', { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await sleep(40_000);

  const digitainFrame = page.frames().find(f => f.url().includes('SportsBook/Home'));
  if (!digitainFrame) { console.log('Frame yok!'); process.exit(1); }

  // JS kaynak kodlarından API endpoint'lerini çıkar
  console.log('━━ JS kaynaklarından API endpoint keşfi...\n');
  
  const endpoints = await digitainFrame.evaluate(() => {
    const found = new Set();
    
    // Tüm script elementlerini kontrol et
    const scripts = document.querySelectorAll('script[src]');
    const scriptUrls = Array.from(scripts).map(s => s.src).filter(s => s.includes('dmnppsportsdigi'));
    
    // Performance entries'den JS dosyalarını bul
    const perfEntries = performance.getEntriesByType('resource')
      .filter(e => e.name.includes('dmnppsportsdigi') && e.name.endsWith('.js'))
      .map(e => e.name);
    
    return { scriptUrls, perfEntries };
  });

  console.log('Script URLs:', endpoints.scriptUrls.length);
  endpoints.scriptUrls.forEach(u => console.log('  ' + u.slice(0, 120)));
  
  console.log('\nPerf JS entries:', endpoints.perfEntries.length);
  endpoints.perfEntries.forEach(u => console.log('  ' + u.split('/').pop()));

  // JS dosyalarının içindeki API endpoint'lerini tara
  console.log('\n━━ JS dosyalarının içinden API endpoint keşfi...');
  
  const apiEndpoints = await digitainFrame.evaluate(async () => {
    // Performance'dan tüm JS URL'lerini al
    const jsUrls = performance.getEntriesByType('resource')
      .filter(e => e.name.includes('dmnppsportsdigi') && e.name.endsWith('.js'))
      .map(e => e.name);
    
    const allEndpoints = new Set();
    
    for (const url of jsUrls.slice(0, 10)) { // İlk 10 JS dosyası
      try {
        const resp = await fetch(url);
        const text = await resp.text();
        
        // "prematch/" veya "Prematch/" içeren stringleri bul
        const matches = text.match(/["']((?:prematch|Prematch|live|Live|common|Common|account|Account)[/][A-Za-z]+)/g);
        if (matches) {
          matches.forEach(m => allEndpoints.add(m.replace(/["']/g, '')));
        }

        // "geteventslist", "getchampionship" gibi kelimeleri bul
        const matches2 = text.match(/["'](get[A-Za-z]*(?:championship|champion|country|region|event|sport)[A-Za-z]*)["']/gi);
        if (matches2) {
          matches2.forEach(m => allEndpoints.add('fn:' + m.replace(/["']/g, '')));
        }
      } catch (e) {
        // ignore
      }
    }
    
    return Array.from(allEndpoints).sort();
  });

  console.log(`\nBulunan ${apiEndpoints.length} endpoint/function:`);
  apiEndpoints.forEach(ep => console.log(`  ${ep}`));

  console.log('\nBitti!');
  try { await browser.close(); } catch {}
  process.exit(0);
})();
