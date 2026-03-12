/**
 * Surebet Realtime — 12 Site Anlık Çek + Analiz
 * DUM, HOL, TEM, SEK, MER, RIS, POL, CAS, BOX, MIL, TUL, IMA
 * Tüm siteleri PARALEL çeker, ardından surebet karşılaştırması yapar.
 *
 * Gereksinim: Chrome --remote-debugging-port=9222 ile çalışıyor olmalı
 * Kullanım:   node scripts/surebet-realtime.js
 */

import { chromium } from 'playwright';
import fs from 'fs';

// ══════════════════════════════════════════════════════════════════
//  AYARLAR
// ══════════════════════════════════════════════════════════════════
const CDP_PORT = 9222;
const KASA = 1000; // TL
const OUTPUT_DIR = 'artifacts';

// ── Digitain tabanlı siteler (DUM, MER, RIS) ────────────────────
const DIGITAIN_SITES = {
  DUM: {
    label: 'Dumanbet',
    url: 'https://dumanbet885.com/tr/Sports/digitain',
    sportBase: 'https://sport.dmnppsportsdigi.com',
    partnerUUID: '12dde6a1-36aa-4273-9140-9774eeb6c77b',
    partnerId: 685,
    langId: 4,
    country: 'TR',
    sportId: 1,
    stakeTypes: [1, 702, 3, 2533, 2, 2532, 313638, 313639, 37, 402315],
    framePat: 'dmnppsportsdigi',
  },
  MER: {
    label: 'Meritwin',
    url: 'https://meritwin343.com/sports',
    sportBase: 'https://sport.q1w2e3r4t5y6u7i8o9p0lkjhgfdsazxc.com',
    partnerUUID: 'b3c8ac34-ac54-4861-bb9b-757dfcb43546',
    partnerId: 882,
    langId: 4,
    country: 'TR',
    sportId: 1,
    stakeTypes: [1, 702, 3, 2533, 2, 2532, 313638, 313639, 37, 402315],
    framePat: 'q1w2e3r4t5y6u7i8o9p0lkjhgfdsazxc',
  },
  RIS: {
    label: 'Risebet',
    url: 'https://www.risebet244.com/sportsbook',
    sportBase: 'https://sport.risexbook777.com',
    partnerUUID: '250ef032-9130-41d4-80e5-224aebae0097',
    partnerId: 805,
    langId: 4,
    country: 'TR',
    sportId: 1,
    stakeTypes: [1, 702, 3, 2533, 2, 2532, 313638, 313639, 37, 402315, 447974],
    framePat: 'risexbook777',
  },
};

// ── BetConstruct tabanlı siteler (POL, CAS, BOX, MIL) ──────────
const BETCONSTRUCT_SITES = {
  POL: {
    label: 'Poliwin',
    url: 'https://www.poliwin184.com/tr/sports/pre-match/event-view',
    swarm: 'wss://eu-swarm-newm.poliwin184.com/',
    siteId: 18770331,
  },
  CAS: {
    label: 'TheCasino',
    url: 'https://www.thecasino244.com/tr/sports/pre-match/event-view',
    swarm: 'wss://eu-swarm-newm.thecasino244.com/',
    siteId: 18771867,
  },
  BOX: {
    label: 'Betbox',
    url: 'https://www.betbox2426.com/tr/sports/pre-match/event-view',
    swarm: 'wss://eu-swarm-newm.betbox2426.com/',
    siteId: 1870995,
  },
  MIL: {
    label: 'Milosbet',
    url: 'https://www.milosbet699.com/tr/sports/pre-match/event-view/',
    swarm: 'wss://eu-swarm-newm.milosbet699.com/',
    siteId: 680,
  },
};

// ── Diğer siteler ────────────────────────────────────────────────
const HOLIGANBET_URL = 'https://www.holiganbet1214.com/tr/sports/i/spor/futbol/1/t%C3%BCm%C3%BC/0/lokasyon';
const TEMPOBET_BASE = 'https://www.1124tempobet.com';
const SEKABET_URL = 'https://sekabett1521.com/bahis';
const SEKABET_SWARM = 'wss://eu-swarm-newm.btcoservice29.com/';
const SEKABET_SITE_ID = 1329;

// ── Pronet Gaming tabanlı siteler (TUL, IMA) ────────────────────
const PRONET_SITES = {
  TUL: {
    label: 'Tulipbet',
    url: 'https://tulipbet835.com/tr/sport/bet/todays-events/football',
    domain: 'tulipbet835.com',
  },
  IMA: {
    label: 'Imajbet',
    url: 'https://imajbet1584.com/tr/sport/bet/todays-events/football',
    domain: 'imajbet1584.com',
  },
};

// Tüm site kodları
const ALL_SITES = ['DUM', 'HOL', 'TEM', 'SEK', 'MER', 'RIS', 'POL', 'CAS', 'BOX', 'MIL', 'TUL', 'IMA'];

