import { chromium } from 'playwright';
import fs from 'fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SPORT_BASE = 'https://sport.dmnppsportsdigi.com';
const PARTNER_ID = '12dde6a1-36aa-4273-9140-9774eeb6c77b';
const PARTNER_NUM = 685;
const LANG_ID = 4;
const COUNTRY = 'TR';

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
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const contexts = browser.contexts();
  const page = contexts[0].pages()[0];

  console.log('Sayfa yükleniyor...');
  await page.goto('https://dumanbet885.com/tr/Sports/digitain', { waitUntil: 'domcontentloaded', timeout: 120_000 });
  console.log('40 sn bekleniyor...');
  await sleep(40_000);

  const apiFrame = page.frames().find(f => f.url().includes('Tools/RequestHelper'));
  if (!apiFrame) { console.log('API frame yok!'); process.exit(1); }
  console.log('API frame OK\n');

  const apiBase = `${SPORT_BASE}/${PARTNER_ID}`;

  async function digitainGet(endpoint) {
    const url = `${apiBase}/${endpoint}`;
    try {
      const resp = await apiFrame.evaluate(async (fetchUrl) => {
        const r = await fetch(fetchUrl, { credentials: 'include' });
        const buf = await r.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return { status: r.status, b64: btoa(binary) };
      }, url);
      if (resp.status !== 200) return null;
      return parseDigitainResponse(resp.b64);
    } catch (err) {
      console.log(`  error: ${err.message.slice(0,100)}`);
      return null;
    }
  }

  async function digitainPost(endpoint, body = {}) {
    const url = `${apiBase}/${endpoint}`;
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
      if (resp.status !== 200) return null;
      return parseDigitainResponse(resp.b64);
    } catch (err) {
      console.log(`  error: ${err.message.slice(0,100)}`);
      return null;
    }
  }

  // ── 1) GetCountryList ──
  console.log('━━ POST Prematch/GetCountryList');
  const countries = await digitainPost(
    `Prematch/GetCountryList?langId=${LANG_ID}&partnerId=${PARTNER_NUM}&countryCode=${COUNTRY}`,
    { sportId: 1, timeFilter: 0 }
  );
  if (countries) {
    fs.writeFileSync('artifacts/digitain-countries.json', JSON.stringify(countries, null, 2));
    if (Array.isArray(countries)) {
      console.log(`  ${countries.length} ülke/bölge`);
      // İlk 5 göster
      countries.slice(0, 10).forEach(c => {
        console.log(`  - ${c.N || c.Name} (Id=${c.Id}, champs=${c.Championships?.length || c.C?.length || '?'})`);
      });
    } else {
      console.log(`  Keys: ${Object.keys(countries).join(', ')}`);
      console.log(`  Sample: ${JSON.stringify(countries).slice(0,500)}`);
    }
  } else {
    console.log('  Veri yok!');
  }

  // ── 2) Alternatif: POST Prematch/GetCountryList parametresiz ───
  console.log('\n━━ POST Prematch/GetCountryList (farklı body)');
  const countries2 = await digitainPost(
    `Prematch/GetCountryList?langId=${LANG_ID}&partnerId=${PARTNER_NUM}&countryCode=${COUNTRY}`,
    { SportId: 1, TimeFilter: 0, LangId: LANG_ID, PartnerId: PARTNER_NUM }
  );
  if (countries2 && JSON.stringify(countries2) !== JSON.stringify(countries)) {
    console.log('  Farklı sonuç!');
    console.log(`  ${JSON.stringify(countries2).slice(0,300)}`);
  } else {
    console.log('  Aynı sonuç veya boş');
  }

  // ── 3) Favori şampiyonalar (bildiğimiz çalışan) ───
  console.log('\n━━ GET prematch/getfavoritechampionships');
  const favChamps = await digitainGet(
    `prematch/getfavoritechampionships?timeFilter=0&langId=${LANG_ID}&partnerId=${PARTNER_NUM}&countryCode=${COUNTRY}`
  );
  if (favChamps && Array.isArray(favChamps)) {
    console.log(`  ${favChamps.length} favori şampiyona`);
    // Futbol olanları filtrele
    const footballChamps = favChamps.filter(c => c.SId === 1 || c.SportId === 1);
    console.log(`  Futbol: ${footballChamps.length}`);
    footballChamps.forEach(c => console.log(`    - ${c.N || c.CN} (CId=${c.Id || c.CId})`));
  }

  // ── 4) Sport count listesi (futbol alt detayları için) ───
  console.log('\n━━ GET prematch/getsportswithcount (futbol)');
  const sports = await digitainGet(
    `prematch/getsportswithcount?timeFilter=0&langId=${LANG_ID}&partnerId=${PARTNER_NUM}&countryCode=${COUNTRY}`
  );
  if (sports && Array.isArray(sports)) {
    const football = sports.find(s => s.Id === 1);
    if (football) {
      console.log(`  Futbol: ${football.EC} etkinlik`);
      console.log(`  Keys: ${Object.keys(football).join(', ')}`);
      // CountryList veya RegionList varsa
      if (football.Regions) console.log(`  Regions: ${football.Regions.length}`);
      if (football.Countries) console.log(`  Countries: ${football.Countries.length}`);
      if (football.Championships) console.log(`  Championships: ${football.Championships.length}`);
    }
  }

  console.log('\nBitti!');
  try { await browser.close(); } catch {}
  process.exit(0);
})();
