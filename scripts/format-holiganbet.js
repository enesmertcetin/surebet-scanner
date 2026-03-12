import fs from 'fs';

const raw = JSON.parse(fs.readFileSync('artifacts/holiganbet-prematch-raw.json', 'utf8'));

const { matches, outcomes, bettingOffers } = raw;

// Outcome ve BO index'lerini oluştur (hız için)
const outcomesByEvent = {};
for (const o of outcomes) {
  if (!outcomesByEvent[o.eventId]) outcomesByEvent[o.eventId] = [];
  outcomesByEvent[o.eventId].push(o);
}

const boByOutcome = {};
for (const bo of bettingOffers) {
  boByOutcome[bo.outcomeId] = bo;
}

const lines = [];
let noOdds = 0;

for (const m of matches) {
  if (!m.homeParticipantName || !m.awayParticipantName) { noOdds++; continue; }

  const outs = outcomesByEvent[m.id] || [];
  const homeOut = outs.find(o => o.headerNameKey === 'home');
  const drawOut = outs.find(o => o.headerNameKey === 'draw');
  const awayOut = outs.find(o => o.headerNameKey === 'away');

  if (!homeOut || !drawOut || !awayOut) { noOdds++; continue; }

  const homeBo = boByOutcome[homeOut.id];
  const drawBo = boByOutcome[drawOut.id];
  const awayBo = boByOutcome[awayOut.id];

  if (!homeBo || !drawBo || !awayBo) { noOdds++; continue; }
  if (homeBo.odds === 0 && drawBo.odds === 0 && awayBo.odds === 0) { noOdds++; continue; }

  const f1 = Number(homeBo.odds).toFixed(2);
  const f0 = Number(drawBo.odds).toFixed(2);
  const f2 = Number(awayBo.odds).toFixed(2);

  lines.push({
    league: m.shortParentName || m.parentName || '',
    home: m.homeParticipantName,
    away: m.awayParticipantName,
    text: `${m.homeParticipantName} - ${m.awayParticipantName} | MS1: ${f1} | MS0: ${f0} | MS2: ${f2}`,
    startTime: m.startTime,
    id: m.id,
  });
}

// Lige göre grupla
const grouped = {};
for (const l of lines) {
  if (!grouped[l.league]) grouped[l.league] = [];
  grouped[l.league].push(l);
}

// Çıktı
const output = [];
output.push(`HOLİGANBET FUTBOL BÜLTENİ — ${new Date().toLocaleDateString('tr-TR')}`);
output.push(`Toplam: ${lines.length} maç (${Object.keys(grouped).length} lig)\n`);

for (const [league, lgMatches] of Object.entries(grouped)) {
  output.push(`═══ ${league} ═══`);
  for (const m of lgMatches) {
    output.push(`  ${m.text}`);
  }
  output.push('');
}

output.push(`--- Oran bulunamayan: ${noOdds} maç ---`);

const result = output.join('\n');
console.log(result.substring(0, 3000) + '\n...');

fs.writeFileSync('artifacts/holiganbet-futbol-bulten.txt', result, 'utf8');
console.log(`\n→ artifacts/holiganbet-futbol-bulten.txt (${lines.length} maç)`);
