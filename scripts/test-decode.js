import fs from 'node:fs';

const raw = fs.readFileSync('artifacts/digitain-sports.json', 'utf8');
const text = JSON.parse(raw); // stored as a JSON string

const buf = Buffer.from(text, 'binary');
const decoded = Buffer.alloc(buf.length);
for (let i = 0; i < buf.length; i++) decoded[i] = buf[i] ^ 0x0A;

const str = decoded.toString('utf8');
const start = str.search(/[\[{]/);
const json = JSON.parse(str.slice(start));

console.log(`Decoded ${json.length} sports:`);
json.forEach(s => console.log(`  - Id=${s.Id}, N="${s.N}", OC=${s.OC}`));
