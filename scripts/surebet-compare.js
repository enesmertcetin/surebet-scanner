/**
 * Surebet Karşılaştırma: Dumanbet vs Holiganbet vs Tempobet (3-Site, Sadece Prematch)
 * 
 * Surebet formülü: 1/best(MS1) + 1/best(MSX) + 1/best(MS2) < 1
 */

import fs from 'fs';

const t0 = performance.now();

// ─── Veri Yükleme ─────────────────────────────────────────────
const dumanbet = JSON.parse(fs.readFileSync('artifacts/digitain-football-all-events.json', 'utf8'));
const holiganRaw = JSON.parse(fs.readFileSync('artifacts/holiganbet-prematch-raw.json', 'utf8'));
const tempobetRaw = JSON.parse(fs.readFileSync('artifacts/tempobet-football-raw.json', 'utf8'));

// ─── Normalizasyon ────────────────────────────────────────────

function normalizeName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/\./g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\bfc\b/g, '')
    .replace(/\bsk\b/g, '')
    .replace(/\bfk\b/g, '')
    .replace(/\bsc\b/g, '')
    .replace(/\bac\b/g, '')
    .replace(/\bas\b/g, '')
    .replace(/\bssc\b/g, '')
    .replace(/\bcf\b/g, '')
    .replace(/\baf\b/g, '')
    .replace(/\butd\b/g, 'united')
    .replace(/\bunited\b/g, 'united')
    .replace(/\bcity\b/g, 'city')
    .replace(/\bsporting\b/g, 'sporting')
    .replace(/\breal\b/g, 'real')
    .replace(/\batletico\b/g, 'atletico')
    .replace(/\batlético\b/g, 'atletico')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ş/g, 's')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/İ/g, 'i')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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
  const aMap = bigrams(a);
  const bMap = bigrams(b);
  let intersection = 0;
  for (const [bi, count] of aMap) {
    if (bMap.has(bi)) intersection += Math.min(count, bMap.get(bi));
  }
  return (2 * intersection) / (a.length - 1 + b.length - 1);
}

function teamsMatch(name1, name2, threshold = 0.65) {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);
  if (n1 === n2) return true;
  if (n1.includes(n2) || n2.includes(n1)) return true;
  const t1 = n1.split(' ').filter(Boolean);
  const t2 = n2.split(' ').filter(Boolean);
  if (t1[0]?.length >= 3 && t2[0]?.length >= 3 && t1[0] === t2[0]) return true;
  return similarity(n1, n2) >= threshold;
}

// ─── Dumanbet Maçları ─────────────────────────────────────────

const dumanbetMatches = [];
for (const ev of dumanbet) {
  if (ev.IsOne || !ev.AT) continue;
  if (ev.IsLive) continue;
  const ms = ev.StakeTypes?.find(st => st.Id === 1);
  if (!ms || !ms.Stakes?.length) continue;
  const s1 = ms.Stakes.find(s => s.N === '1');
  const sX = ms.Stakes.find(s => s.N === 'X');
  const s2 = ms.Stakes.find(s => s.N === '2');
  if (!s1?.F || !sX?.F || !s2?.F) continue;
  dumanbetMatches.push({
    home: ev.HT, away: ev.AT,
    league: ev._champName || '', country: ev._countryName || '',
    ms1: s1.F, ms0: sX.F, ms2: s2.F,
  });
}

// ─── Holiganbet Maçları ───────────────────────────────────────

const holiganMatches = [];
{
  const { matches, outcomes, bettingOffers } = holiganRaw;
  const outcomesByEvent = {};
  for (const o of outcomes) {
    if (!outcomesByEvent[o.eventId]) outcomesByEvent[o.eventId] = [];
    outcomesByEvent[o.eventId].push(o);
  }
  const boByOutcome = {};
  for (const bo of bettingOffers) {
    boByOutcome[bo.outcomeId] = bo;
  }
  for (const m of matches) {
    if (!m.homeParticipantName || !m.awayParticipantName) continue;
    const outs = outcomesByEvent[m.id] || [];
    const homeOut = outs.find(o => o.headerNameKey === 'home');
    const drawOut = outs.find(o => o.headerNameKey === 'draw');
    const awayOut = outs.find(o => o.headerNameKey === 'away');
    if (!homeOut || !drawOut || !awayOut) continue;
    const homeBo = boByOutcome[homeOut.id];
    const drawBo = boByOutcome[drawOut.id];
    const awayBo = boByOutcome[awayOut.id];
    if (!homeBo || !drawBo || !awayBo) continue;
    if (homeBo.odds === 0 && drawBo.odds === 0 && awayBo.odds === 0) continue;
    holiganMatches.push({
      home: m.homeParticipantName, away: m.awayParticipantName,
      league: m.shortParentName || m.parentName || '',
      ms1: homeBo.odds, ms0: drawBo.odds, ms2: awayBo.odds,
    });
  }
}