// ══════════════════════════════════════════════════════════════════
//  YARDIMCI FONKSİYONLAR
// ══════════════════════════════════════════════════════════════════
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Digitain XOR Decoder ────────────────────────────────────────
function validateDecoded(buf, key, offset) {
  const len = Math.min(buf.length - offset, 60);
  const sample = Buffer.alloc(len);
  for (let i = 0; i < len; i++) sample[i] = buf[i + offset] ^ key;
  const str = sample.toString('utf8').replace(/[\x00-\x1F]/g, '');
  return /^\[?\{"\w+":/.test(str);
}

function autoDetectXorKey(buf) {
  for (let offset = 0; offset < Math.min(20, buf.length - 2); offset++) {
    const b0 = buf[offset], b1 = buf[offset + 1];
    const keyArr = b0 ^ 91;
    if (keyArr > 0 && keyArr < 128 && (b1 ^ keyArr) === 123)
      if (validateDecoded(buf, keyArr, offset)) return { key: keyArr, offset };
    const keyObj = b0 ^ 123;
    if (keyObj > 0 && keyObj < 128 && (b1 ^ keyObj) === 34)
      if (validateDecoded(buf, keyObj, offset)) return { key: keyObj, offset };
  }
  return null;
}

function parseDigitainResponse(b64text) {
  const raw = Buffer.from(b64text, 'base64');
  try { return JSON.parse(raw.toString('utf8')); } catch {}
  const detected = autoDetectXorKey(raw);
  if (detected) {
    const decoded = Buffer.alloc(raw.length - detected.offset);
    for (let i = 0; i < decoded.length; i++) decoded[i] = raw[i + detected.offset] ^ detected.key;
    let str = decoded.toString('utf8').replace(/[\x00-\x1F\x7F]/g, '');
    try { return JSON.parse(str); } catch {}
  }
  return null;
}

// ── Takım Kategorisi (U21, Kadın, Yedek vb.) ──────────────────
function extractTeamCategory(name) {
  if (!name) return 'MAIN';
  const n = name.toLowerCase();
  if (/\bu\s?\d{2}\b/.test(n) || /\bunder\s?\d{2}\b/.test(n)) return 'YOUTH';
  if (/\(w\)|\(k\)|\bwomen\b|\bkadın|\bfemenil\b|\bfeminine\b|\bfeminin/i.test(n)) return 'WOMEN';
  if (/\(r\)|\breserv|\byedek/i.test(n)) return 'RESERVE';
  return 'MAIN';
}

// ── İsim Normalizasyonu & Eşleştirme ───────────────────────────
function normalizeName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/\bu\s?\d{2}\b/g, '').replace(/\bunder\s?\d{2}\b/g, '')
    .replace(/\(w\)|\(k\)|\(r\)/g, '')
    .replace(/\bwomen\b|\bkadınlar\b|\bkadın\b|\bfemenil\b/g, '')
    .replace(/\breserves?\b|\byedekler?\b/g, '')
    .replace(/[''`]/g, '').replace(/\./g, '').replace(/-/g, ' ')
    .replace(/\s+/g, ' ').trim()
    .replace(/\bfc\b/g, '').replace(/\bsk\b/g, '').replace(/\bfk\b/g, '')
    .replace(/\bsc\b/g, '').replace(/\bac\b/g, '').replace(/\bas\b/g, '')
    .replace(/\bssc\b/g, '').replace(/\bcf\b/g, '').replace(/\baf\b/g, '')
    .replace(/\butd\b/g, 'united')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ş/g, 's')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/İ/g, 'i')
    .replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

function similarity(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (str) => {
    const set = new Map();
    for (let i = 0; i < str.length - 1; i++) {
      const bi = str.substring(i, i + 2);
      set.set(bi, (set.get(bi) || 0) + 1);
    }
    return set;
  };
  const aMap = bigrams(a), bMap = bigrams(b);
  let inter = 0;
  for (const [bi, c] of aMap) if (bMap.has(bi)) inter += Math.min(c, bMap.get(bi));
  return (2 * inter) / (a.length - 1 + b.length - 1);
}

function teamsMatch(name1, name2, threshold = 0.65) {
  if (extractTeamCategory(name1) !== extractTeamCategory(name2)) return false;
  const n1 = normalizeName(name1), n2 = normalizeName(name2);
  if (n1 === n2) return true;
  if (n1.includes(n2) || n2.includes(n1)) {
    if (Math.abs(n1.length - n2.length) <= 4) return true;
    return similarity(n1, n2) >= threshold;
  }
  return similarity(n1, n2) >= threshold;
}

// ══════════════════════════════════════════════════════════════════
//  FETCH: DIGITAIN (DUM, MER, RIS — aynı altyapı)
// ══════════════════════════════════════════════════════════════════
async function fetchDigitain(context, siteKey, cfg) {
  const tag = `[${siteKey}]`;
  console.log(`\n${tag} ▶ ${cfg.label} fetch başlıyor...`);
  const t0 = Date.now();
  const page = await context.newPage();

  try {
    await page.goto(cfg.url, { waitUntil: 'domcontentloaded', timeout: 120_000 });

    // iframe'i bekle
    console.log(`${tag} Digitain iframe bekleniyor...`);
    let apiFrame = null;
    for (let i = 0; i < 90; i++) {
      await sleep(1000);
      apiFrame = page.frames().find(f => f.url().includes('Tools/RequestHelper'))
               || page.frames().find(f => f.url().includes(cfg.framePat));
      if (apiFrame) break;
      if (i % 15 === 14) console.log(`${tag}   ...${i + 1}s bekleniyor`);
    }
    if (!apiFrame) throw new Error('Digitain iframe bulunamadı (90s timeout)');
    console.log(`${tag} iframe bulundu (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

    const apiBase = `${cfg.sportBase}/${cfg.partnerUUID}`;
    const qs = `langId=${cfg.langId}&partnerId=${cfg.partnerId}&countryCode=${cfg.country}`;

    async function dGet(endpoint) {
      try {
        const resp = await apiFrame.evaluate(async (u) => {
          const r = await fetch(u, { credentials: 'include' });
          const buf = await r.arrayBuffer();
          const b = new Uint8Array(buf); let s = '';
          for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
          return { status: r.status, b64: btoa(s) };
        }, `${apiBase}/${endpoint}`);
        return resp.status === 200 ? parseDigitainResponse(resp.b64) : null;
      } catch { return null; }
    }

    async function dPost(endpoint, body) {
      try {
        const resp = await apiFrame.evaluate(async ({ u, b }) => {
          const r = await fetch(u, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(b),
          });
          const buf = await r.arrayBuffer();
          const bytes = new Uint8Array(buf); let s = '';
          for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
          return { status: r.status, b64: btoa(s) };
        }, { u: `${apiBase}/${endpoint}`, b: body });
        return resp.status === 200 ? parseDigitainResponse(resp.b64) : null;
      } catch { return null; }
    }

    // 1) Ülke listesi
    console.log(`${tag} Ülke listesi çekiliyor...`);
    const countries = await dPost(
      `Prematch/GetCountryList?${qs}`,
      { sportId: cfg.sportId, timeFilter: 0 },
    );
    if (!countries || !Array.isArray(countries)) throw new Error('Ülke listesi alınamadı');
    console.log(`${tag} ${countries.length} ülke`);

    // 2) Şampiyonalar
    const allChamps = [];
    for (const c of countries) {
      const ch = await dPost(
        `Prematch/GetChampsList?${qs}`,
        { sportId: cfg.sportId, timeFilter: 0, countryId: c.Id },
      );
      if (ch && Array.isArray(ch)) allChamps.push(...ch);
      await sleep(50);
    }
    console.log(`${tag} ${allChamps.length} şampiyona`);

    // 3) Maçlar
    const stqs = cfg.stakeTypes.map(s => `stakeTypes=${s}`).join('&');
    const allEvents = [];
    let ci = 0;
    for (const ch of allChamps) {
      ci++;
      if ((ch.EC || 0) === 0) continue;
      const evs = await dGet(
        `prematch/geteventslist?champId=${ch.Id}&${stqs}&timeFilter=0&${qs}`,
      );
      if (evs && Array.isArray(evs)) {
        for (const ev of evs) {
          ev._champName = ch.N || ch.EGN || '';
          ev._countryName = ch.CtN || '';
        }
        allEvents.push(...evs);
      }
      if (ci % 50 === 0) console.log(`${tag}   ${ci}/${allChamps.length} şampiyona → ${allEvents.length} maç`);
      await sleep(80);
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
    console.log(`${tag} ✔ ${allEvents.length} maç çekildi (${elapsed}s)`);
    await page.close();
    return allEvents;
  } catch (err) {
    console.error(`${tag} ✘ HATA: ${err.message}`);
    try { await page.close(); } catch {}
    return [];
  }
}

// ══════════════════════════════════════════════════════════════════
//  FETCH: HOLİGANBET (WAMP WebSocket via iframe)
// ══════════════════════════════════════════════════════════════════
async function fetchHoliganbet(context) {
  console.log('\n[HOL] ▶ Holiganbet fetch başlıyor...');
  const t0 = Date.now();
  const page = await context.newPage();

  try {
    await page.goto(HOLIGANBET_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await sleep(8000);

    const sportFrame = page.frames().find(f => f.url().includes('sports2.'));
    if (!sportFrame) throw new Error('Sport iframe bulunamadı');
    console.log(`[HOL] iframe bulundu (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

    console.log('[HOL] WAMP WebSocket bağlantısı kuruluyor...');
    const allData = await sportFrame.evaluate(async () => {
      return new Promise((mainResolve) => {
        const ws = new WebSocket('wss://sportsapi.holiganbet1214.com/v2', ['wamp.2.json']);
        let reqId = 0;
        const pending = {};

        function call(procedure, kwargs) {
          return new Promise((res, rej) => {
            reqId++;
            pending[reqId] = { res, rej };
            ws.send(JSON.stringify([48, reqId, {}, procedure, [], kwargs || {}]));
            setTimeout(() => {
              if (pending[reqId]) { pending[reqId].rej(new Error('timeout')); delete pending[reqId]; }
            }, 15000);
          });
        }

        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (msg[0] === 50 && pending[msg[1]]) {
              pending[msg[1]].res(msg[4]); delete pending[msg[1]];
            } else if (msg[0] === 8 && pending[msg[2]]) {
              pending[msg[2]].rej(new Error(JSON.stringify(msg))); delete pending[msg[2]];
            }
          } catch {}
        };

        ws.onerror = () => mainResolve({ error: 'WS error' });
        const timeout = setTimeout(() => { ws.close(); mainResolve({ error: 'global timeout (180s)' }); }, 180000);

        ws.onopen = async () => {
          ws.send(JSON.stringify([1, "http://www.holiganbet.com", {
            "agent": "Surebet/1.0",
            "roles": {
              "subscriber": { "features": {} },
              "caller": { "features": { "caller_identification": true, "progressive_call_results": true } }
            }
          }]));

          await new Promise(r => {
            const orig = ws.onmessage;
            ws.onmessage = (ev) => {
              const msg = JSON.parse(ev.data);
              if (msg[0] === 2) { ws.onmessage = orig; r(); }
            };
          });

          try {
            const locData = await call("/sports#initialDump", {
              topic: "/sports/2218/tr/locations/1/NOT_LIVE/BOTH"
            });
            const locations = locData?.records?.filter(r =>
              r._type === 'LOCATION' && r.numberOfUpcomingMatches > 0
            ) || [];

            const allTournaments = [];
            const batchSize = 10;
            for (let i = 0; i < locations.length; i += batchSize) {
              const batch = locations.slice(i, i + batchSize);
              const results = await Promise.all(batch.map(loc =>
                call("/sports#initialDump", {
                  topic: `/sports/2218/tr/tournaments/1/${loc.id}`
                }).catch(() => null)
              ));
              for (const r of results) {
                if (!r?.records) continue;
                for (const rec of r.records) {
                  if (rec._type === 'TOURNAMENT' && rec.numberOfUpcomingMatches > 0)
                    allTournaments.push(rec);
                }
              }
            }

            const seen = new Set();
            const uniqueT = allTournaments.filter(t => {
              if (seen.has(t.id)) return false;
              seen.add(t.id); return true;
            });

            const allMatches = [], allBettingOffers = [], allOutcomes = [], allMarkets = [];
            for (let i = 0; i < uniqueT.length; i += batchSize) {
              const batch = uniqueT.slice(i, i + batchSize);
              const results = await Promise.all(batch.map(t =>
                call("/sports#initialDump", {
                  topic: `/sports/2218/tr/tournament-aggregator-groups-overview/${t.id}/default-event-info/NOT_LIVE/2258`
                }).catch(() => null)
              ));
              for (const r of results) {
                if (!r?.records) continue;
                for (const rec of r.records) {
                  if (rec._type === 'MATCH') allMatches.push(rec);
                  else if (rec._type === 'BETTING_OFFER') allBettingOffers.push(rec);
                  else if (rec._type === 'OUTCOME') allOutcomes.push(rec);
                  else if (rec._type === 'MARKET') allMarkets.push(rec);
                }
              }
            }

            clearTimeout(timeout);
            ws.close();
            mainResolve({
              matchCount: allMatches.length,
              matches: allMatches,
              bettingOffers: allBettingOffers,
              outcomes: allOutcomes,
              markets: allMarkets,
            });
          } catch (e) {
            clearTimeout(timeout);
            ws.close();
            mainResolve({ error: e.message });
          }
        };
      });
    });

    const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
    if (allData.error) throw new Error(allData.error);
    console.log(`[HOL] ✔ ${allData.matchCount} maç çekildi (${elapsed}s)`);
    await page.close();
    return allData;
  } catch (err) {
    console.error(`[HOL] ✘ HATA: ${err.message}`);
    try { await page.close(); } catch {}
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════
//  FETCH: TEMPOBET (HTML Scraping)
// ══════════════════════════════════════════════════════════════════
async function fetchTempobet(context) {
  console.log('\n[TEM] ▶ Tempobet fetch başlıyor...');
  const t0 = Date.now();
  const page = await context.newPage();

  await page.route('**/*.{png,jpg,jpeg,gif,svg,ico,woff,woff2,ttf}', r => r.abort());
  await page.route('**/liveperson.net/**', r => r.abort());
  await page.route('**/google-analytics.com/**', r => r.abort());
  await page.route('**/sportradar.com/**', r => r.abort());
  await page.route('**/lpsnmedia.net/**', r => r.abort());

  try {
    console.log('[TEM] Lig listesi çekiliyor...');
    await page.goto(`${TEMPOBET_BASE}/sport1.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(2000);

    const leagues = await page.evaluate(() => {
      const links = [];
      const couponDiv = document.getElementById('coupon');
      if (!couponDiv) return links;
      const h3s = couponDiv.querySelectorAll('h3.header');
      for (const h3 of h3s) {
        const country = h3.textContent.trim();
        const next = h3.nextElementSibling;
        if (next) {
          for (const a of next.querySelectorAll('a[href]')) {
            const href = a.getAttribute('href');
            if (href?.endsWith('.html')) {
              const name = a.textContent.trim();
              if (name && !links.find(l => l.href === href))
                links.push({ country, league: name, href });
            }
          }
        }
      }
      return links;
    });
    console.log(`[TEM] ${leagues.length} lig bulundu`);

    const allMatches = [];
    let processed = 0;

    for (const league of leagues) {
      processed++;
      try {
        await page.goto(`${TEMPOBET_BASE}/${league.href}`, {
          waitUntil: 'domcontentloaded', timeout: 30000,
        });
        await sleep(500);

        const matches = await page.evaluate((li) => {
          const results = [];
          const rows = document.querySelectorAll('table.tbl-a.static tr');
          let currentDate = '';
          for (const row of rows) {
            const thDesc = row.querySelector('th.desc');
            if (thDesc) { currentDate = thDesc.textContent.trim(); continue; }
            const teamCell = row.querySelector('td.team');
            const oddsCells = row.querySelectorAll('td.odds');
            if (!teamCell || oddsCells.length < 3) continue;
            const teamLink = teamCell.querySelector('a[href*="event"]');
            if (!teamLink) continue;
            const teamText = teamLink.textContent.trim();
            const timeSpan = teamLink.querySelector('span.tim');
            const time = timeSpan ? timeSpan.textContent.trim() : '';
            let matchName = teamText;
            if (time) matchName = matchName.replace(time, '').trim();
            matchName = matchName.replace(/\s*Canlı\s*$/, '').trim();
            const parts = matchName.split(' - ');
            if (parts.length < 2) continue;
            const home = parts[0].trim();
            const away = parts.slice(1).join(' - ').trim();
            const odds = [];
            for (const oc of oddsCells) {
              const el = oc.querySelector('.odd[data-odval]');
              odds.push(el ? parseFloat(el.getAttribute('data-odval')) : null);
            }
            results.push({
              country: li.country, league: li.league, date: currentDate, time,
              home, away,
              odds1: odds[0], oddsX: odds[1], odds2: odds[2],
              isLive: teamText.includes('Canlı'),
            });
          }
          return results;
        }, league);

        if (matches.length > 0) allMatches.push(...matches);

        if (processed % 50 === 0) {
          const el = ((Date.now() - t0) / 1000).toFixed(0);
          const rate = (processed / (Date.now() - t0) * 1000).toFixed(1);
          const eta = ((leagues.length - processed) / rate).toFixed(0);
          console.log(`[TEM]   ${processed}/${leagues.length} lig → ${allMatches.length} maç (${el}s, ~${eta}s kaldı)`);
        }
      } catch {}
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
    const live = allMatches.filter(m => m.isLive).length;
    const prematch = allMatches.length - live;
    console.log(`[TEM] ✔ ${allMatches.length} maç (${prematch} prematch, ${live} canlı) — ${elapsed}s`);
    await page.close();
    return allMatches;
  } catch (err) {
    console.error(`[TEM] ✘ HATA: ${err.message}`);
    try { await page.close(); } catch {}
    return [];
  }
}

// ══════════════════════════════════════════════════════════════════
//  FETCH: SEKABET (BetConstruct Swarm via iframe)
// ══════════════════════════════════════════════════════════════════
async function fetchSekabet(context) {
  console.log('\n[SEK] ▶ Sekabet fetch başlıyor...');
  const t0 = Date.now();
  const page = await context.newPage();

  try {
    await page.goto(SEKABET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(10000);

    const sportFrame = page.frames().find(f => f.url().includes('mbcsport'));
    if (!sportFrame) throw new Error('Sport iframe bulunamadı');
    console.log(`[SEK] iframe bulundu (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

    console.log('[SEK] Swarm WebSocket ile prematch çekiliyor...');
    const swarmUrl = SEKABET_SWARM;
    const siteId = SEKABET_SITE_ID;

    const result = await sportFrame.evaluate(async ({ swarmUrl, siteId }) => {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(swarmUrl);
        ws.onopen = () => {
          ws.send(JSON.stringify({
            command: 'request_session',
            params: { language: 'tur', site_id: siteId, source: 6 },
            rid: 'sess'
          }));
        };
        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.rid === 'sess' && msg.code === 0) {
              ws.send(JSON.stringify({
                command: 'get',
                params: {
                  source: 'betting',
                  what: {
                    sport: ['id', 'name'],
                    region: ['id', 'name'],
                    competition: ['id', 'name'],
                    game: ['id', 'start_ts', 'team1_name', 'team2_name', 'type', 'is_live'],
                    market: ['id', 'type', 'name'],
                    event: []
                  },
                  where: {
                    sport: { id: 1 },
                    game: { type: 0 },
                    market: { type: 'P1XP2' }
                  },
                  subscribe: false
                },
                rid: 'data'
              }));
            }
            if (msg.rid === 'data') {
              ws.close();
              const matches = [];
              const sportData = msg?.data?.data?.sport;
              if (sportData) {
                for (const sp of Object.values(sportData)) {
                  for (const rg of Object.values(sp.region || {})) {
                    for (const cp of Object.values(rg.competition || {})) {
                      for (const gm of Object.values(cp.game || {})) {
                        let ms1 = null, msX = null, ms2 = null;
                        for (const mk of Object.values(gm.market || {})) {
                          for (const ev of Object.values(mk.event || {})) {
                            if (ev.type === 'P1') ms1 = ev.price;
                            else if (ev.type === 'X') msX = ev.price;
                            else if (ev.type === 'P2') ms2 = ev.price;
                          }
                        }
                        matches.push({
                          home: gm.team1_name,
                          away: gm.team2_name,
                          competition: cp.name,
                          region: rg.name,
                          ms1, msX, ms2,
                          isLive: gm.is_live,
                        });
                      }
                    }
                  }
                }
              }
              resolve({ matches, total: matches.length });
            }
          } catch (err) {
            reject(err);
          }
        };
        ws.onerror = () => reject(new Error('WS error'));
        setTimeout(() => { try { ws.close(); } catch {} reject(new Error('timeout 60s')); }, 60000);
      });
    }, { swarmUrl, siteId });

    const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
    console.log(`[SEK] ✔ ${result.total} maç çekildi (${elapsed}s)`);
    await page.close();
    return result.matches;
  } catch (err) {
    console.error(`[SEK] ✘ HATA: ${err.message}`);
    try { await page.close(); } catch {}
    return [];
  }
}

// ══════════════════════════════════════════════════════════════════
async function fetchBetConstruct(context, siteKey, cfg) {
  console.log(`\n[${siteKey}] ▶ ${cfg.label} fetch başlıyor...`);
  const t0 = Date.now();
  const page = await context.newPage();

  try {
    await page.goto(cfg.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(5000);

    console.log(`[${siteKey}] Swarm WebSocket ile prematch çekiliyor...`);
    const swarmUrl = cfg.swarm;
    const siteId = cfg.siteId;

    const result = await page.evaluate(async ({ swarmUrl, siteId }) => {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(swarmUrl);
        ws.onopen = () => {
          ws.send(JSON.stringify({
            command: 'request_session',
            params: { language: 'tur', site_id: siteId, source: 6 },
            rid: 'sess'
          }));
        };
        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.rid === 'sess' && msg.code === 0) {
              ws.send(JSON.stringify({
                command: 'get',
                params: {
                  source: 'betting',
                  what: {
                    sport: ['id', 'name'],
                    region: ['id', 'name'],
                    competition: ['id', 'name'],
                    game: ['id', 'start_ts', 'team1_name', 'team2_name', 'type', 'is_live'],
                    market: ['id', 'type', 'name'],
                    event: []
                  },
                  where: {
                    sport: { id: 1 },
                    game: { type: 0 },
                    market: { type: 'P1XP2' }
                  },
                  subscribe: false
                },
                rid: 'data'
              }));
            }
            if (msg.rid === 'data') {
              ws.close();
              const matches = [];
              const sportData = msg?.data?.data?.sport;
              if (sportData) {
                for (const sp of Object.values(sportData)) {
                  for (const rg of Object.values(sp.region || {})) {
                    for (const cp of Object.values(rg.competition || {})) {
                      for (const gm of Object.values(cp.game || {})) {
                        let ms1 = null, msX = null, ms2 = null;
                        for (const mk of Object.values(gm.market || {})) {
                          for (const ev of Object.values(mk.event || {})) {
                            if (ev.type === 'P1') ms1 = ev.price;
                            else if (ev.type === 'X') msX = ev.price;
                            else if (ev.type === 'P2') ms2 = ev.price;
                          }
                        }
                        matches.push({
                          home: gm.team1_name,
                          away: gm.team2_name,
                          competition: cp.name,
                          region: rg.name,
                          ms1, msX, ms2,
                          isLive: gm.is_live,
                        });
                      }
                    }
                  }
                }
              }
              resolve({ matches, total: matches.length });
            }
          } catch (err) {
            reject(err);
          }
        };
        ws.onerror = () => reject(new Error('WS error'));
        setTimeout(() => { try { ws.close(); } catch {} reject(new Error('timeout 60s')); }, 60000);
      });
    }, { swarmUrl, siteId });

    const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
    console.log(`[${siteKey}] ✔ ${result.total} maç çekildi (${elapsed}s)`);
    await page.close();
    return result.matches;
  } catch (err) {
    console.error(`[${siteKey}] ✘ HATA: ${err.message}`);
    try { await page.close(); } catch {}
    return [];
  }
}

// ══════════════════════════════════════════════════════════════════
//  PRONET GAMING FETCH (TUL, IMA)
// ══════════════════════════════════════════════════════════════════
async function fetchPronet(context, siteKey, cfg) {
  const page = await context.newPage();
  const t0 = Date.now();
  try {
    console.log(`[${siteKey}] ${cfg.label} fixture-search API yakalanıyor...`);

    // Set up response interception for fixture-search API
    const fixtureDataPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('fixture-search timeout 45s')), 45000);
      page.on('response', async (resp) => {
        try {
          if (resp.url().includes('/fixture-search/') && resp.status() === 200) {
            const body = await resp.json();
            clearTimeout(timer);
            resolve(body);
          }
        } catch {}
      });
    });

    // Navigate to todays-events/football — page auto-calls fixture-search API
    await page.goto(cfg.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for the intercepted response
    const data = await fixtureDataPromise;

    // Parse fixtures — football stId=170
    const matches = [];
    const items = data?.data || [];
    for (const sport of items) {
      if (sport.stId !== 170) continue; // football only
      const categories = sport.cs || [];
      for (const cat of categories) {
        const seasons = cat.sns || [];
        for (const season of seasons) {
          const fixtures = season.fs || [];
          for (const fix of fixtures) {
            // Extract team names — hcN = home club name, acN = away club name
            const home = fix.hcN || '';
            const away = fix.acN || '';

            // Find 1x2 btg
            const btgs = fix.btgs || [];
            const btg1x2 = btgs.find(b => b.btgN === '1x2');
            if (!btg1x2) continue;

            let ms1 = 0, msX = 0, ms2 = 0;
            const fos = btg1x2.fos || [];
            for (const fo of fos) {
              if (fo.hSDId === 6) ms1 = fo.hO || 0;
              else if (fo.hSDId === 7) msX = fo.hO || 0;
              else if (fo.hSDId === 8) ms2 = fo.hO || 0;
            }

            if (ms1 > 1 && msX > 1 && ms2 > 1) {
              const regionName = cat.cN || '';
              const leagueName = season.lName || season.seaN || '';
              matches.push({
                home, away,
                competition: leagueName,
                region: regionName,
                ms1, msX, ms2,
                isLive: false,
              });
            }
          }
        }
      }
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
    console.log(`[${siteKey}] ✔ ${matches.length} maç çekildi (${elapsed}s)`);
    await page.close();
    return matches;
  } catch (err) {
    console.error(`[${siteKey}] ✘ HATA: ${err.message}`);
    try { await page.close(); } catch {}
    return [];
  }
}

// ══════════════════════════════════════════════════════════════════
//  SUREBET ANALİZ
// ══════════════════════════════════════════════════════════════════
function analyzeSurebets(siteData, fetchElapsed) {
  const t0 = performance.now();

  // ── Parse: her siteyi aynı formata getir ──
  const pools = {};

  // Digitain parse (DUM, MER, RIS) — dedup dahil
  for (const siteKey of ['DUM', 'MER', 'RIS']) {
    const raw = siteData[siteKey] || [];
    const matches = [];
    const seen = new Set();
    for (const ev of raw) {
      if (ev.IsOne || !ev.AT || ev.IsLive) continue;
      const ms = ev.StakeTypes?.find(st => st.Id === 1);
      if (!ms?.Stakes?.length) continue;
      const s1 = ms.Stakes.find(s => s.N === '1');
      const sX = ms.Stakes.find(s => s.N === 'X');
      const s2 = ms.Stakes.find(s => s.N === '2');
      if (!s1?.F || !sX?.F || !s2?.F) continue;
      const dedupKey = `${ev.HT}|${ev.AT}|${s1.F}|${sX.F}|${s2.F}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      matches.push({
        home: ev.HT, away: ev.AT,
        league: ev._champName || '', country: ev._countryName || '',
        ms1: s1.F, ms0: sX.F, ms2: s2.F,
      });
    }
    pools[siteKey] = matches.map((m, i) => ({ ...m, _idx: i }));
  }

  // Holiganbet parse
  {
    const holRaw = siteData.HOL;
    const matches = [];
    if (holRaw && holRaw.matches) {
      const { matches: hMatches, outcomes, bettingOffers } = holRaw;
      const outcomesByEvent = {};
      for (const o of outcomes) {
        if (!outcomesByEvent[o.eventId]) outcomesByEvent[o.eventId] = [];
        outcomesByEvent[o.eventId].push(o);
      }
      const boByOutcome = {};
      for (const bo of bettingOffers) boByOutcome[bo.outcomeId] = bo;
      for (const m of hMatches) {
        if (!m.homeParticipantName || !m.awayParticipantName) continue;
        const outs = outcomesByEvent[m.id] || [];
        const ho = outs.find(o => o.headerNameKey === 'home');
        const dr = outs.find(o => o.headerNameKey === 'draw');
        const aw = outs.find(o => o.headerNameKey === 'away');
        if (!ho || !dr || !aw) continue;
        const hb = boByOutcome[ho.id], db = boByOutcome[dr.id], ab = boByOutcome[aw.id];
        if (!hb || !db || !ab) continue;
        if (hb.odds === 0 && db.odds === 0 && ab.odds === 0) continue;
        matches.push({
          home: m.homeParticipantName, away: m.awayParticipantName,
          league: m.shortParentName || m.parentName || '',
          ms1: hb.odds, ms0: db.odds, ms2: ab.odds,
        });
      }
    }
    pools.HOL = matches.map((m, i) => ({ ...m, _idx: i }));
  }

  // Tempobet parse (sadece prematch)
  {
    const temRaw = siteData.TEM || [];
    const matches = [];
    for (const m of temRaw) {
      if (!m.home || !m.away || m.isLive) continue;
      if (m.odds1 == null || m.oddsX == null || m.odds2 == null) continue;
      const v1 = Number(m.odds1), vX = Number(m.oddsX), v2 = Number(m.odds2);
      if (v1 === 0 || vX === 0 || v2 === 0) continue;
      matches.push({
        home: m.home, away: m.away,
        league: m.league || '', country: m.country || '',
        ms1: v1, ms0: vX, ms2: v2,
      });
    }
    pools.TEM = matches.map((m, i) => ({ ...m, _idx: i }));
  }

  // Sekabet parse
  {
    const sekRaw = siteData.SEK || [];
    const matches = [];
    for (const m of sekRaw) {
      if (!m.home || !m.away) continue;
      if (m.isLive) continue;
      if (m.ms1 == null || m.msX == null || m.ms2 == null) continue;
      matches.push({
        home: m.home, away: m.away,
        league: m.competition || '', country: m.region || '',
        ms1: m.ms1, ms0: m.msX, ms2: m.ms2,
      });
    }
    pools.SEK = matches.map((m, i) => ({ ...m, _idx: i }));
  }

  // BetConstruct parse (POL, CAS, BOX, MIL) — same Swarm format as SEK
  for (const siteKey of ['POL', 'CAS', 'BOX', 'MIL']) {
    const raw = siteData[siteKey] || [];
    const matches = [];
    for (const m of raw) {
      if (!m.home || !m.away) continue;
      if (m.isLive) continue;
      if (m.ms1 == null || m.msX == null || m.ms2 == null) continue;
      matches.push({
        home: m.home, away: m.away,
        league: m.competition || '', country: m.region || '',
        ms1: m.ms1, ms0: m.msX, ms2: m.ms2,
      });
    }
    pools[siteKey] = matches.map((m, i) => ({ ...m, _idx: i }));
  }

  // Pronet parse (TUL, IMA) — same format as BC/SEK
  for (const siteKey of ['TUL', 'IMA']) {
    const raw = siteData[siteKey] || [];
    const matches = [];
    for (const m of raw) {
      if (!m.home || !m.away) continue;
      if (m.isLive) continue;
      if (m.ms1 == null || m.msX == null || m.ms2 == null) continue;
      matches.push({
        home: m.home, away: m.away,
        league: m.competition || '', country: m.region || '',
        ms1: m.ms1, ms0: m.msX, ms2: m.ms2,
      });
    }
    pools[siteKey] = matches.map((m, i) => ({ ...m, _idx: i }));
  }

  // Maç sayıları
  const siteLabels = {
    DUM: 'Dumanbet', HOL: 'Holiganbet', TEM: 'Tempobet', SEK: 'Sekabet',
    MER: 'Meritwin', RIS: 'Risebet',
    POL: 'Poliwin', CAS: 'TheCasino', BOX: 'Betbox', MIL: 'Milosbet',
    TUL: 'Tulipbet', IMA: 'Imajbet',
  };
  console.log(`\n── Maç Sayıları (prematch) ──`);
  for (const s of ALL_SITES) {
    console.log(`  ${siteLabels[s]}:${' '.repeat(12 - siteLabels[s].length)}${pools[s]?.length || 0}`);
  }

  // ── Eşleştirme ──
  function findBestMatch(target, pool, usedSet) {
    let best = null, bestScore = 0;
    for (const m of pool) {
      if (usedSet.has(m._idx)) continue;
      if (teamsMatch(target.home, m.home) && teamsMatch(target.away, m.away)) {
        const score = similarity(normalizeName(target.home), normalizeName(m.home)) +
                      similarity(normalizeName(target.away), normalizeName(m.away));
        if (score > bestScore) { bestScore = score; best = m; }
      }
    }
    return best;
  }

  const canonical = [];
  const usedSets = {};
  for (const s of ALL_SITES) usedSets[s] = new Set();

  // Eşleştirme: büyük havuzdan küçüğe doğru referans al
  const refOrder = ['DUM', 'MER', 'RIS', 'HOL', 'SEK', 'TEM', 'POL', 'CAS', 'BOX', 'MIL', 'TUL', 'IMA'];

  for (const refSite of refOrder) {
    const pool = pools[refSite] || [];
    for (const rm of pool) {
      if (usedSets[refSite].has(rm._idx)) continue;
      usedSets[refSite].add(rm._idx);

      const entry = {
        home: rm.home, away: rm.away, league: rm.league || rm.country || '',
        odds: { [refSite]: { ms1: rm.ms1, ms0: rm.ms0, ms2: rm.ms2 } },
        siteCount: 1, sites: [refSite],
      };

      // Diğer sitelerde eşleşme ara (sadece henüz işlenmemişler)
      for (const otherSite of ALL_SITES) {
        if (otherSite === refSite) continue;
        if (entry.odds[otherSite]) continue; // zaten eşleşti
        const match = findBestMatch(rm, pools[otherSite] || [], usedSets[otherSite]);
        if (match) {
          usedSets[otherSite].add(match._idx);
          entry.odds[otherSite] = { ms1: match.ms1, ms0: match.ms0, ms2: match.ms2 };
          entry.siteCount++;
          entry.sites.push(otherSite);
        }
      }
      canonical.push(entry);
    }
  }

  const multiSite = canonical.filter(c => c.siteCount >= 2);
  const counts = {};
  for (let n = 2; n <= 12; n++) counts[n] = canonical.filter(c => c.siteCount === n).length;

  console.log(`  Canonical: ${canonical.length} | ` +
    Object.entries(counts).filter(([,v]) => v > 0).map(([k,v]) => `${k} site: ${v}`).join(' | ') +
    ` | Tek site: ${canonical.length - multiSite.length}`);

  // ── Surebet hesaplama ──
  const surebets = [];
  const allComparisons = [];
  for (const c of multiSite) {
    let best1 = { val: 0, src: '' }, bestX = { val: 0, src: '' }, best2 = { val: 0, src: '' };
    for (const site of ALL_SITES) {
      const o = c.odds[site]; if (!o) continue;
      if (o.ms1 > best1.val) best1 = { val: o.ms1, src: site };
      if (o.ms0 > bestX.val) bestX = { val: o.ms0, src: site };
      if (o.ms2 > best2.val) best2 = { val: o.ms2, src: site };
    }
    const margin = (1 / best1.val) + (1 / bestX.val) + (1 / best2.val);
    const profit = ((1 / margin) - 1) * 100;
    const entry = {
      home: c.home, away: c.away, league: c.league,
      odds: c.odds, sites: c.sites, siteCount: c.siteCount,
      best1, bestX, best2, margin, profit,
      isSurebet: margin < 1,
    };
    allComparisons.push(entry);
    if (margin < 1) surebets.push(entry);
  }

  // ── Rapor ──
  const elapsed = ((performance.now() - t0) / 1000).toFixed(2);

  const output = [];
  output.push('╔══════════════════════════════════════════════════════════════════════════════════╗');
  output.push('║   SUREBET ANALİZİ: 12 SİTE                                                    ║');
  output.push('║   DUM / HOL / TEM / SEK / MER / RIS / POL / CAS / BOX / MIL / TUL / IMA       ║');
  output.push('║   Sadece Prematch — Canlı maçlar hariç                                         ║');
  output.push('║   🔴 CANLI VERİ — Tüm siteler anlık çekildi                                    ║');
  output.push(`║   ${new Date().toLocaleString('tr-TR').padEnd(62)}║`);
  output.push(`║   Veri çekim süresi: ${fetchElapsed}s | Analiz: ${elapsed}s${' '.repeat(Math.max(0, 34 - String(fetchElapsed).length - elapsed.length))}║`);
  output.push('╚══════════════════════════════════════════════════════════════════════╝');
  output.push('');

  for (const s of ALL_SITES) {
    output.push(`${siteLabels[s]} maç sayısı:${' '.repeat(14 - siteLabels[s].length)}${pools[s]?.length || 0}`);
  }
  output.push(`Toplam canonical maç:  ${canonical.length}`);
  for (let n = 12; n >= 2; n--) {
    if (counts[n] > 0) output.push(`${n} sitede eşleşen:${' '.repeat(6)}${counts[n]}`);
  }
  output.push(`Karşılaştırılabilir:   ${multiSite.length}`);
  output.push('');

  if (surebets.length > 0) {
    surebets.sort((a, b) => b.profit - a.profit);
    output.push(`🎯 SUREBET BULUNAN MAÇLAR: ${surebets.length}`);
    output.push('─'.repeat(70));
    for (const s of surebets) {
      const p1 = 1 / s.best1.val, pX = 1 / s.bestX.val, p2 = 1 / s.best2.val;
      const totalP = p1 + pX + p2;
      const yat1 = (p1 / totalP) * KASA;
      const yat0 = (pX / totalP) * KASA;
      const yat2 = (p2 / totalP) * KASA;
      const kazanc1 = yat1 * s.best1.val;
      const kazanc0 = yat0 * s.bestX.val;
      const kazanc2 = yat2 * s.best2.val;
      const netKar = kazanc1 - KASA;

      output.push(`\n  ⚽ ${s.home} vs ${s.away}`);
      output.push(`     Lig: ${s.league}`);
      output.push(`     Siteler: ${s.sites.join(', ')}`);
      output.push(`     Toplam Olasılık: ${s.margin.toFixed(4)} (< 1.00 → SUREBET ✓)`);
      output.push(`     Net Kâr: %${s.profit.toFixed(2)} (${KASA} TL kasa → ~${netKar.toFixed(0)} TL kâr)`);
      output.push(`     ┌───────────┬───────────┬───────────┐`);
      output.push(`     │   MS 1    │   MS X    │   MS 2    │`);
      output.push(`     ├───────────┼───────────┼───────────┤`);
      for (const site of ALL_SITES) {
        if (s.odds[site]) {
          output.push(`     │ ${site} ${s.odds[site].ms1.toFixed(2).padStart(5)}  │ ${site} ${s.odds[site].ms0.toFixed(2).padStart(5)}  │ ${site} ${s.odds[site].ms2.toFixed(2).padStart(5)}  │`);
        }
      }
      output.push(`     ├───────────┼───────────┼───────────┤`);
      output.push(`     │ →${s.best1.src} ${s.best1.val.toFixed(2).padStart(5)} │ →${s.bestX.src} ${s.bestX.val.toFixed(2).padStart(5)} │ →${s.best2.src} ${s.best2.val.toFixed(2).padStart(5)} │`);
      output.push(`     ├───────────┼───────────┼───────────┤`);
      output.push(`     │ 💰 ${yat1.toFixed(0).padStart(4)} TL │ 💰 ${yat0.toFixed(0).padStart(4)} TL │ 💰 ${yat2.toFixed(0).padStart(4)} TL │`);
      output.push(`     └───────────┴───────────┴───────────┘`);
      output.push(`     Sağlama: MS1→${kazanc1.toFixed(0)}TL  MS0→${kazanc0.toFixed(0)}TL  MS2→${kazanc2.toFixed(0)}TL`);
    }
    output.push('');
  } else {
    output.push('❌ SUREBET BULUNAMADI');
    output.push('');
  }

  output.push('\n═══ İSTATİSTİKLER ═══');
  const sorted = [...allComparisons].sort((a, b) => a.margin - b.margin);
  if (sorted.length > 0) {
    output.push(`En düşük margin: ${sorted[0].margin.toFixed(4)} (${sorted[0].home} vs ${sorted[0].away})`);
    output.push(`Ortalama margin: ${(allComparisons.reduce((s, c) => s + c.margin, 0) / allComparisons.length).toFixed(4)}`);
  }
  output.push(`Margin < 1.00 (surebet): ${surebets.length}`);
  output.push(`Margin < 1.03:           ${allComparisons.filter(c => c.margin < 1.03).length}`);
  output.push(`Margin < 1.05:           ${allComparisons.filter(c => c.margin < 1.05).length}`);

  // Site çiftleri
  output.push('\n═══ SİTE ÇİFTLERİ ANALİZİ ═══');
  for (let i = 0; i < ALL_SITES.length; i++) {
    for (let j = i + 1; j < ALL_SITES.length; j++) {
      const s1 = ALL_SITES[i], s2 = ALL_SITES[j];
      const pm = allComparisons.filter(c => c.odds[s1] && c.odds[s2]);
      if (pm.length === 0) continue;
      const pbm = pm.map(c => {
        const b1 = Math.max(c.odds[s1]?.ms1 || 0, c.odds[s2]?.ms1 || 0);
        const bX = Math.max(c.odds[s1]?.ms0 || 0, c.odds[s2]?.ms0 || 0);
        const b2 = Math.max(c.odds[s1]?.ms2 || 0, c.odds[s2]?.ms2 || 0);
        return 1 / b1 + 1 / bX + 1 / b2;
      }).sort((a, b) => a - b);
      output.push(`${s1}-${s2}: ${pm.length} eşleşme, ${pbm.filter(m => m < 1).length} surebet, en düşük: ${pbm[0]?.toFixed(4)}`);
    }
  }

  output.push('\n═══ EN DÜŞÜK MARGİN TOP 15 ═══');
  for (const s of sorted.slice(0, 15)) {
    const ps = s.profit >= 0 ? `+%${s.profit.toFixed(2)}` : `%${s.profit.toFixed(2)}`;
    output.push(`  ${s.margin.toFixed(4)} (${ps}) │ ${s.home} vs ${s.away} [${s.sites.join('+')}]`);
    for (const site of ALL_SITES) {
      if (s.odds[site]) {
        output.push(`    ${site}: ${s.odds[site].ms1.toFixed(2)}/${s.odds[site].ms0.toFixed(2)}/${s.odds[site].ms2.toFixed(2)}`);
      }
    }
  }

  return {
    output: output.join('\n'),
    surebets, allComparisons,
    pools,
    stats: {
      siteCounts: Object.fromEntries(ALL_SITES.map(s => [s, pools[s]?.length || 0])),
      canonicalCount: canonical.length,
      multiSiteCount: multiSite.length,
      surebetCount: surebets.length,
      avgMargin: allComparisons.length > 0
        ? allComparisons.reduce((s, c) => s + c.margin, 0) / allComparisons.length
        : null,
      lowestMargin: sorted[0]?.margin ?? null,
      analysisElapsed: elapsed,
    },
  };
}

// ══════════════════════════════════════════════════════════════════
//  ANA PROGRAM
// ══════════════════════════════════════════════════════════════════
const globalStart = Date.now();

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  SUREBET REALTIME — 12 Site Anlık Çek + Analiz             ║');
console.log(`║  ${new Date().toLocaleString('tr-TR').padEnd(56)}║`);
console.log('╚══════════════════════════════════════════════════════════════╝');

// Chrome CDP bağlantısı
console.log('\nChrome CDP bağlanıyor...');
let browser;
try {
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
} catch (err) {
  console.error(`\n✘ Chrome CDP bağlantısı kurulamadı (port ${CDP_PORT})!`);
  console.error('  Chrome\'u şu şekilde başlatın:');
  console.error(`  chrome.exe --remote-debugging-port=${CDP_PORT}`);
  process.exit(1);
}

const context = browser.contexts()[0] || await browser.newContext();
console.log('✔ Chrome bağlandı\n');

console.log('═══ 12 SİTE PARALEL ÇEKİLİYOR ═══');

// 12 siteyi paralel çek
const [dumData, holData, temData, sekData, merData, risData, polData, casData, boxData, milData, tulData, imaData] = await Promise.all([
  fetchDigitain(context, 'DUM', DIGITAIN_SITES.DUM),
  fetchHoliganbet(context),
  fetchTempobet(context),
  fetchSekabet(context),
  fetchDigitain(context, 'MER', DIGITAIN_SITES.MER),
  fetchDigitain(context, 'RIS', DIGITAIN_SITES.RIS),
  fetchBetConstruct(context, 'POL', BETCONSTRUCT_SITES.POL),
  fetchBetConstruct(context, 'CAS', BETCONSTRUCT_SITES.CAS),
  fetchBetConstruct(context, 'BOX', BETCONSTRUCT_SITES.BOX),
  fetchBetConstruct(context, 'MIL', BETCONSTRUCT_SITES.MIL),
  fetchPronet(context, 'TUL', PRONET_SITES.TUL),
  fetchPronet(context, 'IMA', PRONET_SITES.IMA),
]);

const fetchElapsed = ((Date.now() - globalStart) / 1000).toFixed(0);

console.log(`\n${'═'.repeat(50)}`);
console.log(`  Veri çekimi tamamlandı (${fetchElapsed}s)`);
console.log(`  DUM: ${dumData.length} event`);
console.log(`  HOL: ${holData ? holData.matchCount : 0} maç`);
console.log(`  TEM: ${temData.length} maç`);
console.log(`  SEK: ${sekData.length} maç`);
console.log(`  MER: ${merData.length} event`);
console.log(`  RIS: ${risData.length} event`);
console.log(`  POL: ${polData.length} maç`);
console.log(`  CAS: ${casData.length} maç`);
console.log(`  BOX: ${boxData.length} maç`);
console.log(`  MIL: ${milData.length} maç`);
console.log(`  TUL: ${tulData.length} maç`);
console.log(`  IMA: ${imaData.length} maç`);
console.log(`${'═'.repeat(50)}`);

// Ham verileri kaydet
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (dumData.length > 0)
  fs.writeFileSync(`${OUTPUT_DIR}/digitain-football-all-events.json`, JSON.stringify(dumData, null, 2), 'utf8');
if (holData)
  fs.writeFileSync(`${OUTPUT_DIR}/holiganbet-prematch-raw.json`, JSON.stringify(holData, null, 2), 'utf8');
if (temData.length > 0)
  fs.writeFileSync(`${OUTPUT_DIR}/tempobet-football-raw.json`, JSON.stringify(temData, null, 2), 'utf8');
if (sekData.length > 0)
  fs.writeFileSync(`${OUTPUT_DIR}/sekabet-prematch-raw.json`, JSON.stringify(sekData, null, 2), 'utf8');
if (merData.length > 0)
  fs.writeFileSync(`${OUTPUT_DIR}/meritwin-football-all-events.json`, JSON.stringify(merData, null, 2), 'utf8');
if (risData.length > 0)
  fs.writeFileSync(`${OUTPUT_DIR}/risebet-football-all-events.json`, JSON.stringify(risData, null, 2), 'utf8');
if (polData.length > 0)
  fs.writeFileSync(`${OUTPUT_DIR}/poliwin-prematch-raw.json`, JSON.stringify(polData, null, 2), 'utf8');
if (casData.length > 0)
  fs.writeFileSync(`${OUTPUT_DIR}/thecasino-prematch-raw.json`, JSON.stringify(casData, null, 2), 'utf8');
if (boxData.length > 0)
  fs.writeFileSync(`${OUTPUT_DIR}/betbox-prematch-raw.json`, JSON.stringify(boxData, null, 2), 'utf8');
if (milData.length > 0)
  fs.writeFileSync(`${OUTPUT_DIR}/milosbet-prematch-raw.json`, JSON.stringify(milData, null, 2), 'utf8');
if (tulData.length > 0)
  fs.writeFileSync(`${OUTPUT_DIR}/tulipbet-prematch-raw.json`, JSON.stringify(tulData, null, 2), 'utf8');
if (imaData.length > 0)
  fs.writeFileSync(`${OUTPUT_DIR}/imajbet-prematch-raw.json`, JSON.stringify(imaData, null, 2), 'utf8');
console.log('  Ham veriler artifacts/ klasörüne kaydedildi.\n');

// Surebet analizi
console.log('═══ SUREBET ANALİZİ BAŞLIYOR ═══\n');
const result = analyzeSurebets({
  DUM: dumData,
  HOL: holData,
  TEM: temData,
  SEK: sekData,
  MER: merData,
  RIS: risData,
  POL: polData,
  CAS: casData,
  BOX: boxData,
  MIL: milData,
  TUL: tulData,
  IMA: imaData,
}, fetchElapsed);

// Sonuçları yazdır
console.log(result.output);

// Dosyalara kaydet
fs.writeFileSync(`${OUTPUT_DIR}/surebet-analysis.txt`, result.output, 'utf8');
fs.writeFileSync(`${OUTPUT_DIR}/surebet-results.json`, JSON.stringify({
  surebets: result.surebets,
  stats: result.stats,
  top15: [...result.allComparisons].sort((a, b) => a.margin - b.margin).slice(0, 15),
  fetchTime: fetchElapsed,
  timestamp: new Date().toISOString(),
}, null, 2), 'utf8');

const totalElapsed = ((Date.now() - globalStart) / 1000).toFixed(0);
console.log(`\n→ artifacts/surebet-analysis.txt`);
console.log(`→ artifacts/surebet-results.json`);
console.log(`⏱  Toplam süre: ${totalElapsed}s (çekim: ${fetchElapsed}s)`);

try { await browser.close(); } catch {}
