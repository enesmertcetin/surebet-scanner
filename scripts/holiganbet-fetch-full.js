/**
 * Holiganbet - TÜM prematch futbol maçlarını çek
 * 1) Locations listesini al
 * 2) Her location için tournaments listesini al
 * 3) Her tournament için matches + odds çek
 */
import { chromium } from 'playwright';
import fs from 'fs';

async function main() {
  console.log('Chrome CDP bağlanıyor...');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0] || await browser.newContext();
  
  // Var olan holiganbet sayfasını kullan, yoksa yeni aç
  let page = ctx.pages().find(p => p.url().includes('holiganbet'));
  if (page) {
    console.log('Mevcut holiganbet sayfası kullanılıyor:', page.url().substring(0, 80));
  } else {
    page = await ctx.newPage();
    const FOOTBALL_URL = 'https://www.holiganbet10214.com/tr/sports/i/spor/futbol/1/t%C3%BCm%C3%BC/0/lokasyon';
    console.log('Sayfaya gidiliyor...');
    await page.goto(FOOTBALL_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(8000);
  }

  const sportFrame = page.frames().find(f => f.url().includes('sports2.'));
  if (!sportFrame) { console.log('Sport frame bulunamadı!'); return; }

  console.log('iframe bulundu, WAMP bağlantısı kuruluyor...\n');

  const allData = await sportFrame.evaluate(async () => {
    return new Promise((mainResolve) => {
      const ws = new WebSocket('wss://sportsapi.holiganbet10214.com/v2', ['wamp.2.json']);
      let reqId = 0;
      const pending = {};

      function call(procedure, kwargs) {
        return new Promise((res, rej) => {
          reqId++;
          pending[reqId] = { res, rej };
          ws.send(JSON.stringify([48, reqId, {}, procedure, [], kwargs || {}]));
          // 15 sn timeout per call
          setTimeout(() => { if (pending[reqId]) { pending[reqId].rej(new Error('timeout')); delete pending[reqId]; } }, 15000);
        });
      }

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg[0] === 50 && pending[msg[1]]) {
            pending[msg[1]].res(msg[4]);
            delete pending[msg[1]];
          } else if (msg[0] === 8 && pending[msg[2]]) {
            pending[msg[2]].rej(new Error(JSON.stringify(msg)));
            delete pending[msg[2]];
          }
        } catch {}
      };

      ws.onerror = () => mainResolve({ error: 'WS error' });

      const timeout = setTimeout(() => { ws.close(); mainResolve({ error: 'global timeout' }); }, 180000);

      ws.onopen = async () => {
        ws.send(JSON.stringify([1, "http://www.holiganbet.com", {
          "agent": "Surebet/1.0",
          "roles": {
            "subscriber": { "features": {} },
            "caller": { "features": { "caller_identification": true, "progressive_call_results": true } }
          }
        }]));

        // WELCOME bekle
        await new Promise(r => {
          const orig = ws.onmessage;
          ws.onmessage = (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg[0] === 2) { ws.onmessage = orig; r(); }
          };
        });

        try {
          // 1) Tüm ülke/lokasyonları al
          const locData = await call("/sports#initialDump", {
            topic: "/sports/2218/tr/locations/1/NOT_LIVE/BOTH"
          });
          
          const locations = locData?.records?.filter(r => 
            r._type === 'LOCATION' && r.numberOfUpcomingMatches > 0
          ) || [];

          // 2) Her lokasyon için turnuvalarını al
          const allTournaments = [];
          const batchSize = 10;
          
          for (let i = 0; i < locations.length; i += batchSize) {
            const batch = locations.slice(i, i + batchSize);
            const promises = batch.map(loc => 
              call("/sports#initialDump", {
                topic: `/sports/2218/tr/tournaments/1/${loc.id}`
              }).catch(() => null)
            );
            const results = await Promise.all(promises);
            for (const r of results) {
              if (!r?.records) continue;
              for (const rec of r.records) {
                if (rec._type === 'TOURNAMENT' && rec.numberOfUpcomingMatches > 0) {
                  allTournaments.push(rec);
                }
              }
            }
          }

          // Duplicate olmayan turnuvalar
          const seen = new Set();
          const uniqueTournaments = allTournaments.filter(t => {
            if (seen.has(t.id)) return false;
            seen.add(t.id);
            return true;
          });

          const totalUpcoming = uniqueTournaments.reduce((s, t) => s + t.numberOfUpcomingMatches, 0);

          // 3) Her turnuva için maç + odds çek
          const allMatches = [];
          const allBettingOffers = [];
          const allOutcomes = [];
          const allMarkets = [];
          
          for (let i = 0; i < uniqueTournaments.length; i += batchSize) {
            const batch = uniqueTournaments.slice(i, i + batchSize);
            const promises = batch.map(t =>
              call("/sports#initialDump", {
                topic: `/sports/2218/tr/tournament-aggregator-groups-overview/${t.id}/default-event-info/NOT_LIVE/2258`
              }).catch(() => null)
            );
            const results = await Promise.all(promises);
            for (const r of results) {
              if (!r?.records) continue;
              for (const rec of r.records) {
                if (rec._type === 'MATCH') allMatches.push(rec);
                else if (rec._type === 'BETTING_OFFER') allBettingOffers.push(rec);
                else if (rec._type === 'OUTCOME') allOutcomes.push(rec);
                else if (rec._type === 'MARKET') allMarkets.push(rec);
              }
            }
          }

          clearTimeout(timeout);
          ws.close();

          mainResolve({
            locationCount: locations.length,
            tournamentCount: uniqueTournaments.length,
            expectedUpcoming: totalUpcoming,
            matchCount: allMatches.length,
            bettingOfferCount: allBettingOffers.length,
            outcomeCount: allOutcomes.length,
            marketCount: allMarkets.length,
            matches: allMatches,
            bettingOffers: allBettingOffers,
            outcomes: allOutcomes,
            markets: allMarkets,
          });
        } catch (e) {
          clearTimeout(timeout);
          ws.close();
          mainResolve({ error: e.message });
        }
      };
    });
  });

  console.log('═══ Sonuçlar ═══');
  console.log(`Lokasyonlar: ${allData.locationCount}`);
  console.log(`Turnuvalar: ${allData.tournamentCount}`);
  console.log(`Beklenen upcoming: ${allData.expectedUpcoming}`);
  console.log(`Maç: ${allData.matchCount}`);
  console.log(`BettingOffer: ${allData.bettingOfferCount}`);
  console.log(`Outcome: ${allData.outcomeCount}`);
  console.log(`Market: ${allData.marketCount}`);

  if (allData.error) console.log('Hata:', allData.error);

  if (allData.matchCount > 0) {
    fs.writeFileSync('artifacts/holiganbet-prematch-raw.json', JSON.stringify(allData, null, 2), 'utf8');
    console.log(`\n→ artifacts/holiganbet-prematch-raw.json (${(JSON.stringify(allData).length / 1024 / 1024).toFixed(1)} MB)`);
    
    // İlk 5 maçı göster
    for (const m of allData.matches.slice(0, 5)) {
      const outs = allData.outcomes.filter(o => o.eventId === m.id);
      const odds = {};
      for (const o of outs) {
        const bo = allData.bettingOffers.find(b => b.outcomeId === o.id);
        if (bo) odds[o.headerNameKey] = bo.odds;
      }
      console.log(`  ${m.homeParticipantName} vs ${m.awayParticipantName} | ${m.shortParentName} | MS1:${odds.home?.toFixed(2)} MSX:${odds.draw?.toFixed(2)} MS2:${odds.away?.toFixed(2)}`);
    }
  }

  // Mevcut sayfayı kapatmıyoruz
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
