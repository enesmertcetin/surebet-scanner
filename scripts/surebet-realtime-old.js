/**
 * Surebet Realtime — Anlık Çek + Analiz
 * 3 siteyi (Dumanbet, Holiganbet, Tempobet) PARALEL çeker,
 * ardından surebet karşılaştırmasını yapar.
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
const DUMANBET_URL = 'https://dumanbet885.com/tr/Sports/digitain';
const HOLIGANBET_URL = 'https://www.holiganbet10214.com/tr/sports/i/spor/futbol/1/t%C3%BCm%C3%BC/0/lokasyon';
const TEMPOBET_BASE = 'https://www.1124tempobet.com';

// Digitain API ayarları
const DIG_PARTNER_ID = '12dde6a1-36aa-4273-9140-9774eeb6c77b';
const DIG_SPORT_BASE = 'https://sport.dmnppsportsdigi.com';
const DIG_LANG_ID = 4;
const DIG_PARTNER_NUM = 685;
const DIG_COUNTRY = 'TR';
const DIG_SPORT_ID = 1; // Futbol
const DIG_STAKE_TYPES = [1, 702, 3, 2533, 2, 2532, 313638, 313639, 37, 402315];

const KASA = 1000; // TL
const OUTPUT_DIR = 'artifacts';
const SITES = ['DUM', 'HOL', 'TEM'];

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
  // U-number: U19, U20, U21, U23 etc.
  if (/\bu\s?\d{2}\b/.test(n) || /\bunder\s?\d{2}\b/.test(n)) return 'YOUTH';
  // Women / Kadınlar
  if (/\(w\)|\(k\)|\bwomen\b|\bkadın|\bfemenil\b|\bfeminine\b|\bfeminin/i.test(n)) return 'WOMEN';
  // Reserves / Yedekler
  if (/\(r\)|\breserv|\byedek/i.test(n)) return 'RESERVE';
  return 'MAIN';
}

// ── İsim Normalizasyonu & Eşleştirme ───────────────────────────
function normalizeName(name) {
  if (!name) return '';
  return name.toLowerCase()
    // Kategori işaretlerini temizle (extractTeamCategory zaten hallediyor)
    .replace(/\bu\s?\d{2}\b/g, '').replace(/\bunder\s?\d{2}\b/g, '')
    .replace(/\(w\)|\(k\)|\(r\)/g, '')
    .replace(/\bwomen\b|\bkadınlar\b|\bkadın\b|\bfemenil\b/g, '')
    .replace(/\breserves?\b|\byedekler?\b/g, '')
    // Genel temizlik
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
  // 1) Kategori kontrolü: U21 ↔ Ana takım, Kadın ↔ Erkek eşleşmemeli
  if (extractTeamCategory(name1) !== extractTeamCategory(name2)) return false;

  const n1 = normalizeName(name1), n2 = normalizeName(name2);
  if (n1 === n2) return true;

  // 2) Biri diğerini içeriyorsa VE fark küçükse ("FC" gibi prefix/suffix)
  if (n1.includes(n2) || n2.includes(n1)) {
    if (Math.abs(n1.length - n2.length) <= 4) return true;
    // Fark büyükse similarity ile doğrula
    return similarity(n1, n2) >= threshold;
  }

  // 3) Sadece similarity — ilk kelime shortcut'u kaldırıldı (çok hatalıydı)
  return similarity(n1, n2) >= threshold;
}

// ══════════════════════════════════════════════════════════════════
//  FETCH: DUMANBET (Digitain XOR API via iframe)
// ══════════════════════════════════════════════════════════════════
async function fetchDumanbet(context) {
  console.log('\n[DUM] ▶ Dumanbet fetch başlıyor...');
  const t0 = Date.now();
  const page = await context.newPage();

  try {
    await page.goto(DUMANBET_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });

    // iframe'i bekle (polling — sabit 40s bekleme yerine)
    console.log('[DUM] Digitain iframe bekleniyor...');
    let apiFrame = null;
    for (let i = 0; i < 90; i++) {
      await sleep(1000);
      apiFrame = page.frames().find(f => f.url().includes('Tools/RequestHelper'))
               || page.frames().find(f => f.url().includes('dmnppsportsdigi'));
      if (apiFrame) break;
      if (i % 15 === 14) console.log(`[DUM]   ...${i + 1}s bekleniyor`);
    }
    if (!apiFrame) throw new Error('Digitain iframe bulunamadı (90s timeout)');
    console.log(`[DUM] iframe bulundu (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

    const apiBase = `${DIG_SPORT_BASE}/${DIG_PARTNER_ID}`;
    const qs = `langId=${DIG_LANG_ID}&partnerId=${DIG_PARTNER_NUM}&countryCode=${DIG_COUNTRY}`;

    // Digitain API GET
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

    // Digitain API POST
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
    console.log('[DUM] Ülke listesi çekiliyor...');
    const countries = await dPost(
      `Prematch/GetCountryList?${qs}`,
      { sportId: DIG_SPORT_ID, timeFilter: 0 },
    );
    if (!countries || !Array.isArray(countries)) throw new Error('Ülke listesi alınamadı');
    console.log(`[DUM] ${countries.length} ülke`);

    // 2) Şampiyonalar
    const allChamps = [];
    for (const c of countries) {
      const ch = await dPost(
        `Prematch/GetChampsList?${qs}`,
        { sportId: DIG_SPORT_ID, timeFilter: 0, countryId: c.Id },
      );
      if (ch && Array.isArray(ch)) allChamps.push(...ch);
      await sleep(50);
    }
    console.log(`[DUM] ${allChamps.length} şampiyona`);

    // 3) Maçlar
    const stqs = DIG_STAKE_TYPES.map(s => `stakeTypes=${s}`).join('&');
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
      if (ci % 50 === 0) console.log(`[DUM]   ${ci}/${allChamps.length} şampiyona → ${allEvents.length} maç`);
      await sleep(80);
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
    console.log(`[DUM] ✔ ${allEvents.length} maç çekildi (${elapsed}s)`);
    await page.close();
    return allEvents;
  } catch (err) {
    console.error(`[DUM] ✘ HATA: ${err.message}`);
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
        const ws = new WebSocket('wss://sportsapi.holiganbet10214.com/v2', ['wamp.2.json']);
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
          // WAMP Hello
          ws.send(JSON.stringify([1, "http://www.holiganbet.com", {
            "agent": "Surebet/1.0",
            "roles": {
              "subscriber": { "features": {} },
              "caller": { "features": { "caller_identification": true, "progressive_call_results": true } }
            }
          }]));

          // WELCOME bekle
          await new Promise(r => {
            const orig = ws.onmessage;
            ws.onmessage = (ev) => {
              const msg = JSON.parse(ev.data);
              if (msg[0] === 2) { ws.onmessage = orig; r(); }
            };
          });

          try {
            // 1) Lokasyonlar
            const locData = await call("/sports#initialDump", {
              topic: "/sports/2218/tr/locations/1/NOT_LIVE/BOTH"
            });
            const locations = locData?.records?.filter(r =>
              r._type === 'LOCATION' && r.numberOfUpcomingMatches > 0
            ) || [];

            // 2) Turnuvalar
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

            // Unique turnuvalar
            const seen = new Set();
            const uniqueT = allTournaments.filter(t => {
              if (seen.has(t.id)) return false;
              seen.add(t.id); return true;
            });

            // 3) Maçlar + oranlar
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

  // Gereksiz kaynakları engelle → hız
  await page.route('**/*.{png,jpg,jpeg,gif,svg,ico,woff,woff2,ttf}', r => r.abort());
  await page.route('**/liveperson.net/**', r => r.abort());
  await page.route('**/google-analytics.com/**', r => r.abort());
  await page.route('**/sportradar.com/**', r => r.abort());
  await page.route('**/lpsnmedia.net/**', r => r.abort());

  try {
    // Lig linklerini çek
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

    // Her lig sayfasını ziyaret et
    const allMatches = [];
    let processed = 0, emptyLeagues = 0;

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
        else emptyLeagues++;

        if (processed % 50 === 0) {
          const el = ((Date.now() - t0) / 1000).toFixed(0);
          const rate = (processed / (Date.now() - t0) * 1000).toFixed(1);
          const eta = ((leagues.length - processed) / rate).toFixed(0);
          console.log(`[TEM]   ${processed}/${leagues.length} lig → ${allMatches.length} maç (${el}s, ~${eta}s kaldı)`);
        }
      } catch {
        emptyLeagues++;
      }
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
//  SUREBET ANALİZ
// ══════════════════════════════════════════════════════════════════
function analyzeSurebets(dumRaw, holRaw, temRaw, fetchElapsed) {
  const t0 = performance.now();

  // ── Dumanbet parse (+ duplicate removal) ──
  const dumanbetMatches = [];
  const dumSeen = new Set();
  for (const ev of dumRaw) {
    if (ev.IsOne || !ev.AT || ev.IsLive) continue;
    const ms = ev.StakeTypes?.find(st => st.Id === 1);
    if (!ms?.Stakes?.length) continue;
    const s1 = ms.Stakes.find(s => s.N === '1');
    const sX = ms.Stakes.find(s => s.N === 'X');
    const s2 = ms.Stakes.find(s => s.N === '2');
    if (!s1?.F || !sX?.F || !s2?.F) continue;
    // Duplicate kontrolü: aynı ev+deplasman+oran → atla
    const dedupKey = `${ev.HT}|${ev.AT}|${s1.F}|${sX.F}|${s2.F}`;
    if (dumSeen.has(dedupKey)) continue;
    dumSeen.add(dedupKey);
    dumanbetMatches.push({
      home: ev.HT, away: ev.AT,
      league: ev._champName || '', country: ev._countryName || '',
      ms1: s1.F, ms0: sX.F, ms2: s2.F,
    });
  }

  // ── Holiganbet parse ──
  const holiganMatches = [];
  if (holRaw && holRaw.matches) {
    const { matches, outcomes, bettingOffers } = holRaw;
    const outcomesByEvent = {};
    for (const o of outcomes) {
      if (!outcomesByEvent[o.eventId]) outcomesByEvent[o.eventId] = [];
      outcomesByEvent[o.eventId].push(o);
    }
    const boByOutcome = {};
    for (const bo of bettingOffers) boByOutcome[bo.outcomeId] = bo;

    for (const m of matches) {
      if (!m.homeParticipantName || !m.awayParticipantName) continue;
      const outs = outcomesByEvent[m.id] || [];
      const ho = outs.find(o => o.headerNameKey === 'home');
      const dr = outs.find(o => o.headerNameKey === 'draw');
      const aw = outs.find(o => o.headerNameKey === 'away');
      if (!ho || !dr || !aw) continue;
      const hb = boByOutcome[ho.id], db = boByOutcome[dr.id], ab = boByOutcome[aw.id];
      if (!hb || !db || !ab) continue;
      if (hb.odds === 0 && db.odds === 0 && ab.odds === 0) continue;
      holiganMatches.push({
        home: m.homeParticipantName, away: m.awayParticipantName,
        league: m.shortParentName || m.parentName || '',
        ms1: hb.odds, ms0: db.odds, ms2: ab.odds,
      });
    }
  }

  // ── Tempobet parse (sadece prematch) ──
  const tempobetMatches = [];
  for (const m of temRaw) {
    if (!m.home || !m.away || m.isLive) continue;
    if (m.odds1 == null || m.oddsX == null || m.odds2 == null) continue;
    const v1 = Number(m.odds1), vX = Number(m.oddsX), v2 = Number(m.odds2);
    if (v1 === 0 || vX === 0 || v2 === 0) continue;
    tempobetMatches.push({
      home: m.home, away: m.away,
      league: m.league || '', country: m.country || '',
      ms1: v1, ms0: vX, ms2: v2,
    });
  }

  console.log(`\n── Maç Sayıları (prematch) ──`);
  console.log(`  Dumanbet:   ${dumanbetMatches.length}`);
  console.log(`  Holiganbet: ${holiganMatches.length}`);
  console.log(`  Tempobet:   ${tempobetMatches.length}`);

  // ── Eşleştirme ──
  const pools = {
    DUM: dumanbetMatches.map((m, i) => ({ ...m, _idx: i })),
    HOL: holiganMatches.map((m, i) => ({ ...m, _idx: i })),
    TEM: tempobetMatches.map((m, i) => ({ ...m, _idx: i })),
  };

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
  const usedHOL = new Set(), usedTEM = new Set();

  // DUM referans
  for (const dm of pools.DUM) {
    const entry = {
      home: dm.home, away: dm.away, league: dm.league || dm.country,
      odds: { DUM: { ms1: dm.ms1, ms0: dm.ms0, ms2: dm.ms2 } },
      siteCount: 1, sites: ['DUM'],
    };
    const hm = findBestMatch(dm, pools.HOL, usedHOL);
    if (hm) { usedHOL.add(hm._idx); entry.odds.HOL = { ms1: hm.ms1, ms0: hm.ms0, ms2: hm.ms2 }; entry.siteCount++; entry.sites.push('HOL'); }
    const tm = findBestMatch(dm, pools.TEM, usedTEM);
    if (tm) { usedTEM.add(tm._idx); entry.odds.TEM = { ms1: tm.ms1, ms0: tm.ms0, ms2: tm.ms2 }; entry.siteCount++; entry.sites.push('TEM'); }
    canonical.push(entry);
  }

  // HOL'de olup DUM'da olmayan
  for (const hm of pools.HOL) {
    if (usedHOL.has(hm._idx)) continue;
    usedHOL.add(hm._idx);
    const entry = {
      home: hm.home, away: hm.away, league: hm.league,
      odds: { HOL: { ms1: hm.ms1, ms0: hm.ms0, ms2: hm.ms2 } },
      siteCount: 1, sites: ['HOL'],
    };
    const tm = findBestMatch(hm, pools.TEM, usedTEM);
    if (tm) { usedTEM.add(tm._idx); entry.odds.TEM = { ms1: tm.ms1, ms0: tm.ms0, ms2: tm.ms2 }; entry.siteCount++; entry.sites.push('TEM'); }
    canonical.push(entry);
  }

  // TEM'de olup diğerlerinde olmayan
  for (const tm of pools.TEM) {
    if (usedTEM.has(tm._idx)) continue;
    canonical.push({
      home: tm.home, away: tm.away, league: tm.league,
      odds: { TEM: { ms1: tm.ms1, ms0: tm.ms0, ms2: tm.ms2 } },
      siteCount: 1, sites: ['TEM'],
    });
  }

  const multiSite = canonical.filter(c => c.siteCount >= 2);
  const threeSite = canonical.filter(c => c.siteCount === 3);
  const twoSite = canonical.filter(c => c.siteCount === 2);

  console.log(`  Canonical: ${canonical.length} | 3 site: ${threeSite.length} | 2 site: ${twoSite.length} | Tek site: ${canonical.length - multiSite.length}`);

  // ── Surebet hesaplama ──
  const surebets = [];
  const allComparisons = [];
  for (const c of multiSite) {
    let best1 = { val: 0, src: '' }, bestX = { val: 0, src: '' }, best2 = { val: 0, src: '' };
    for (const site of SITES) {
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
  const almostSurebets = allComparisons
    .filter(c => c.margin < 1.03 && c.margin >= 1)
    .sort((a, b) => a.margin - b.margin);

  const elapsed = ((performance.now() - t0) / 1000).toFixed(2);

  const output = [];
  output.push('╔══════════════════════════════════════════════════════════════════╗');
  output.push('║   SUREBET ANALİZİ: DUMANBET vs HOLİGANBET vs TEMPOBET         ║');
  output.push('║   Sadece Prematch — Canlı maçlar hariç                         ║');
  output.push('║   🔴 CANLI VERİ — Tüm siteler anlık çekildi                    ║');
  output.push(`║   ${new Date().toLocaleString('tr-TR').padEnd(58)}║`);
  output.push(`║   Veri çekim süresi: ${fetchElapsed}s | Analiz: ${elapsed}s${' '.repeat(Math.max(0, 30 - fetchElapsed.length - elapsed.length))}║`);
  output.push('╚══════════════════════════════════════════════════════════════════╝');
  output.push('');
  output.push(`Dumanbet maç sayısı:   ${dumanbetMatches.length}`);
  output.push(`Holiganbet maç sayısı: ${holiganMatches.length}`);
  output.push(`Tempobet maç sayısı:   ${tempobetMatches.length}`);
  output.push(`Toplam canonical maç:  ${canonical.length}`);
  output.push(`3 sitede eşleşen:      ${threeSite.length}`);
  output.push(`2 sitede eşleşen:      ${twoSite.length}`);
  output.push(`Karşılaştırılabilir:   ${multiSite.length}`);
  output.push('');

  if (surebets.length > 0) {
    surebets.sort((a, b) => b.profit - a.profit);
    output.push(`🎯 SUREBET BULUNAN MAÇLAR: ${surebets.length}`);
    output.push('─'.repeat(66));
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
      for (const site of SITES) {
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

  if (almostSurebets.length > 0) {
    output.push(`\n⚠️  NEREDEYSE SUREBET (<3% margin): ${almostSurebets.length} maç`);
    output.push('─'.repeat(66));
    for (const s of almostSurebets.slice(0, 30)) {
      const marginPct = ((s.margin - 1) * 100).toFixed(2);
      output.push(`  ${s.home} vs ${s.away} (${s.league}) [${s.sites.join('+')}]`);
      for (const site of SITES) {
        if (s.odds[site]) {
          output.push(`    ${site}: ${s.odds[site].ms1.toFixed(2)} / ${s.odds[site].ms0.toFixed(2)} / ${s.odds[site].ms2.toFixed(2)}`);
        }
      }
      output.push(`    En iyi: ${s.best1.val.toFixed(2)}(${s.best1.src}) / ${s.bestX.val.toFixed(2)}(${s.bestX.src}) / ${s.best2.val.toFixed(2)}(${s.best2.src})  ─ margin: %${marginPct}`);
      output.push('');
    }
    if (almostSurebets.length > 30) output.push(`  ... ve ${almostSurebets.length - 30} maç daha`);
  }

  output.push('\n');
  output.push('═══ İSTATİSTİKLER ═══');
  const sorted = [...allComparisons].sort((a, b) => a.margin - b.margin);
  if (sorted.length > 0) {
    output.push(`En düşük margin: ${sorted[0].margin.toFixed(4)} (${sorted[0].home} vs ${sorted[0].away})`);
    output.push(`Ortalama margin: ${(allComparisons.reduce((s, c) => s + c.margin, 0) / allComparisons.length).toFixed(4)}`);
  }
  output.push(`Margin < 1.00 (surebet): ${surebets.length}`);
  output.push(`Margin < 1.03:           ${almostSurebets.length + surebets.length}`);
  output.push(`Margin < 1.05:           ${allComparisons.filter(c => c.margin < 1.05).length}`);

  output.push('\n═══ SİTE ÇİFTLERİ ANALİZİ ═══');
  const pairs = [['DUM', 'HOL'], ['DUM', 'TEM'], ['HOL', 'TEM']];
  for (const [s1, s2] of pairs) {
    const pm = allComparisons.filter(c => c.odds[s1] && c.odds[s2]);
    if (pm.length === 0) { output.push(`${s1}-${s2}: 0 eşleşme`); continue; }
    const pbm = pm.map(c => {
      const b1 = Math.max(c.odds[s1]?.ms1 || 0, c.odds[s2]?.ms1 || 0);
      const bX = Math.max(c.odds[s1]?.ms0 || 0, c.odds[s2]?.ms0 || 0);
      const b2 = Math.max(c.odds[s1]?.ms2 || 0, c.odds[s2]?.ms2 || 0);
      return 1 / b1 + 1 / bX + 1 / b2;
    }).sort((a, b) => a - b);
    output.push(`${s1}-${s2}: ${pm.length} eşleşme, ${pbm.filter(m => m < 1).length} surebet, en düşük margin: ${pbm[0]?.toFixed(4)}`);
  }

  output.push('\n═══ EN DÜŞÜK MARGİN TOP 15 ═══');
  for (const s of sorted.slice(0, 15)) {
    const ps = s.profit >= 0 ? `+%${s.profit.toFixed(2)}` : `%${s.profit.toFixed(2)}`;
    output.push(`  ${s.margin.toFixed(4)} (${ps}) │ ${s.home} vs ${s.away} [${s.sites.join('+')}]`);
    for (const site of SITES) {
      if (s.odds[site]) {
        output.push(`    ${site}: ${s.odds[site].ms1.toFixed(2)}/${s.odds[site].ms0.toFixed(2)}/${s.odds[site].ms2.toFixed(2)}`);
      }
    }
  }

  return {
    output: output.join('\n'),
    surebets, almostSurebets, allComparisons,
    stats: {
      dumanbetCount: dumanbetMatches.length,
      holiganCount: holiganMatches.length,
      tempobetCount: tempobetMatches.length,
      canonicalCount: canonical.length,
      threeSiteCount: threeSite.length,
      twoSiteCount: twoSite.length,
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
console.log('║  SUREBET REALTIME — 3 Site Anlık Çek + Analiz              ║');
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

console.log('═══ 3 SİTE PARALEL ÇEKİLİYOR ═══');

// 3 siteyi paralel çek
const [dumData, holData, temData] = await Promise.all([
  fetchDumanbet(context),
  fetchHoliganbet(context),
  fetchTempobet(context),
]);

const fetchElapsed = ((Date.now() - globalStart) / 1000).toFixed(0);

console.log(`\n${'═'.repeat(50)}`);
console.log(`  Veri çekimi tamamlandı (${fetchElapsed}s)`);
console.log(`  DUM: ${dumData.length} event`);
console.log(`  HOL: ${holData ? holData.matchCount : 0} maç`);
console.log(`  TEM: ${temData.length} maç`);
console.log(`${'═'.repeat(50)}`);

// Ham verileri kaydet
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (dumData.length > 0)
  fs.writeFileSync(`${OUTPUT_DIR}/digitain-football-all-events.json`, JSON.stringify(dumData, null, 2), 'utf8');
if (holData)
  fs.writeFileSync(`${OUTPUT_DIR}/holiganbet-prematch-raw.json`, JSON.stringify(holData, null, 2), 'utf8');
if (temData.length > 0)
  fs.writeFileSync(`${OUTPUT_DIR}/tempobet-football-raw.json`, JSON.stringify(temData, null, 2), 'utf8');
console.log('  Ham veriler artifacts/ klasörüne kaydedildi.\n');

// Surebet analizi
console.log('═══ SUREBET ANALİZİ BAŞLIYOR ═══\n');
const result = analyzeSurebets(dumData, holData, temData, fetchElapsed);

// Sonuçları yazdır
console.log(result.output);

// Dosyalara kaydet
fs.writeFileSync(`${OUTPUT_DIR}/surebet-analysis.txt`, result.output, 'utf8');
fs.writeFileSync(`${OUTPUT_DIR}/surebet-results.json`, JSON.stringify({
  surebets: result.surebets,
  almostSurebets: result.almostSurebets.slice(0, 50),
  stats: result.stats,
  top15: [...result.allComparisons].sort((a, b) => a.margin - b.margin).slice(0, 15),
  fetchTime: fetchElapsed,
  timestamp: new Date().toISOString(),
}, null, 2), 'utf8');

const totalElapsed = ((Date.now() - globalStart) / 1000).toFixed(0);
console.log(`\n→ artifacts/surebet-analysis.txt`);
console.log(`→ artifacts/surebet-results.json`);
console.log(`⏱  Toplam süre: ${totalElapsed}s (çekim: ${fetchElapsed}s)`);

// Chrome'u kapatma, sadece bağlantıyı kes
try { await browser.close(); } catch {}
