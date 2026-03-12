import { chromium } from 'playwright';
import fs from 'fs';

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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// =============================
// Test Meritwin Digitain API
// =============================
async function testMeritwin(context) {
  console.log('\n=== TESTING MERITWIN (Digitain) ===');
  const page = await context.newPage();
  const MER_URL = 'https://meritwin343.com/sports';
  const MER_BASE = 'https://sport.q1w2e3r4t5y6u7i8o9p0lkjhgfdsazxc.com';
  const MER_UUID = 'b3c8ac34-ac54-4861-bb9b-757dfcb43546';
  const MER_PARTNER = 882;

  try {
    await page.goto(MER_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for iframe
    let apiFrame = null;
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      apiFrame = page.frames().find(f => f.url().includes('Tools/RequestHelper'))
               || page.frames().find(f => f.url().includes('SportsBook'));
      if (apiFrame) break;
    }
    if (!apiFrame) throw new Error('iframe not found');
    console.log('  iframe found:', apiFrame.url().substring(0, 100));

    const apiBase = `${MER_BASE}/${MER_UUID}`;
    const qs = `langId=4&partnerId=${MER_PARTNER}&countryCode=TR`;

    // Test: Get countries
    const resp = await apiFrame.evaluate(async (u) => {
      const r = await fetch(u, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sportId: 1, timeFilter: 0 }),
      });
      const buf = await r.arrayBuffer();
      const bytes = new Uint8Array(buf); let s = '';
      for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      return { status: r.status, b64: btoa(s) };
    }, `${apiBase}/Prematch/GetCountryList?${qs}`);

    console.log('  Status:', resp.status);
    const data = parseDigitainResponse(resp.b64);
    if (data && Array.isArray(data)) {
      console.log(`  Countries: ${data.length}`);
      console.log('  Sample:', JSON.stringify(data.slice(0, 3)));
      
      // Test: get champs for first country
      if (data.length > 0) {
        const c = data[0];
        const resp2 = await apiFrame.evaluate(async ({u, body}) => {
          const r = await fetch(u, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const buf = await r.arrayBuffer();
          const bytes = new Uint8Array(buf); let s = '';
          for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
          return { status: r.status, b64: btoa(s) };
        }, { u: `${apiBase}/Prematch/GetChampsList?${qs}`, body: { sportId: 1, timeFilter: 0, countryId: c.Id } });
        
        const champs = parseDigitainResponse(resp2.b64);
        if (champs && Array.isArray(champs)) {
          console.log(`  Champs for ${c.N}: ${champs.length}`);
          console.log('  Sample champ:', JSON.stringify(champs.slice(0, 2)));
          
          // Test: get events for first champ
          if (champs.length > 0 && champs[0].EC > 0) {
            const ch = champs[0];
            const stqs = [1,702,3,2533,2,2532,313638,313639,37,402315].map(s => `stakeTypes=${s}`).join('&');
            const resp3 = await apiFrame.evaluate(async (u) => {
              const r = await fetch(u, { credentials: 'include' });
              const buf = await r.arrayBuffer();
              const bytes = new Uint8Array(buf); let s = '';
              for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
              return { status: r.status, b64: btoa(s) };
            }, `${apiBase}/prematch/geteventslist?champId=${ch.Id}&${stqs}&timeFilter=0&${qs}`);
            
            const events = parseDigitainResponse(resp3.b64);
            if (events && Array.isArray(events)) {
              console.log(`  Events for ${ch.N}: ${events.length}`);
              if (events[0]) {
                const ev = events[0];
                const ms = ev.StakeTypes?.find(st => st.Id === 1);
                const s1 = ms?.Stakes?.find(s => s.N === '1')?.F;
                const sX = ms?.Stakes?.find(s => s.N === 'X')?.F;
                const s2 = ms?.Stakes?.find(s => s.N === '2')?.F;
                console.log(`  Sample event: ${ev.HT} vs ${ev.AT} — MS: ${s1}/${sX}/${s2}`);
              }
            } else {
              console.log('  Events parse failed');
            }
          }
        }
      }
    } else {
      console.log('  Parse failed, raw length:', Buffer.from(resp.b64, 'base64').length);
    }
    
    await page.close();
    console.log('  ✔ Meritwin Digitain API works!');
  } catch (err) {
    console.error('  ✘ Error:', err.message);
    try { await page.close(); } catch {}
  }
}

