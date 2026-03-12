import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const context = browser.contexts()[0];
const page = await context.newPage();

try {
  await page.goto('https://www.holiganbet1214.com', { timeout: 15000 });
  console.log('Status: OK');
  console.log('URL:', page.url());
  console.log('Title:', await page.title());
  
  // Check if sports/WAMP API exists
  const wsUrl = 'wss://sportsapi.holiganbet1214.com/v2';
  console.log('Expected WS URL:', wsUrl);
} catch (e) {
  console.log('holiganbet1214.com ERROR:', e.message.slice(0, 150));
  
  // Try without www
  try {
    await page.goto('https://holiganbet1214.com', { timeout: 10000 });
    console.log('Without www - URL:', page.url());
    console.log('Without www - Title:', await page.title());
  } catch (e2) {
    console.log('holiganbet1214.com (no www) ERROR:', e2.message.slice(0, 150));
  }
}

await page.close();
await browser.close();
