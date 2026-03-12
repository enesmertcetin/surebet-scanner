import { chromium } from 'playwright';
import fs from 'fs';

function xorDecodeBuffer(buf, key, offset) {
  const out = Buffer.alloc(buf.length - offset);
  for (let i = 0; i < out.length; i++) out[i] = buf[i + offset] ^ key;
  return out;
}

function autoDetectXorKey(buf) {
  for (let off = 0; off <= 20; off++) {
    for (const [b0, b1] of [[91,123],[123,34]]) {
      const key = buf[off] ^ b0;
      if (key >= 0 && key <= 255 && (buf[off+1] ^ key) === b1) {
        const decoded = xorDecodeBuffer(buf, key, off);
        const str = decoded.toString('utf8').replace(/[\x00-\x1F\x7F]/g, '');
        const re = /^\[?\{"\w+"/;
        if (re.test(str)) return { key, offset: off, str };
      }
    }
  }
  return null;
}

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const contexts = browser.contexts();
  const page = contexts[0].pages()[0];
  const apiFrame = page.frames().find(f => f.url().includes('Tools/RequestHelper'));
  
  if (!apiFrame) {
    console.log('RequestHelper frame bulunamadi!');
    console.log('Mevcut frameler:');
    page.frames().forEach((f,i) => console.log(`  [${i}] ${f.url().slice(0,120)}`));
    
    // Digitain frame'i bul ve RequestHelper'ı açmayı dene
    const digitainFrame = page.frames().find(f => f.url().includes('dmnppsportsdigi') && !f.url().includes('RequestHelper'));
    if (digitainFrame) {
      console.log('\nDigitain frame bulundu, 10sn bekleniyor...');
      await new Promise(r => setTimeout(r, 10000));
      const apiFrame2 = page.frames().find(f => f.url().includes('Tools/RequestHelper'));
      if (apiFrame2) {
        console.log('RequestHelper frame sonradan bulundu!');
      } else {
        console.log('Hala bulunamadı, çıkılıyor.');
        process.exit(1);
      }
    } else {
      process.exit(1);
    }
  }
  console.log('API frame bulundu\n');
  
  const apiBase = 'https://sport.dmnppsportsdigi.com/12dde6a1-36aa-4273-9140-9774eeb6c77b';
  const LANG = 4, PARTNER = 685, CC = 'TR';
  
  async function tryGet(ep) {
    const url = apiBase + '/' + ep + (ep.includes('?') ? '&' : '?') + 'langId=' + LANG + '&partnerId=' + PARTNER + '&countryCode=' + CC;
    try {
      const resp = await apiFrame.evaluate(async (u) => {
        const r = await fetch(u, { credentials: 'include' });
        const buf = await r.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return { status: r.status, b64: btoa(binary) };
      }, url);
      
      if (resp.status !== 200) return { status: resp.status };
      
      const raw = Buffer.from(resp.b64, 'base64');
      const result = autoDetectXorKey(raw);
      if (result) {
        const data = JSON.parse(result.str);
        return { status: 200, count: Array.isArray(data) ? data.length : 'object', sample: JSON.stringify(data).slice(0,400) };
      }
      return { status: 200, decoded: false, rawLen: raw.length };
    } catch (e) {
      return { error: e.message.slice(0,200) };
    }
  }
  
  // Şampiyona/bölge endpoint'lerini dene
  const endpoints = [
    'prematch/getchampionshipsbysportid?sportId=1&timeFilter=0',
    'prematch/getchampionships?sportId=1&timeFilter=0',
    'prematch/getregionsbysportid?sportId=1&timeFilter=0',
    'prematch/getregions?sportId=1&timeFilter=0',
    'prematch/getcompetitions?sportId=1&timeFilter=0',
    'prematch/getleagues?sportId=1&timeFilter=0',
    'prematch/getsportchampionships?sportId=1&timeFilter=0',
    'prematch/geteventscount?sportId=1&timeFilter=0',
    'prematch/geteventslist?sportId=1&timeFilter=0',
    'prematch/getallsportevents?sportId=1',
  ];
  
  for (const ep of endpoints) {
    const name = ep.split('?')[0];
    console.log(name + ':');
    const r = await tryGet(ep);
    console.log('  ' + JSON.stringify(r).slice(0,300) + '\n');
  }
  
  browser.disconnect();
  process.exit(0);
})();
