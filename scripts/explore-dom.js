import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const contexts = browser.contexts();
  const page = contexts[0].pages()[0];
  
  // Navigate and wait
  console.log('Sayfa yükleniyor...');
  await page.goto('https://dumanbet885.com/tr/Sports/digitain', { waitUntil: 'domcontentloaded', timeout: 120_000 });
  console.log('40 sn bekleniyor...');
  await sleep(40_000);
  
  const digitainFrame = page.frames().find(f => f.url().includes('SportsBook/Home'));
  const apiFrame = page.frames().find(f => f.url().includes('Tools/RequestHelper'));
  
  if (!digitainFrame) { console.log('Frame yok!'); process.exit(1); }
  console.log('OK\n');

  // 1. Mevcut DOM yapısını keşfet — başlıklar, menü seçenekleri, tab'lar
  console.log('━━ DOM yapısı keşfi:');
  const domInfo = await digitainFrame.evaluate(() => {
    const info = {};
    
    // Tüm tab/menu benzeri elementler
    const tabs = document.querySelectorAll('[class*="tab"], [class*="Tab"], [class*="menu"], [class*="Menu"], [class*="nav"], [class*="Nav"]');
    info.tabs = Array.from(tabs).slice(0, 30).map(el => ({
      tag: el.tagName,
      cls: el.className.toString().slice(0, 60),
      text: el.textContent.trim().slice(0, 50),
      children: el.children.length,
    }));

    // "Prematch", "Maç Öncesi", "Spor" gibi kelimeleri ara
    const allText = document.querySelectorAll('*');
    info.prematchElements = [];
    for (const el of allText) {
      const t = el.textContent.trim();
      if (el.children.length <= 2 && (
        t.toLowerCase().includes('prematch') || 
        t.toLowerCase().includes('maç öncesi') || 
        t.toLowerCase().includes('spor bahis') ||
        t.toLowerCase().includes('pre-match') ||
        t === 'Spor' ||
        t === 'Sports'
      )) {
        info.prematchElements.push({
          tag: el.tagName,
          cls: el.className.toString().slice(0, 60),
          text: t.slice(0, 60),
          id: el.id,
          parent: el.parentElement?.className?.toString().slice(0, 40),
        });
      }
    }

    // Sol menüdeki sport items
    const sportItems = document.querySelectorAll('[class*="sport"], [class*="Sport"]');
    info.sportItems = Array.from(sportItems).slice(0, 20).map(el => ({
      tag: el.tagName,
      cls: el.className.toString().slice(0, 60),
      text: el.textContent.trim().slice(0, 40),
      childCount: el.children.length,
    }));

    // Top container class names
    const body = document.body;
    info.bodyClasses = body.className;
    const topContainers = body.querySelectorAll(':scope > div, :scope > div > div');
    info.topDivs = Array.from(topContainers).slice(0, 10).map(el => ({
      cls: el.className.toString().slice(0, 80),
      childCount: el.children.length,
    }));

    // Active class elements (selected tabs etc)
    const activeEls = document.querySelectorAll('[class*="active"], [class*="Active"], [class*="selected"], [class*="Selected"]');
    info.activeElements = Array.from(activeEls).slice(0, 15).map(el => ({
      tag: el.tagName,
      cls: el.className.toString().slice(0, 60),
      text: el.textContent.trim().slice(0, 40),
    }));

    return info;
  });

  console.log('\n--- Tabs/Menu Elements ---');
  domInfo.tabs.forEach(t => console.log(`  <${t.tag}> .${t.cls} [${t.children} children] "${t.text}"`));

  console.log('\n--- Prematch-related Elements ---');
  domInfo.prematchElements.forEach(e => console.log(`  <${e.tag}> .${e.cls} ${e.id ? '#'+e.id : ''} "${e.text}" (parent: ${e.parent})`));

  console.log('\n--- Sport Items ---');
  domInfo.sportItems.forEach(s => console.log(`  <${s.tag}> .${s.cls} [${s.childCount}] "${s.text}"`));

  console.log('\n--- Active Elements ---');
  domInfo.activeElements.forEach(a => console.log(`  <${a.tag}> .${a.cls} "${a.text}"`));

  console.log('\n--- Top Divs ---');
  domInfo.topDivs.forEach(d => console.log(`  .${d.cls} [${d.childCount}]`));

  // 2. URL hash veya route state
  console.log('\n━━ URL/Route:');
  const urlInfo = await digitainFrame.evaluate(() => {
    return {
      href: location.href,
      hash: location.hash,
      pathname: location.pathname,
    };
  });
  console.log(`  href: ${urlInfo.href}`);

  // 3. Check for vue/angular
  console.log('\n━━ Framework:');
  const fwInfo = await digitainFrame.evaluate(() => {
    const patterns = [];
    if (window.__vue_app__) patterns.push('Vue 3 app');
    if (document.querySelector('[data-v-]') || document.querySelector('[class*="v-"]')) patterns.push('Vue template');
    if (window.ng || document.querySelector('app-root')) patterns.push('Angular');
    if (window.__NUXT__) patterns.push('Nuxt');
    if (window.React || document.querySelector('[data-reactroot]')) patterns.push('React');
    
    // Check for Vue 2
    const elWithVue = document.querySelector('#app');
    if (elWithVue && elWithVue.__vue__) patterns.push('Vue 2 instance on #app');
    
    // Check all elements for __vue__
    const allEls = document.querySelectorAll('*');
    for (const el of allEls) {
      if (el.__vue__) { patterns.push('Vue 2 found on ' + el.tagName + '.' + el.className.toString().slice(0,30)); break; }
    }
    
    return patterns.length ? patterns : ['Unknown'];
  });
  console.log('  ' + fwInfo.join(', '));

  console.log('\nBitti!');
  try { await browser.close(); } catch {}
  process.exit(0);
})();
