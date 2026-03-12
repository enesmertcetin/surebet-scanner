import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const outputPath = path.resolve('artifacts/digitain-network.json');
const targetUrl = 'https://dumanbet885.com/tr/Sports/digitain';

const interestingHostFragments = [
  'dumanbet885.com/api/Api/Betting/StartDigitain',
  'sport.dmnppsportsdigi.com',
  'apisp-digi.com',
  'digitain',
];

function isInteresting(url, resourceType) {
  return (
    interestingHostFragments.some((fragment) => url.includes(fragment)) ||
    resourceType === 'xhr' ||
    resourceType === 'fetch'
  );
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  locale: 'tr-TR',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  viewport: { width: 1440, height: 900 },
});

const page = await context.newPage();
const entries = [];
const requestIndex = new Map();

context.on('request', (request) => {
  const url = request.url();
  const resourceType = request.resourceType();
  if (!isInteresting(url, resourceType)) {
    return;
  }

  const key = `${request.method()} ${resourceType} ${url}`;
  const entry = {
    key,
    method: request.method(),
    resourceType,
    url,
    frameUrl: request.frame()?.url() ?? null,
    startedAt: new Date().toISOString(),
    status: null,
    failure: null,
  };

  requestIndex.set(request, entry);
  entries.push(entry);
});

context.on('response', async (response) => {
  const request = response.request();
  const entry = requestIndex.get(request);
  if (!entry) {
    return;
  }

  entry.status = response.status();
  entry.responseUrl = response.url();
  entry.responseHeaders = response.headers();

  const contentType = response.headers()['content-type'] ?? '';
  if (contentType.includes('application/json')) {
    try {
      entry.json = await response.json();
    } catch {
      entry.json = '[unreadable-json]';
    }
  } else if (contentType.includes('text/plain') || contentType.includes('text/html')) {
    try {
      const text = await response.text();
      entry.textSnippet = text.slice(0, 1000);
    } catch {
      entry.textSnippet = '[unreadable-text]';
    }
  }
});

context.on('requestfailed', (request) => {
  const entry = requestIndex.get(request);
  if (!entry) {
    return;
  }

  entry.failure = request.failure()?.errorText ?? 'unknown';
});

try {
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForTimeout(25_000);
} finally {
  await fs.writeFile(outputPath, JSON.stringify(entries, null, 2), 'utf8');
  await browser.close();
}

console.log(`Saved ${entries.length} entries to ${outputPath}`);
