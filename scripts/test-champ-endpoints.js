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
    if (resp.status !== 200) return { _status: resp.status };
    return parseResp(resp.b64);
  } catch (e) { return { _error: e.message.slice(0,80) }; }
}

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
    if (resp.status !== 200) return { _status: resp.status };
    return parseResp(resp.b64);
  } catch (e) { return { _error: e.message.slice(0,80) }; }
}

function showResult(name, data) {
  if (!data) { console.log(`  ${name}: decode failed`); return; }
  if (data._status) { console.log(`  ${name}: status=${data._status}`); return; }
  if (data._error) { console.log(`  ${name}: error=${data._error}`); return; }
  if (Array.isArray(data)) {
    console.log(`  ${name}: ✔ ${data.length} items`);
    if (data[0]) console.log(`    Keys: ${Object.keys(data[0]).join(', ').slice(0,150)}`);
    if (data[0]) console.log(`    Sample: ${JSON.stringify(data[0]).slice(0,250)}`);
  } else {
    console.log(`  ${name}: ✔ object keys=${Object.keys(data).join(', ').slice(0,150)}`);
    console.log(`    Sample: ${JSON.stringify(data).slice(0,250)}`);
  }
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

  // 1. GetSportsWithChampionships
  console.log('━━ Prematch/GetSportsWithChampionships');
  let d = await dGet(`Prematch/GetSportsWithChampionships?sportId=1&timeFilter=0&${qs}`);
  showResult('GET with sportId', d);
  if (d && !d._status && !d._error) {
    fs.writeFileSync('artifacts/digitain-sports-with-champs.json', JSON.stringify(d, null, 2));
  }
  
  d = await dPost(`Prematch/GetSportsWithChampionships?${qs}`, { sportId: 1, timeFilter: 0 });
  showResult('POST with sportId', d);

  // 2. GetChampsList
  console.log('\n━━ Prematch/GetChampsList');
  d = await dGet(`Prematch/GetChampsList?sportId=1&timeFilter=0&${qs}`);
  showResult('GET', d);
  
  d = await dPost(`Prematch/GetChampsList?${qs}`, { sportId: 1, timeFilter: 0, countryId: 1225 });
  showResult('POST with country', d);
  if (d && !d._status && !d._error) {
    fs.writeFileSync('artifacts/digitain-champs-england.json', JSON.stringify(d, null, 2));
  }

  // 3. GetTournamentsBySportId
  console.log('\n━━ Prematch/GetTournamentsBySportId');
  d = await dGet(`Prematch/GetTournamentsBySportId?sportId=1&timeFilter=0&${qs}`);
  showResult('GET', d);

  d = await dPost(`Prematch/GetTournamentsBySportId?${qs}`, { sportId: 1, timeFilter: 0 });
  showResult('POST', d);

  // 4. GetTree
  console.log('\n━━ Prematch/GetTree');
  d = await dGet(`Prematch/GetTree?sportId=1&timeFilter=0&${qs}`);
  showResult('GET', d);

  d = await dPost(`Prematch/GetTree?${qs}`, { sportId: 1, timeFilter: 0 });
  showResult('POST', d);

  // 5. Championships
  console.log('\n━━ Prematch/Championships');
  d = await dGet(`Prematch/Championships?sportId=1&timeFilter=0&${qs}`);
  showResult('GET', d);

  // 6. GetEventsListWithStakeTypes
  console.log('\n━━ Prematch/GetEventsListWithStakeTypes');
  d = await dGet(`Prematch/GetEventsListWithStakeTypes?champId=4520&stakeTypes=1&stakeTypes=702&timeFilter=0&${qs}`);
  showResult('GET champId=4520(TurSuperLig)', d);

  // 7. GetSportsListFull
  console.log('\n━━ Prematch/GetSportsListFull');
  d = await dGet(`Prematch/GetSportsListFull?timeFilter=0&${qs}`);
  showResult('GET', d);
  if (d && Array.isArray(d)) {
    const football = d.find(s => s.Id === 1);
    if (football) {
      console.log(`    Football keys: ${Object.keys(football).join(', ')}`);
      if (football.Championships) console.log(`    Championships: ${football.Championships.length}`);
      if (football.Countries) console.log(`    Countries: ${football.Countries.length}`);
      if (football.CL) console.log(`    CL: ${JSON.stringify(football.CL).slice(0,200)}`);
    }
  }

  console.log('\nDone!');
  try { await browser.close(); } catch {}
  process.exit(0);
})();
