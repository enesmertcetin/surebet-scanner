import { chromium } from 'playwright';
import fs from 'fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PARTNER_ID = '12dde6a1-36aa-4273-9140-9774eeb6c77b';
const PARTNER_NUM = 685;
const LANG_ID = 4;
const CC = 'TR';
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

let apiFrame;

async function dPost(ep, body) {
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
        let s = '';
        for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
        return { status: r.status, b64: btoa(s) };
      },
      { u: url, b: body },
    );
    if (resp.status !== 200) return null;
    return parseResp(resp.b64);
  } catch { return null; }
}

async function dGet(ep) {
  const url = `${apiBase}/${ep}`;
  try {
    const resp = await apiFrame.evaluate(async (u) => {
      const r = await fetch(u, { credentials: 'include' });
      const buf = await r.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let b = '';
      for (let i = 0; i < bytes.length; i++) b += String.fromCharCode(bytes[i]);
      return { status: r.status, b64: btoa(b) };
    }, url);
    if (resp.status !== 200) return null;
    return parseResp(resp.b64);
  } catch { return null; }
}

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0].pages()[0];

  console.log('Loading...');
  await page.goto('https://dumanbet885.com/tr/Sports/digitain', { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await sleep(40_000);

  apiFrame = page.frames().find(f => f.url().includes('Tools/RequestHelper'));
  if (!apiFrame) { console.log('No API frame!'); process.exit(1); }
  console.log('OK\n');

  const qs = `langId=${LANG_ID}&partnerId=${PARTNER_NUM}&countryCode=${CC}`;

  // 1. Ülke listesini al
  console.log('━━ Ülke listesi çekiliyor...');
  const countries = await dPost(`Prematch/GetCountryList?${qs}`, { sportId: 1, timeFilter: 0 });
  if (!countries || !Array.isArray(countries)) {
    console.log('Ülke listesi alınamadı!');
    process.exit(1);
  }
  console.log(`  ${countries.length} ülke/bölge\n`);

  // 2. Her ülke için şampiyona listesini al
  console.log('━━ Her ülke için şampiyonalar çekiliyor...');
  const allChamps = [];
  let totalEvents = 0;

  for (const country of countries) {
    const cId = country.Id;
    const cName = country.N || country.EGN || `id-${cId}`;
    
    const champs = await dPost(`Prematch/GetChampsList?${qs}`, { 
      sportId: 1, timeFilter: 0, countryId: cId 
    });
    
    if (champs && Array.isArray(champs) && champs.length > 0) {
      const ec = champs.reduce((sum, c) => sum + (c.EC || 0), 0);
      totalEvents += ec;
      console.log(`  ${cName}: ${champs.length} şampiyona, ${ec} etkinlik`);
      allChamps.push(...champs);
    }
    
    await sleep(100);
  }

  console.log(`\n  Toplam: ${allChamps.length} şampiyona, ${totalEvents} etkinlik`);
  fs.writeFileSync('artifacts/digitain-football-champs.json', JSON.stringify(allChamps, null, 2));
  console.log('  → artifacts/digitain-football-champs.json\n');

  // 3. Her şampiyona için maçları çek
  const STAKE_TYPES = [1, 702, 3, 2533, 2, 2532, 313638, 313639, 37, 402315];
  const stakeTypesQS = STAKE_TYPES.map(s => `stakeTypes=${s}`).join('&');
  
  console.log(`━━ Maçlar çekiliyor (${allChamps.length} şampiyona)...`);
  const allEvents = [];
  let champCount = 0;

  for (const champ of allChamps) {
    champCount++;
    const champId = champ.Id;
    const champName = champ.N || champ.EGN || `champ-${champId}`;
    const ec = champ.EC || 0;
    
    if (ec === 0) continue;

    const events = await dGet(
      `prematch/geteventslist?champId=${champId}&${stakeTypesQS}&timeFilter=0&${qs}`
    );

    if (events && Array.isArray(events)) {
      for (const ev of events) {
        ev._champId = champId;
        ev._champName = champName;
        ev._countryName = champ.CtN || '';
      }
      allEvents.push(...events);
      if (champCount % 20 === 0 || events.length > 5) {
        console.log(`  [${champCount}/${allChamps.length}] ${champName}: ${events.length} maç (toplam: ${allEvents.length})`);
      }
    }
    
    await sleep(150);
  }

  console.log(`\n  TOPLAM: ${allEvents.length} futbol maçı`);
  fs.writeFileSync('artifacts/digitain-football-all-events.json', JSON.stringify(allEvents, null, 2));
  console.log('  → artifacts/digitain-football-all-events.json');

  console.log('\n════════════════════════════════════════');
  console.log('Tamamlandı!');
  console.log('════════════════════════════════════════');

  try { await browser.close(); } catch {}
  process.exit(0);
})();