// ─── Tempobet Maçları (sadece prematch) ───────────────────────

const tempobetMatches = [];
for (const m of tempobetRaw) {
  if (!m.home || !m.away) continue;
  if (m.isLive) continue;
  if (m.odds1 == null || m.oddsX == null || m.odds2 == null) continue;
  const v1 = Number(m.odds1), vX = Number(m.oddsX), v2 = Number(m.odds2);
  if (v1 === 0 || vX === 0 || v2 === 0) continue;
  tempobetMatches.push({
    home: m.home, away: m.away,
    league: m.league || '', country: m.country || '',
    ms1: v1, ms0: vX, ms2: v2,
  });
}

console.log(`Dumanbet:   ${dumanbetMatches.length} maç (prematch)`);
console.log(`Holiganbet: ${holiganMatches.length} maç (prematch)`);
console.log(`Tempobet:   ${tempobetMatches.length} maç (prematch)`);

// ─── Eşleştirme ──────────────────────────────────────────────

const SITES = ['DUM', 'HOL', 'TEM'];

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
const usedHOL = new Set();
const usedTEM = new Set();

// DUM referans
for (const dm of pools.DUM) {
  const entry = {
    home: dm.home, away: dm.away, league: dm.league || dm.country,
    odds: { DUM: { ms1: dm.ms1, ms0: dm.ms0, ms2: dm.ms2 } },
    siteCount: 1, sites: ['DUM'],
  };
  const holMatch = findBestMatch(dm, pools.HOL, usedHOL);
  if (holMatch) {
    usedHOL.add(holMatch._idx);
    entry.odds.HOL = { ms1: holMatch.ms1, ms0: holMatch.ms0, ms2: holMatch.ms2 };
    entry.siteCount++; entry.sites.push('HOL');
  }
  const temMatch = findBestMatch(dm, pools.TEM, usedTEM);
  if (temMatch) {
    usedTEM.add(temMatch._idx);
    entry.odds.TEM = { ms1: temMatch.ms1, ms0: temMatch.ms0, ms2: temMatch.ms2 };
    entry.siteCount++; entry.sites.push('TEM');
  }
  canonical.push(entry);
}

