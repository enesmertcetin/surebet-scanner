import { chromium } from 'playwright';
import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const SPORT_BASE = 'https://sport.dmnppsportsdigi.com';
const PARTNER_ID = '12dde6a1-36aa-4273-9140-9774eeb6c77b';
const PARTNER_NUM = 685;
const LANG_ID = 4;
const COUNTRY = 'TR';
const TARGET_URL = 'https://dumanbet885.com/tr/Sports/digitain';
const CDP_PORT = 9222;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function xorDecodeBuffer(buf, key, offset) {
  const out = Buffer.alloc(buf.length - offset);
  for (let i = 0; i < out.length; i++) out[i] = buf[i + offset] ^ key;
  return out;
}

function autoDetectXorKey(buf) {
  for (let off = 0; off <= 20; off++) {
    for (const [b0, b1] of [[91,123],[123,34]]) {
      const key = buf[off] ^ b0;
      if (key >= 0 && key <= 255 && (buf[off+1] ^ key) === b1) {
        const decoded = xorDecodeBuffer(buf, key, off);
        const str = decoded.toString('utf8').replace(/[\x00-\x1F\x7F]/g, '');
        const re = /^\[?\{"\w+"/;
        if (re.test(str)) return { key, offset: off, str };
      }
    }
  }
  return null;
}

function parseDigitainResponse(b64) {
  const raw = Buffer.from(b64, 'base64');
  const result = autoDetectXorKey(raw);
  if (!result) return null;
  return JSON.parse(result.str);
}

(async () => {
  // Chrome'u bağla
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
  const contexts = browser.contexts();
  const page = contexts[0].pages()[0];

  // Sayfayı yeniden yükle
  console.log('Sayfa yükleniyor...');
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  console.log('40 sn bekleniyor...');
  await sleep(40_000);

  const allFrames = page.frames().map(f => f.url());
  console.log(`\n${allFrames.length} frame bulundu:`);
  allFrames.forEach((u, i) => console.log(`  [${i}] ${u.slice(0, 120)}`));

  const apiFrame = page.frames().find(f => f.url().includes('Tools/RequestHelper'));
  if (!apiFrame) {
    console.log('\nRequestHelper frame bulunamadi!');
    browser.disconnect();
    process.exit(1);
  }
  console.log('\nAPI frame bulundu!\n');

  const apiBase = `${SPORT_BASE}/${PARTNER_ID}`;

  async function digitainGet(endpoint) {
    const url = `${apiBase}/${endpoint}`;
    console.log(`  GET …/${endpoint.split('?')[0]}`);
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
        console.log(`    status=${resp.status}`);
        return null;
      }
      return parseDigitainResponse(resp.b64);
    } catch (err) {
      console.log(`    error: ${err.message.slice(0,100)}`);
      return null;
    }
  }

  // Endpoint'leri dene
  const endpoints = [
    `prematch/getchampionshipsbysportid?sportId=1&timeFilter=0&langId=${LANG_ID}&partnerId=${PARTNER_NUM}&countryCode=${COUNTRY}`,
    `prematch/getchampionships?sportId=1&timeFilter=0&langId=${LANG_ID}&partnerId=${PARTNER_NUM}&countryCode=${COUNTRY}`,
    `prematch/getregionsbysportid?sportId=1&timeFilter=0&langId=${LANG_ID}&partnerId=${PARTNER_NUM}&countryCode=${COUNTRY}`,
    `prematch/getregions?sportId=1&timeFilter=0&langId=${LANG_ID}&partnerId=${PARTNER_NUM}&countryCode=${COUNTRY}`,
    `prematch/getcompetitions?sportId=1&timeFilter=0&langId=${LANG_ID}&partnerId=${PARTNER_NUM}&countryCode=${COUNTRY}`,
    `prematch/getsportchampionships?sportId=1&timeFilter=0&langId=${LANG_ID}&partnerId=${PARTNER_NUM}&countryCode=${COUNTRY}`,
    `prematch/geteventscount?sportId=1&timeFilter=0&langId=${LANG_ID}&partnerId=${PARTNER_NUM}&countryCode=${COUNTRY}`,
    `prematch/geteventslist?sportId=1&langId=${LANG_ID}&partnerId=${PARTNER_NUM}&countryCode=${COUNTRY}`,
    `prematch/getallsportevents?sportId=1&langId=${LANG_ID}&partnerId=${PARTNER_NUM}&countryCode=${COUNTRY}`,
    `prematch/getevents?sportId=1&langId=${LANG_ID}&partnerId=${PARTNER_NUM}&countryCode=${COUNTRY}`,
  ];

  for (const ep of endpoints) {
    const name = ep.split('?')[0];
    console.log('\n━━ ' + name);
    const data = await digitainGet(ep);
    if (data) {
      if (Array.isArray(data)) {
        console.log(`    ✔ ${data.length} items`);
        if (data[0]) console.log(`    Keys: ${Object.keys(data[0]).join(', ').slice(0,200)}`);
      } else {
        console.log(`    ✔ object, keys: ${Object.keys(data).join(', ').slice(0,200)}`);
      }
    } else {
      console.log(`    ✖ veri yok`);
    }
    await sleep(300);
  }

  console.log('\n\nBitti!');
  browser.disconnect();
  process.exit(0);
})();
