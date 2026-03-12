import fs from 'fs';

const data = JSON.parse(fs.readFileSync('artifacts/digitain-football-all-events.json', 'utf8'));

const lines = [];
let noOdds = 0;
let outright = 0;

for (const ev of data) {
  // Outright (tek takım) etkinlikleri atla
  if (ev.IsOne || !ev.AT) { outright++; continue; }

  const ms = ev.StakeTypes?.find(st => st.Id === 1);
  if (!ms || !ms.Stakes?.length) { noOdds++; continue; }

  const s1 = ms.Stakes.find(s => s.N === '1');
  const sX = ms.Stakes.find(s => s.N === 'X');
  const s2 = ms.Stakes.find(s => s.N === '2');

  const home = ev.HT || '?';
  const away = ev.AT || '?';
  const league = ev._champName || ev.CN || '';
  const country = ev._countryName || ev.CtN || '';

  const f1 = s1?.F?.toFixed(2) ?? '-';
  const f0 = sX?.F?.toFixed(2) ?? '-';
  const f2 = s2?.F?.toFixed(2) ?? '-';

  lines.push({
    country,
    league,
    text: `${home} - ${away} | MS1: ${f1} | MS0: ${f0} | MS2: ${f2}`,
    date: ev.D,
  });
}

// Ülke ve lige göre grupla
const grouped = {};
for (const l of lines) {
  const key = `${l.country} > ${l.league}`;
  if (!grouped[key]) grouped[key] = [];
  grouped[key].push(l);
}

// Çıktı
const output = [];
output.push(`DUMANBET FUTBOL BÜLTENİ — ${new Date().toLocaleDateString('tr-TR')}`);
output.push(`Toplam: ${lines.length} maç (${Object.keys(grouped).length} lig)\n`);

for (const [league, matches] of Object.entries(grouped)) {
  output.push(`═══ ${league} ═══`);
  for (const m of matches) {
    output.push(`  ${m.text}`);
  }
  output.push('');
}

output.push(`\n--- Atlanılanlar: ${outright} outright, ${noOdds} oranlı bahis yok ---`);

const result = output.join('\n');

// Ekrana yaz
console.log(result);

// Dosyaya kaydet
fs.writeFileSync('artifacts/dumanbet-futbol-bulten.txt', result, 'utf8');
console.log('\n→ artifacts/dumanbet-futbol-bulten.txt');
