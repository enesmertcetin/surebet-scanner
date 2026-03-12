import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const [, , url, outFile] = process.argv;

if (!url || !outFile) {
  console.error('Usage: node scripts/save-digitain-asset.js <url> <out-file>');
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  locale: 'tr-TR',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
});

const page = await context.newPage();
await page.goto('https://dumanbet885.com/tr/Sports/digitain', {
  waitUntil: 'domcontentloaded',
  timeout: 120_000,
});
await page.waitForTimeout(5_000);

const response = await context.request.get(url, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  },
});

const text = await response.text();
const target = path.resolve(outFile);
await fs.writeFile(target, text, 'utf8');

console.log(`status=${response.status()} saved=${target}`);

await browser.close();
