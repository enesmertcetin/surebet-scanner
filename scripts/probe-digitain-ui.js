import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  locale: 'tr-TR',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  viewport: { width: 1440, height: 900 },
});

const page = await context.newPage();
const requests = [];

context.on('response', async (response) => {
  const request = response.request();
  const url = response.url();
  if (!url.includes('sport.dmnppsportsdigi.com')) {
    return;
  }
  if (!['fetch', 'xhr'].includes(request.resourceType())) {
    return;
  }
  requests.push({ status: response.status(), method: request.method(), url });
});

await page.goto('https://dumanbet885.com/tr/Sports/digitain', {
  waitUntil: 'domcontentloaded',
  timeout: 120_000,
});
await page.waitForTimeout(30_000);

console.log('FRAMES');
console.log(JSON.stringify(page.frames().map((item) => item.url()), null, 2));

const frame = page
  .frames()
  .find((item) => item.url().includes('sport.dmnppsportsdigi.com'));

if (!frame) {
  throw new Error('Digitain frame not found');
}

await frame.waitForTimeout(5_000);

const clickableTexts = await frame.locator('a, button, [role="button"], .sportItem, .sport-item').evaluateAll((elements) =>
  elements
    .map((el) => ({
      text: (el.textContent || '').trim().replace(/\s+/g, ' '),
      cls: el.className,
      tag: el.tagName,
    }))
    .filter((item) => item.text)
    .slice(0, 60)
);

console.log('CLICKABLES');
console.log(JSON.stringify(clickableTexts, null, 2));

const soccerCandidate = frame
  .locator('text=/Futbol|Football/i')
  .first();

if (await soccerCandidate.count()) {
  await soccerCandidate.click({ timeout: 10_000 });
  await frame.waitForTimeout(8_000);
}

const uniqueRequests = [];
const seen = new Set();
for (const item of requests) {
  const key = `${item.status} ${item.method} ${item.url}`;
  if (!seen.has(key)) {
    seen.add(key);
    uniqueRequests.push(item);
  }
}

console.log('REQUESTS');
console.log(JSON.stringify(uniqueRequests, null, 2));

await browser.close();
