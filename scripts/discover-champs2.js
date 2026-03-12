import { chromium } from 'playwright';
import fs from 'fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PARTNER_ID = '12dde6a1-36aa-4273-9140-9774eeb6c77b';
const PARTNER_NUM = 685;
const LANG_ID = 4;
const COUNTRY_CODE = 'TR';
const apiBase = `https://sport.dmnppsportsdigi.com/${PARTNER_ID}`;

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
        if (/^\[?\{"\w+"/.test(str)) return { key, offset: off, str };
      }
    }
  }
  return null;
}

function parseResp(b64) {
  const raw = Buffer.from(b64, 'base64');
  const result = autoDetectXorKey(raw);
  if (!result) return null;
  return JSON.parse(result.str);
}

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0].pages()[0];

  console.log('Navigating...');
  await page.goto('https://dumanbet885.com/tr/Sports/digitain', { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await sleep(40_000);

  const apiFrame = page.frames().find(f => f.url().includes('Tools/RequestHelper'));
  if (!apiFrame) { console.log('API frame yok!'); process.exit(1); }

  async function tryPost(ep, body) {
    const url = `${apiBase}/${ep}`;
    try {
      const resp = await apiFrame.evaluate(
        async ({ u, b }) => {
          const r = await fetch(u, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(b),
          });
          const buf = await r.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          return { status: r.status, b64: btoa(binary) };
        },
        { u: url, b: body },
      );
      if (resp.status !== 200) return { status: resp.status };
      const data = parseResp(resp.b64);
      return data;
    } catch (e) {
      return { error: e.message.slice(0,100) };
    }
  }

  async function tryGet(ep) {
    const url = `${apiBase}/${ep}`;
    try {
      const resp = await apiFrame.evaluate(async (u) => {
        const r = await fetch(u, { credentials: 'include' });
        const buf = await r.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return { status: r.status, b64: btoa(binary) };
      }, url);
      if (resp.status !== 200) return { status: resp.status };
      return parseResp(resp.b64);
    } catch (e) {
      return { error: e.message.slice(0,100) };
    }
  }

  const qs = `langId=${LANG_ID}&partnerId=${PARTNER_NUM}&countryCode=${COUNTRY_CODE}`;
  const ENGLAND_ID = 1225;

  // Championship list endpoint denemeleri
  const tests = [
    ['POST', `Prematch/GetChampionshipList?${qs}`, { sportId: 1, countryId: ENGLAND_ID, timeFilter: 0 }],
    ['POST', `Prematch/GetChampionshipList?${qs}`, { SportId: 1, CountryId: ENGLAND_ID, TimeFilter: 0 }],
    ['POST', `prematch/getchampionshiplist?${qs}`, { sportId: 1, countryId: ENGLAND_ID, timeFilter: 0 }],
    ['POST', `Prematch/GetChampionshipsByCountry?${qs}`, { sportId: 1, countryId: ENGLAND_ID }],
    ['GET', `prematch/getchampionshiplist?sportId=1&countryId=${ENGLAND_ID}&timeFilter=0&${qs}`, null],
    ['GET', `prematch/getchampionshipsbycountry?sportId=1&countryId=${ENGLAND_ID}&timeFilter=0&${qs}`, null],
    ['GET', `prematch/getchampionshipsbysport?sportId=1&timeFilter=0&${qs}`, null],
    ['POST', `Prematch/GetChampionships?${qs}`, { sportId: 1, timeFilter: 0 }],
    ['POST', `Prematch/GetChampionshipsByCountryAndSport?${qs}`, { sportId: 1, countryId: ENGLAND_ID, timeFilter: 0 }],
    // Tüm futbol şampiyonalarını dene
    ['POST', `Prematch/GetCountryList?${qs}`, { sportId: 1, timeFilter: 0, countryId: ENGLAND_ID }],
  ];

  for (const [method, ep, body] of tests) {
    const name = ep.split('?')[0].split('/').pop();
    process.stdout.write(`${method} ${name}: `);
    
    let data;
    if (method === 'POST') {
      data = await tryPost(ep, body);
    } else {
      data = await tryGet(ep);
    }
    
    if (data === null) {
      console.log('decode failed');
    } else if (data.status) {
      console.log(`status=${data.status}`);
    } else if (data.error) {
      console.log(`error: ${data.error}`);
    } else if (Array.isArray(data)) {
      console.log(`✔ ${data.length} items`);
      if (data[0]) console.log(`  Keys: ${Object.keys(data[0]).join(', ').slice(0,150)}`);
      if (data[0]) console.log(`  Sample: ${JSON.stringify(data[0]).slice(0,200)}`);
    } else {
      console.log(`✔ object: ${Object.keys(data).join(', ').slice(0,100)}`);
    }
    await sleep(200);
  }

  console.log('\nBitti!');
  try { await browser.close(); } catch {}
  process.exit(0);
})();
