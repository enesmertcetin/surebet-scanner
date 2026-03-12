/**
 * Digitain bülten çekici – kullanıcının kendi Chrome'una CDP ile bağlanır.
 *
 * Kullanım:
 *   1) Tüm Chrome pencerelerini kapatın (script kendisi kapatmayı dener)
 *   2) node scripts/fetch-digitain-bulletin.js
 *
 *   Script Chrome'u debugging portu ile başlatır, Dumanbet'i açar,
 *   Digitain verilerini çeker, bitince tarayıcıyı açık bırakır.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execSync, spawn } from 'node:child_process';
import { chromium } from 'playwright';

// ── Ayarlar ─────────────────────────────────────────────────────────
const PARTNER_ID = '12dde6a1-36aa-4273-9140-9774eeb6c77b';
const SPORT_BASE = 'https://sport.dmnppsportsdigi.com';
const LANG_ID = 4;
const PARTNER_NUM = 685;
const COUNTRY = 'TR';
const TARGET_URL = 'https://dumanbet885.com/tr/Sports/digitain';
const OUTPUT_DIR = path.resolve('artifacts');
const CDP_PORT = 9222;

const CHROME_EXE =
  process.env.CHROME_EXE ??
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const CHROME_USER_DATA =
  process.env.CHROME_USER_DATA ??
  path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data');

// ── Yardımcı ────────────────────────────────────────────────────────
async function saveJSON(name, data) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const file = path.join(OUTPUT_DIR, name);
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
  console.log(`  ✔ ${name}  (${Array.isArray(data) ? data.length + ' items' : 'saved'})`);
  return file;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Digitain XOR decoder — auto-detect key.
 * Anahtar oturumdan oturuma değişir (7, 10, 13 vs.).
 * Büyük yanıtlarda başta padding byte'lar (header) olabilir.
 */
const MAX_HEADER = 20;

function validateDecoded(buf, key, offset) {
  // İlk 60 byte'ı decode et ve geçerli JSON başlangıcı mı kontrol et
  const len = Math.min(buf.length - offset, 60);
  const sample = Buffer.alloc(len);
  for (let i = 0; i < len; i++) sample[i] = buf[i + offset] ^ key;
  const str = sample.toString('utf8').replace(/[\x00-\x1F]/g, '');
  // Geçerli JSON: ["xxx", [{"Id", {"Id gibi başlamalı
  return /^\[?\{"\w+":/.test(str);
}

function autoDetectXorKey(buf) {
  for (let offset = 0; offset < Math.min(MAX_HEADER, buf.length - 2); offset++) {
    const b0 = buf[offset];
    const b1 = buf[offset + 1];

    // Array of objects: [{ (91, 123)
    const keyArr = b0 ^ 91;
    if (keyArr > 0 && keyArr < 128 && (b1 ^ keyArr) === 123) {
      if (validateDecoded(buf, keyArr, offset)) return { key: keyArr, offset };
    }

    // Single object: {" (123, 34)
    const keyObj = b0 ^ 123;
    if (keyObj > 0 && keyObj < 128 && (b1 ^ keyObj) === 34) {
      if (validateDecoded(buf, keyObj, offset)) return { key: keyObj, offset };
    }
  }

  return null;
}

function xorDecodeBuffer(buf, key, offset = 0) {
  const decoded = Buffer.alloc(buf.length - offset);
  for (let i = 0; i < decoded.length; i++) {
    decoded[i] = buf[i + offset] ^ key;
  }
  return decoded;
}

function parseDigitainResponse(b64text) {
  const raw = Buffer.from(b64text, 'base64');

  // Önce düz JSON dene
  try {
    const str = raw.toString('utf8');
    return JSON.parse(str);
  } catch { /* düz JSON değil */ }

  // XOR auto-detect
  const detected = autoDetectXorKey(raw);
  if (detected) {
    const decoded = xorDecodeBuffer(raw, detected.key, detected.offset);
    // Tüm kontrol karakterlerini temizle (JSON string'lerde geçersiz)
    let str = decoded.toString('utf8');
    str = str.replace(/[\x00-\x1F\x7F]/g, '');
    
    try {
      return JSON.parse(str);
    } catch (e) {
      console.warn(`    [debug] key=${detected.key} off=${detected.offset} buf=${raw.length}B err: ${e.message.slice(0, 80)}`);
    }
  }

  return raw.toString('utf8');
}

// ── Çalışan Chrome'ları kapat ────────────────────────────────────
console.log('Mevcut Chrome işlemleri kapatılıyor…');
try {
  execSync('taskkill /F /IM chrome.exe /T 2>nul', { stdio: 'pipe' });
  console.log('  Chrome kapatıldı.');
} catch {
  console.log('  Zaten açık Chrome yok.');
}

await sleep(4000); // profil kilidinin tam serbest kalması için bekle

// ── Chrome'u geçici profil + debugging portu ile başlat ─────────
const TEMP_PROFILE = path.join(os.tmpdir(), 'chrome-debug-profile');
await fs.mkdir(TEMP_PROFILE, { recursive: true });

console.log(`\nChrome başlatılıyor (CDP port: ${CDP_PORT}, profil: ${TEMP_PROFILE})…`);
const chromeProc = spawn(CHROME_EXE, [
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${TEMP_PROFILE}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-blink-features=AutomationControlled',
  'about:blank',
], {
  detached: true,
  stdio: 'ignore',
});
chromeProc.unref();
console.log(`  Chrome PID: ${chromeProc.pid}`);

// CDP portun hazır olmasını bekle
console.log('  CDP bağlantısı bekleniyor…');
let connected = false;
for (let i = 0; i < 30; i++) {
  try {
    const resp = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
    if (resp.ok) {
      connected = true;
      const info = await resp.json();
      console.log(`  ✔ Chrome bağlandı: ${info.Browser}\n`);
      break;
    }
  } catch { /* henüz hazır değil */ }
  await sleep(1000);
}

if (!connected) {
  console.error('CDP bağlantısı kurulamadı!');
  process.exit(1);
}

// ── Playwright ile CDP'ye bağlan ────────────────────────────────
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
const context = browser.contexts()[0] ?? await browser.newContext();
const page = await context.newPage();

// ── Digitain sayfasını aç ───────────────────────────────────────
console.log('Dumanbet Digitain sayfası açılıyor…');
await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });

// Sayfa + iframe yüklenmesini bekle
console.log('Sayfa ve iframe yüklenmesi bekleniyor (40 sn)…');
await sleep(40_000);

// Tüm frame URL'lerini listele
const allFrames = page.frames().map((f) => f.url());
console.log(`\n${allFrames.length} frame bulundu:`);
allFrames.forEach((u, i) => console.log(`  [${i}] ${u.slice(0, 120)}`));

// ── Digitain frame'ini bul ──────────────────────────────────────
let dataFrame = page.frames().find((f) => f.url().includes('dmnppsportsdigi'));
let requestHelperFrame = page.frames().find((f) => f.url().includes('Tools/RequestHelper'));

const apiFrame = requestHelperFrame || dataFrame;

if (!apiFrame) {
  console.error('\nDigitain frame bulunamadı! Sayfayı kontrol edin.');
  console.log('Tarayıcı açık bırakılıyor — inceleyebilirsiniz.');
  browser.disconnect();
  process.exit(1);
}

console.log(`\nAPI çağrıları için frame: ${apiFrame.url().slice(0, 100)}\n`);

// ── Ağ trafiğini de dinle ───────────────────────────────────────
const interceptedData = [];
page.on('response', async (resp) => {
  const url = resp.url();
  if (!url.includes('dmnppsportsdigi')) return;
  try {
    const body = await resp.text().catch(() => null);
    interceptedData.push({ url, status: resp.status(), body: body?.slice(0, 50000) });
  } catch { /* ignore */ }
});

// ── API çağrıları ───────────────────────────────────────────────
const apiBase = `${SPORT_BASE}/${PARTNER_ID}`;

async function digitainGet(endpoint) {
  const url = `${apiBase}/${endpoint}`;
  console.log(`  GET ${url.replace(apiBase, '…')}`);

  try {
    const resp = await apiFrame.evaluate(async (fetchUrl) => {
      const r = await fetch(fetchUrl, { credentials: 'include' });
      const buf = await r.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return { status: r.status, b64: btoa(binary) };
    }, url);

    if (resp.status !== 200) {
      console.warn(`    ⚠ status=${resp.status}`);
      return null;
    }
    return parseDigitainResponse(resp.b64);
  } catch (err) {
    console.warn(`    ⚠ error: ${err.message}`);
    return null;
  }
}

