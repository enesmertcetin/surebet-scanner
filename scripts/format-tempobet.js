import fs from 'fs';

const raw = JSON.parse(fs.readFileSync('artifacts/tempobet-football-raw.json', 'utf8'));

console.log(`Toplam maç: ${raw.length}`);
console.log(`Canlı: ${raw.filter(m => m.isLive).length}`);
console.log(`Prematch: ${raw.filter(m => !m.isLive).length}`);

const lines = [];
let noOdds = 0;

for (const m of raw) {
  if (!m.home || !m.away) { noOdds++; continue; }
  if (m.odds1 == null || m.oddsX == null || m.odds2 == null) { noOdds++; continue; }
  if (m.odds1 === 0 && m.oddsX === 0 && m.odds2 === 0) { noOdds++; continue; }

  const f1 = Number(m.odds1).toFixed(2);
  const f0 = Number(m.oddsX).toFixed(2);
  const f2 = Number(m.odds2).toFixed(2);

  const leagueKey = m.league ? `${m.country} > ${m.league}` : m.country;

  lines.push({
    league: leagueKey,
    home: m.home,
    away: m.away,
    text: `${m.home} - ${m.away} | MS1: ${f1} | MS0: ${f0} | MS2: ${f2}`,
    date: m.date || '',
    time: m.time || '',
    isLive: m.isLive,
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
output.push(`TEMPOBET FUTBOL BÜLTENİ — ${new Date().toLocaleDateString('tr-TR')}`);
output.push(`Toplam: ${lines.length} maç (${Object.keys(grouped).length} lig)\n`);

for (const [league, lgMatches] of Object.entries(grouped)) {
  output.push(`═══ ${league} ═══`);
  for (const m of lgMatches) {
    const prefix = m.isLive ? '[CANLI] ' : '';
    output.push(`  ${prefix}${m.text}`);
  }
  output.push('');
}

output.push(`--- Oran bulunamayan: ${noOdds} maç ---`);

const result = output.join('\n');
console.log(result.substring(0, 3000) + '\n...');

fs.writeFileSync('artifacts/tempobet-futbol-bulten.txt', result, 'utf8');
console.log(`\n→ artifacts/tempobet-futbol-bulten.txt (${lines.length} maç)`);
