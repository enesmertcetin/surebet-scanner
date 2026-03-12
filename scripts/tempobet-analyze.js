import fs from 'fs';

const html = fs.readFileSync('artifacts/tempobet-sport1.html', 'utf8');
console.log('HTML size:', html.length);

// Find table structure - look for tables containing match data
const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/g;
let tables = [];
let m;
while ((m = tableRegex.exec(html)) !== null) {
    tables.push({ index: m.index, content: m[0] });
}
console.log('\nTotal tables:', tables.length);

// Show first few tables
for (let i = 0; i < Math.min(3, tables.length); i++) {
    console.log(`\n=== TABLE ${i} (pos ${tables[i].index}) ===`);
    console.log(tables[i].content.substring(0, 1500));
}

// Find the structure around odds - look for data-odval
const oddRegex = /data-odval="([^"]+)"/g;
let odds = [];
while ((m = oddRegex.exec(html)) !== null) {
    odds.push({ val: m[1], pos: m.index });
}
console.log('\n\nTotal odds found:', odds.length);
console.log('First 10 odds:', odds.slice(0, 10).map(o => o.val));

// Find a region around first few odds to understand structure
if (odds.length > 0) {
    const firstOddPos = odds[0].pos;
    const context = html.substring(Math.max(0, firstOddPos - 2000), firstOddPos + 500);
    console.log('\n=== CONTEXT AROUND FIRST ODD ===');
    console.log(context);
}

// Look for team name patterns
const teamRegex = /<span[^>]*class="[^"]*team[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
let teams = [];
while ((m = teamRegex.exec(html)) !== null && teams.length < 20) {
    teams.push(m[1].trim().substring(0, 80));
}
console.log('\n\nTeam spans found:', teams.length);
teams.forEach(t => console.log(' -', t));

// Look for data-pnm attributes (possibly match/player names)
const pnmRegex = /data-pnm="([^"]+)"/g;
let pnms = [];
while ((m = pnmRegex.exec(html)) !== null && pnms.length < 20) {
    pnms.push(m[1]);
}
console.log('\n\ndata-pnm values:', pnms.length);
pnms.forEach(p => console.log(' -', p));

// Look for <tr> with match data
const trRegex = /<tr[^>]*class="[^"]*"[^>]*>([\s\S]*?)<\/tr>/g;
let trs = [];
while ((m = trRegex.exec(html)) !== null && trs.length < 5) {
    if (m[0].includes('data-odval')) {
        trs.push(m[0].substring(0, 2000));
    }
}
console.log('\n\nFirst TR rows with odds:');
trs.forEach((tr, i) => console.log(`\n--- TR ${i} ---\n`, tr));
