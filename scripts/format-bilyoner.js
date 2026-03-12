import fs from 'fs';

const raw = JSON.parse(fs.readFileSync('artifacts/bilyoner-football-raw.json', 'utf8'));
const events = raw.events || {};

const lines = [];
let noOdds = 0;
let skipped = 0;

for (const [id, ev] of Object.entries(events)) {
  // E-Futbol ve sanal maçları atla
  if (ev.lgn && (ev.lgn.includes('E-Futbol') || ev.lgn.includes('Sanal'))) { skipped++; continue; }
  if (!ev.htn || !ev.atn) { skipped++; continue; }

  // İlk marketGroup = MS oranları
  const msGroup = ev.marketGroups?.[0];
  if (!msGroup || !msGroup.odds) { noOdds++; continue; }

  const ms1 = msGroup.odds.find(o => o.n === 'MS 1');
  const msX = msGroup.odds.find(o => o.n === 'MS X');
  const ms2 = msGroup.odds.find(o => o.n === 'MS 2');

  if (!ms1 || !msX || !ms2) { noOdds++; continue; }
  // Oran 0 ise pasif
  if (Number(ms1.val) === 0 && Number(msX.val) === 0 && Number(ms2.val) === 0) { noOdds++; continue; }

  const f1 = Number(ms1.val).toFixed(2);
  const f0 = Number(msX.val).toFixed(2);
  const f2 = Number(ms2.val).toFixed(2);

  lines.push({
    league: ev.lgn || '',
    home: ev.htn,
    away: ev.atn,
    text: `${ev.htn} - ${ev.atn} | MS1: ${f1} | MS0: ${f0} | MS2: ${f2}`,
    date: ev.esd,
    id: ev.id,
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
output.push(`BİLYONER FUTBOL BÜLTENİ — ${new Date().toLocaleDateString('tr-TR')}`);
output.push(`Toplam: ${lines.length} maç (${Object.keys(grouped).length} lig)\n`);

for (const [league, matches] of Object.entries(grouped)) {
  output.push(`═══ ${league} ═══`);
  for (const m of matches) {
    output.push(`  ${m.text}`);
  }
  output.push('');
}

output.push(`--- Atlanan: ${skipped} E-Futbol/sanal, ${noOdds} oranlı bahis yok ---`);

const result = output.join('\n');
console.log(result);

fs.writeFileSync('artifacts/bilyoner-futbol-bulten.txt', result, 'utf8');
console.log('\n→ artifacts/bilyoner-futbol-bulten.txt');
