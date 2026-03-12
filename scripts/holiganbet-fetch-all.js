/**
 * Holiganbet - Tüm prematch futbol maçlarını WAMP WS üzerinden çek
 * 
 * Strateji:
 * 1) WS bağlan → WAMP HELLO
 * 2) Tüm turnuvaları al (initialDump custom-events)
 * 3) Her turnuva için tournament-aggregator çağrısı yap
 * 4) MATCH ve BETTING_OFFER kayıtlarını topla
 */
import { chromium } from 'playwright';
import fs from 'fs';

async function main() {
  console.log('Chrome CDP bağlanıyor...');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0] || await browser.newContext();
  const page = await ctx.newPage();

  // Sayfa context'inden WAMP bağlantısı kurmam lazım
  // En iyi yol: iframe'in kendi WAMP bağlantısını kullanmak
  const FOOTBALL_URL = 'https://www.holiganbet10214.com/tr/sports/i/spor/futbol/1/t%C3%BCm%C3%BC/0/lokasyon';
  console.log('Sayfaya gidiliyor...');
  await page.goto(FOOTBALL_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(8000);

  const sportFrame = page.frames().find(f => f.url().includes('sports2.'));
  if (!sportFrame) { console.log('Sport frame bulunamadı!'); return; }

  console.log('Sport frame bulundu, WAMP RPC çağrıları yapılıyor...');

  // iframe'in WAMP bağlantısını kullanarak RPC çağrısı yap
  // omWebapiWampy objesini kullanarak
  const result = await sportFrame.evaluate(async () => {
    // wampy bağlantısını bul  
    const wampy = window.omWebapiWampy;
    if (!wampy) {
      // Alternatif: store'dan wampy referansını bul
      // veya doğrudan yeni WebSocket aç
      return { error: 'wampy bulunamadı, WebSocket ile deneyelim' };
    }
    return { wampyKeys: Object.getOwnPropertyNames(Object.getPrototypeOf(wampy)) };
  });
  
  console.log('Wampy durumu:', JSON.stringify(result));

  // Alternatif yaklaşım: iframe içinden yeni bir WebSocket bağlantısı kurup
  // WAMP protokolü ile haberleşelim
  console.log('\niframe içinden WAMP WS bağlantısı kuruluyor...');
  
  const allData = await sportFrame.evaluate(async () => {
    return new Promise((resolve) => {
      const ws = new WebSocket('wss://sportsapi.holiganbet10214.com/v2', ['wamp.2.json']);
      const results = {};
      let reqId = 0;
      const pendingCalls = {};
      let welcomeReceived = false;
      const callQueue = [];

      function sendRPC(procedure, kwargs) {
        reqId++;
        const id = reqId;
        return new Promise((res, rej) => {
          pendingCalls[id] = { res, rej };
          const msg = JSON.stringify([48, id, {}, procedure, [], kwargs || {}]);
          if (welcomeReceived) {
            ws.send(msg);
          } else {
            callQueue.push(msg);
          }
        });
      }

      ws.onopen = () => {
        // WAMP HELLO
        ws.send(JSON.stringify([1, "http://www.holiganbet.com", {
          "agent": "Wampy.js v6.2.2",
          "roles": {
            "publisher": { "features": { "subscriber_blackwhite_listing": true, "publisher_exclusion": true, "publisher_identification": true } },
            "subscriber": { "features": { "pattern_based_subscription": true, "publication_trustlevels": true } },
            "caller": { "features": { "caller_identification": true, "progressive_call_results": true } },
            "callee": { "features": { "caller_identification": true, "pattern_based_registration": true, "shared_registration": true, "progressive_call_results": true, "registration_revocation": true } }
          }
        }]));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const type = msg[0];
          
          if (type === 2) {
            // WELCOME
            welcomeReceived = true;
            // Kuyrukta bekleyen çağrıları gönder
            for (const m of callQueue) ws.send(m);
            callQueue.length = 0;
          } else if (type === 50) {
            // RESULT
            const callId = msg[1];
            if (pendingCalls[callId]) {
              pendingCalls[callId].res(msg[4]);
              delete pendingCalls[callId];
            }
          } else if (type === 8) {
            // ERROR
            const callId = msg[2];
            if (pendingCalls[callId]) {
              pendingCalls[callId].rej(new Error(JSON.stringify(msg)));
              delete pendingCalls[callId];
            }
          }
        } catch (e) {}
      };

      ws.onerror = () => resolve({ error: 'WS error' });

      // 60 saniye timeout
      const timeout = setTimeout(() => {
        ws.close();
        resolve(results);
      }, 60000);

      // Bağlantı açıldığında çalışacak async akış
      ws.onopen = async function() {
        // WAMP HELLO
        ws.send(JSON.stringify([1, "http://www.holiganbet.com", {
          "agent": "Wampy.js v6.2.2",
          "roles": {
            "publisher": { "features": {} },
            "subscriber": { "features": {} },
            "caller": { "features": { "caller_identification": true, "progressive_call_results": true } },
            "callee": { "features": {} }
          }
        }]));

        // WELCOME bekle
        await new Promise(r => {
          const origHandler = ws.onmessage;
          ws.onmessage = (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg[0] === 2) {
              welcomeReceived = true;
              ws.onmessage = origHandler;
              r();
            }
          };
        });

        try {
          // 1) Tüm turnuvaları al
          const tournamentsData = await sendRPC("/sports#initialDump", {
            "topic": "/sports/2218/tr/custom-events"
          });
          
          const tournaments = tournamentsData?.records?.filter(r => 
            r._type === 'TOURNAMENT' && r.sportId === '1' && r.numberOfUpcomingMatches > 0
          ) || [];
          
          results.tournamentCount = tournaments.length;
          results.totalUpcoming = tournaments.reduce((s, t) => s + t.numberOfUpcomingMatches, 0);
          results.tournamentNames = tournaments.slice(0, 10).map(t => t.translatedName + ' (' + t.numberOfUpcomingMatches + ')');
          
          // 2) Her turnuva için maç verilerini çek (batch olarak, 5'er 5'er)
          const allMatches = [];
          const allBettingOffers = [];
          const allOutcomes = [];
          const allMarkets = [];
          
          const batchSize = 5;
          for (let i = 0; i < tournaments.length; i += batchSize) {
            const batch = tournaments.slice(i, i + batchSize);
            const promises = batch.map(t => 
              sendRPC("/sports#initialDump", {
                "topic": `/sports/2218/tr/tournament-aggregator-groups-overview/${t.id}/default-event-info/NOT_LIVE/2258`
              }).catch(e => null)
            );
            
            const batchResults = await Promise.all(promises);
            
            for (const br of batchResults) {
              if (!br?.records) continue;
              for (const rec of br.records) {
                if (rec._type === 'MATCH') allMatches.push(rec);
                else if (rec._type === 'BETTING_OFFER') allBettingOffers.push(rec);
                else if (rec._type === 'OUTCOME') allOutcomes.push(rec);
                else if (rec._type === 'MARKET') allMarkets.push(rec);
              }
            }
          }
          
          results.matchCount = allMatches.length;
          results.bettingOfferCount = allBettingOffers.length;
          results.outcomeCount = allOutcomes.length;
          results.marketCount = allMarkets.length;
          
          // Verileri topla
          results.matches = allMatches;
          results.bettingOffers = allBettingOffers;
          results.outcomes = allOutcomes;
          results.markets = allMarkets;
          
        } catch (e) {
          results.error = e.message;
        }
        
        clearTimeout(timeout);
        ws.close();
        resolve(results);
      };
    });
  });

  console.log('\n═══ Sonuçlar ═══');
  console.log(`Turnuva sayısı: ${allData.tournamentCount}`);
  console.log(`Toplam upcoming: ${allData.totalUpcoming}`);
  console.log(`İlk turnuvalar:`, allData.tournamentNames);
  console.log(`Maç: ${allData.matchCount}`);  
  console.log(`BettingOffer: ${allData.bettingOfferCount}`);
  console.log(`Outcome: ${allData.outcomeCount}`);
  console.log(`Market: ${allData.marketCount}`);
  
  if (allData.error) console.log('Hata:', allData.error);

  // Verileri kaydet
  if (allData.matchCount > 0) {
    fs.writeFileSync('artifacts/holiganbet-prematch-raw.json', JSON.stringify(allData, null, 2), 'utf8');
    console.log(`\n→ artifacts/holiganbet-prematch-raw.json (${JSON.stringify(allData).length} bytes)`);
    
    // Örnek maç göster
    if (allData.matches?.length) {
      const m = allData.matches[0];
      console.log(`\nÖrnek maç: ${m.name} (${m.homeParticipantName} vs ${m.awayParticipantName})`);
    }
  }

  await page.close();
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
