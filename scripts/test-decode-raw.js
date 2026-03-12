/**
 * Mevcut raw sport dosyasını offline XOR-decode test et.
 */
import fs from 'node:fs';

const MAX_HEADER = 20;

function autoDetectXorKey(buf) {
  for (let offset = 0; offset < Math.min(MAX_HEADER, buf.length - 2); offset++) {
    const b0 = buf[offset];
    const b1 = buf[offset + 1];
    const keyArr = b0 ^ 91;
    if (keyArr > 0 && (b1 ^ keyArr) === 123) return { key: keyArr, offset };
    const keyObj = b0 ^ 123;
    if (keyObj > 0 && (b1 ^ keyObj) === 34) return { key: keyObj, offset };
  }
  return null;
}

// Dosyayı oku (JSON string olarak saklanmış)
const rawStr = JSON.parse(fs.readFileSync('artifacts/digitain-prematch-raw-sport-1.json', 'utf8'));
console.log('Raw string length:', rawStr.length);
console.log('First 20 char codes:', [...rawStr.slice(0, 20)].map(c => c.charCodeAt(0)));

// Buffer'a çevir
const buf = Buffer.from(rawStr, 'utf8');
console.log('Buffer length:', buf.length);
console.log('First 20 bytes:', [...buf.slice(0, 20)]);

const detected = autoDetectXorKey(buf);
console.log('Detected:', detected);

if (detected) {
  const { key, offset } = detected;
  const decoded = Buffer.alloc(buf.length - offset);
  for (let i = 0; i < decoded.length; i++) decoded[i] = buf[i + offset] ^ key;
  const str = decoded.toString('utf8');
  console.log('\nDecoded first 300 chars:');
  console.log(str.slice(0, 300));

  try {
    const json = JSON.parse(str.trimEnd());
    console.log('\n✔ JSON parsed! Type:', typeof json, Array.isArray(json) ? 'array(' + json.length + ')' : '');
    if (Array.isArray(json) && json[0]) {
      console.log('First item keys:', Object.keys(json[0]));
      console.log('Sample:', JSON.stringify(json[0]).slice(0, 500));
    }
  } catch (e) {
    console.log('\n✘ JSON parse failed:', e.message.slice(0, 100));
    console.log('Last 20 chars:', str.slice(-20));
    console.log('Last 20 char codes:', [...str.slice(-20)].map(c => c.charCodeAt(0)));
  }
}