// HOL'de olup DUM'da olmayan
for (const hm of pools.HOL) {
  if (usedHOL.has(hm._idx)) continue;
  const entry = {
    home: hm.home, away: hm.away, league: hm.league,
    odds: { HOL: { ms1: hm.ms1, ms0: hm.ms0, ms2: hm.ms2 } },
    siteCount: 1, sites: ['HOL'],
  };
  usedHOL.add(hm._idx);
  const temMatch = findBestMatch(hm, pools.TEM, usedTEM);
  if (temMatch) {
    usedTEM.add(temMatch._idx);
    entry.odds.TEM = { ms1: temMatch.ms1, ms0: temMatch.ms0, ms2: temMatch.ms2 };
    entry.siteCount++; entry.sites.push('TEM');
  }
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

console.log(`\nCanonical: ${canonical.length} | 3 site: ${threeSite.length} | 2 site: ${twoSite.length} | Tek: ${canonical.length - multiSite.length}`);

// ─── Surebet Hesaplama ───────────────────────────────────────

const surebets = [];
const allComparisons = [];

for (const c of multiSite) {
  let best1 = { val: 0, src: '' };
  let bestX = { val: 0, src: '' };
  let best2 = { val: 0, src: '' };
  for (const site of SITES) {
    const o = c.odds[site];
    if (!o) continue;
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

const elapsed = ((performance.now() - t0) / 1000).toFixed(2);

// ─── Çıktı ───────────────────────────────────────────────────

const almostSurebets = allComparisons
  .filter(c => c.margin < 1.03 && c.margin >= 1)
  .sort((a, b) => a.margin - b.margin);

const output = [];
output.push('╔══════════════════════════════════════════════════════════════════╗');
output.push('║   SUREBET ANALİZİ: DUMANBET vs HOLİGANBET vs TEMPOBET         ║');
output.push('║   Sadece Prematch — Canlı maçlar hariç                         ║');
output.push(`║   ${new Date().toLocaleString('tr-TR').padEnd(58)}║`);
output.push(`║   Analiz süresi: ${elapsed}s${' '.repeat(Math.max(0, 44 - elapsed.length))}║`);
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

const KASA = 1000;

if (surebets.length > 0) {
  surebets.sort((a, b) => b.profit - a.profit);
  output.push(`🎯 SUREBET BULUNAN MAÇLAR: ${surebets.length}`);
  output.push('─'.repeat(66));
  for (const s of surebets) {
    const p1 = 1 / s.best1.val;
    const pX = 1 / s.bestX.val;
    const p2 = 1 / s.best2.val;
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
  if (almostSurebets.length > 30) {
    output.push(`  ... ve ${almostSurebets.length - 30} maç daha`);
  }
}

output.push('\n');
output.push('═══ İSTATİSTİKLER ═══');
const sorted = [...allComparisons].sort((a, b) => a.margin - b.margin);
output.push(`En düşük margin: ${sorted[0]?.margin.toFixed(4)} (${sorted[0]?.home} vs ${sorted[0]?.away})`);
output.push(`Ortalama margin: ${(allComparisons.reduce((s, c) => s + c.margin, 0) / allComparisons.length).toFixed(4)}`);
output.push(`Margin < 1.00 (surebet): ${surebets.length}`);
output.push(`Margin < 1.03:           ${almostSurebets.length + surebets.length}`);
output.push(`Margin < 1.05:           ${allComparisons.filter(c => c.margin < 1.05).length}`);

output.push('\n═══ SİTE ÇİFTLERİ ANALİZİ ═══');
const pairs = [['DUM','HOL'], ['DUM','TEM'], ['HOL','TEM']];
for (const [s1, s2] of pairs) {
  const pairMatches = allComparisons.filter(c => c.odds[s1] && c.odds[s2]);
  if (pairMatches.length === 0) { output.push(`${s1}-${s2}: 0 eşleşme`); continue; }
  const pairBestMargins = pairMatches.map(c => {
    const best1v = Math.max(c.odds[s1]?.ms1 || 0, c.odds[s2]?.ms1 || 0);
    const bestXv = Math.max(c.odds[s1]?.ms0 || 0, c.odds[s2]?.ms0 || 0);
    const best2v = Math.max(c.odds[s1]?.ms2 || 0, c.odds[s2]?.ms2 || 0);
    return 1/best1v + 1/bestXv + 1/best2v;
  }).sort((a,b) => a-b);
  const pairSurebetCount = pairBestMargins.filter(m => m < 1).length;
  output.push(`${s1}-${s2}: ${pairMatches.length} eşleşme, ${pairSurebetCount} surebet, en düşük margin: ${pairBestMargins[0]?.toFixed(4)}`);
}

output.push('\n═══ EN DÜŞÜK MARGİN TOP 15 ═══');
for (const s of sorted.slice(0, 15)) {
  const profitStr = s.profit >= 0 ? `+%${s.profit.toFixed(2)}` : `%${s.profit.toFixed(2)}`;
  output.push(`  ${s.margin.toFixed(4)} (${profitStr}) │ ${s.home} vs ${s.away} [${s.sites.join('+')}]`);
  for (const site of SITES) {
    if (s.odds[site]) {
      output.push(`    ${site}: ${s.odds[site].ms1.toFixed(2)}/${s.odds[site].ms0.toFixed(2)}/${s.odds[site].ms2.toFixed(2)}`);
    }
  }
}

const result = output.join('\n');
console.log(result);

fs.writeFileSync('artifacts/surebet-analysis.txt', result, 'utf8');
fs.writeFileSync('artifacts/surebet-results.json', JSON.stringify({
  surebets,
  almostSurebets: almostSurebets.slice(0, 50),
  stats: {
    dumanbetCount: dumanbetMatches.length,
    holiganCount: holiganMatches.length,
    tempobetCount: tempobetMatches.length,
    canonicalCount: canonical.length,
    threeSiteCount: threeSite.length,
    twoSiteCount: twoSite.length,
    multiSiteCount: multiSite.length,
    surebetCount: surebets.length,
    avgMargin: allComparisons.reduce((s, c) => s + c.margin, 0) / allComparisons.length,
    lowestMargin: sorted[0]?.margin,
    elapsed,
  },
  top15: sorted.slice(0, 15),
}, null, 2), 'utf8');

console.log(`\n→ artifacts/surebet-analysis.txt`);
console.log(`→ artifacts/surebet-results.json`);
console.log(`⏱  Toplam süre: ${elapsed}s`);