// =============================
// Test Sekabet Swarm API
// =============================
async function testSekabet(context) {
  console.log('\n=== TESTING SEKABET (BetConstruct Swarm) ===');
  const page = await context.newPage();
  
  try {
    // Capture WebSocket
    let swarmWs = null;
    const swarmMessages = [];
    
    page.on('websocket', ws => {
      if (ws.url().includes('swarm')) {
        console.log('  Swarm WS found:', ws.url().substring(0, 100));
        swarmWs = ws;
        ws.on('framereceived', frame => {
          if (typeof frame.payload === 'string') {
            swarmMessages.push(JSON.parse(frame.payload));
          }
        });
      }
    });
    
    await page.goto('https://sekabett1521.com/bahis', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(15000);
    
    console.log(`  Received ${swarmMessages.length} Swarm messages`);
    
    // Find the frame with Swarm
    const sportFrame = page.frames().find(f => f.url().includes('mbcsport'));
    if (!sportFrame) throw new Error('Sport frame not found');
    console.log('  Sport frame:', sportFrame.url().substring(0, 100));
    
    // Try sending a Swarm request via the frame's WebSocket
    // Get prematch football games with odds
    const result = await sportFrame.evaluate(async () => {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket('wss://eu-swarm-newm.btcoservice29.com/');
        const responses = {};
        let sessionRid = 'sess_' + Date.now();
        let dataRid = 'data_' + Date.now();
        
        ws.onopen = () => {
          // Request session
          ws.send(JSON.stringify({
            command: 'request_session',
            params: {
              language: 'tur',
              site_id: 1329,
              source: 6,
            },
            rid: sessionRid
          }));
        };
        
        ws.onmessage = (e) => {
          const msg = JSON.parse(e.data);
          if (msg.rid === sessionRid) {
            // Session OK, now request football prematch data
            ws.send(JSON.stringify({
              command: 'get',
              params: {
                source: 'betting',
                what: {
                  sport: ['id', 'name'],
                  region: ['id', 'name'],
                  competition: ['id', 'name'],
                  game: ['id', 'start_ts', 'team1_name', 'team2_name', 'type', 'is_live'],
                  market: ['id', 'type', 'name', 'base'],
                  event: ['id', 'price', 'name', 'type_id', 'order']
                },
                where: {
                  sport: { id: 1 },
                  game: { type: 1 },
                  market: { type: { '@in': ['P1XP2', 'P1X2'] } }
                }
              },
              rid: dataRid
            }));
          }
          
          if (msg.rid === dataRid) {
            ws.close();
            resolve(msg);
          }
        };
        
        ws.onerror = (e) => reject(new Error('WS error'));
        setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 20000);
      });
    });
    
    // Analyze the result
    if (result && result.data && result.data.sport) {
      let gameCount = 0;
      const sampleGames = [];
      for (const [sid, sport] of Object.entries(result.data.sport)) {
        for (const [rid, region] of Object.entries(sport.region || {})) {
          for (const [cid, comp] of Object.entries(region.competition || {})) {
            for (const [gid, game] of Object.entries(comp.game || {})) {
              gameCount++;
              if (sampleGames.length < 5) {
                // Extract 1X2 odds
                let ms1 = null, msX = null, ms2 = null;
                for (const [mid, market] of Object.entries(game.market || {})) {
                  for (const [eid, ev] of Object.entries(market.event || {})) {
                    if (ev.type_id === 'P1' || ev.name === 'W1' || ev.name === '1') ms1 = ev.price;
                    if (ev.type_id === 'X' || ev.name === 'Draw' || ev.name === 'X') msX = ev.price;
                    if (ev.type_id === 'P2' || ev.name === 'W2' || ev.name === '2') ms2 = ev.price;
                  }
                }
                sampleGames.push({
                  home: game.team1_name, away: game.team2_name,
                  comp: comp.name, region: region.name,
                  ms1, msX, ms2
                });
              }
            }
          }
        }
      }
      console.log(`  Games found: ${gameCount}`);
      for (const g of sampleGames) {
        console.log(`    ${g.home} vs ${g.away} (${g.comp}) — ${g.ms1}/${g.msX}/${g.ms2}`);
      }
    } else {
      console.log('  Result structure:', JSON.stringify(result).substring(0, 500));
    }
    
    await page.close();
    console.log('  ✔ Sekabet Swarm API tested');
  } catch (err) {
    console.error('  ✘ Error:', err.message);
    try { await page.close(); } catch {}
  }
}

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  
  await testMeritwin(ctx);
  await testSekabet(ctx);
  
  try { await browser.close(); } catch {}
})().catch(console.error);
