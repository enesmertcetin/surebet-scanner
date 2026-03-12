import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const context = browser.contexts()[0];
const page = await context.newPage();

try {
  // Google search for current Holiganbet domain
  await page.goto('https://www.google.com/search?q=holiganbet+g%C3%BCncel+giri%C5%9F+2025', { timeout: 15000 });
  await page.waitForTimeout(3000);
  
  const text = await page.innerText('body');
  const matches = text.match(/holiganbet\d+/gi);
  if (matches) console.log('Found in text:', [...new Set(matches)]);
  
  const links = await page.$$eval('a[href]', els => els.map(a => a.href).filter(h => /holiganbet\d+/.test(h)));
  console.log('Links with numbered domain:', links.slice(0, 10));
  
  // Also check all links that contain holiganbet
  const allLinks = await page.$$eval('a[href]', els => els.map(a => a.href).filter(h => h.toLowerCase().includes('holiganbet')));
  console.log('All holiganbet links:', allLinks.slice(0, 10));
  
} catch (e) {
  console.log('Google error:', e.message.slice(0, 150));
}

// Try a second search
try {
  await page.goto('https://www.google.com/search?q=%22holiganbet%22+site+giris+today', { timeout: 15000 });
  await page.waitForTimeout(3000);
  
  const text = await page.innerText('body');
  const matches = text.match(/holiganbet\d+/gi);
  if (matches) console.log('Found in text (2nd):', [...new Set(matches)]);
} catch (e) {
  console.log('2nd search error:', e.message.slice(0, 150));
}

// Try directly checking higher domain numbers
console.log('\nChecking higher domain numbers...');
for (let i = 10250; i <= 10260; i++) {
  try {
    const url = `https://holiganbet${i}.com`;
    await page.goto(url, { timeout: 5000, waitUntil: 'domcontentloaded' });
    const title = await page.title();
    console.log(`${url} -> OK, title: ${title}`);
    break;
  } catch (e) {
    const msg = e.message.slice(0, 60);
    if (!msg.includes('CERT_AUTHORITY') && !msg.includes('NAME_NOT_RESOLVED')) {
      console.log(`holiganbet${i}.com -> ${msg}`);
    }
  }
}

await page.close();
await browser.close();