async function digitainPost(endpoint, body = {}) {
  const url = `${apiBase}/${endpoint}`;
  console.log(`  POST ${url.replace(apiBase, '…')}`);

  try {
    const resp = await apiFrame.evaluate(
      async ({ fetchUrl, fetchBody }) => {
        const r = await fetch(fetchUrl, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fetchBody),
        });
        const buf = await r.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return { status: r.status, b64: btoa(binary) };
      },
      { fetchUrl: url, fetchBody: body },
    );

    if (resp.status !== 200) {
      console.warn(`    ⚠ status=${resp.status}`);
      return null;
    }
    return parseDigitainResponse(resp.b64);
  } catch (err) {
    console.warn(`    ⚠ error: ${err.message}`);
    return null;
  }
}

// ── 1) Futbol ülke listesini al ─────────────────────────────────
const FOOTBALL_ID = 1;
const qs = `langId=${LANG_ID}&partnerId=${PARTNER_NUM}&countryCode=${COUNTRY}`;

console.log('━━ Futbol ülke listesi çekiliyor…');
const countries = await digitainPost(
  `Prematch/GetCountryList?${qs}`,
  { sportId: FOOTBALL_ID, timeFilter: 0 },
);

if (!countries || !Array.isArray(countries)) {
  console.error('Ülke listesi alınamadı!');
  process.exit(1);
}
console.log(`  ${countries.length} ülke/bölge bulundu\n`);

// ── 2) Her ülke için şampiyona listesini al ─────────────────────
console.log('━━ Her ülke için şampiyonalar çekiliyor…');
const allChamps = [];

for (const country of countries) {
  const champs = await digitainPost(
    `Prematch/GetChampsList?${qs}`,
    { sportId: FOOTBALL_ID, timeFilter: 0, countryId: country.Id },
  );

  if (champs && Array.isArray(champs) && champs.length > 0) {
    const ec = champs.reduce((sum, c) => sum + (c.EC || 0), 0);
    const cName = country.N || country.EGN || `id-${country.Id}`;
    console.log(`  ${cName}: ${champs.length} şampiyona, ${ec} etkinlik`);
    allChamps.push(...champs);
  }
  await sleep(100);
}

await saveJSON('digitain-football-champs.json', allChamps);
console.log(`  Toplam: ${allChamps.length} şampiyona\n`);

// ── 3) Her şampiyona için maçları çek ───────────────────────────
// Digitain'in kullandığı stakeTypes (oranlarla birlikte)
const STAKE_TYPES = [1, 702, 3, 2533, 2, 2532, 313638, 313639, 37, 402315];
const stakeTypesQS = STAKE_TYPES.map(s => `stakeTypes=${s}`).join('&');

console.log(`━━ Maçlar çekiliyor (${allChamps.length} şampiyona)…`);
const allEvents = [];
let champIdx = 0;

for (const champ of allChamps) {
  champIdx++;
  if ((champ.EC || 0) === 0) continue;

  const events = await digitainGet(
    `prematch/geteventslist?champId=${champ.Id}&${stakeTypesQS}&timeFilter=0&${qs}`,
  );

  if (events && Array.isArray(events)) {
    for (const ev of events) {
      ev._champId = champ.Id;
      ev._champName = champ.N || champ.EGN || '';
      ev._countryName = champ.CtN || '';
    }
    allEvents.push(...events);
    if (champIdx % 20 === 0 || events.length > 5) {
      console.log(`  [${champIdx}/${allChamps.length}] ${champ.N || champ.EGN}: ${events.length} maç (toplam: ${allEvents.length})`);
    }
  }
  await sleep(150);
}

await saveJSON('digitain-football-all-events.json', allEvents);
console.log(`\n  TOPLAM: ${allEvents.length} futbol maçı`);

// ── Bitir ───────────────────────────────────────────────────────
console.log('\n════════════════════════════════════════');
console.log('Bülten çekimi tamamlandı! artifacts/ klasörüne bakın.');
console.log('════════════════════════════════════════');

try { await browser.close(); } catch { /* tarayıcı açık kalabilir */ }
