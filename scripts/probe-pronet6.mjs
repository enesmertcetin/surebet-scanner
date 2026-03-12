/**
 * Pronet probe 6 — Decode fixture-search params & extract prematch 1X2
 */
import { chromium } from 'playwright';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];

async function probeFixtureSearch(domain, label) {
  console.log(`\n=== ${label}: ${domain} ===`);
  const page = await ctx.newPage();
  const client = await page.context().newCDPSession(page);
  await client.send('Network.enable');

  let fixtureSearchUrl = null;
  let fixtureSearchBody = null;

  client.on('Network.responseReceived', async ({ requestId, response }) => {
    if (response.url.includes('fixture-search') && response.url.includes('/mop/')) {
      fixtureSearchUrl = response.url;
      try {
        const { body } = await client.send('Network.getResponseBody', { requestId });
        fixtureSearchBody = body;
      } catch {}
    }
  });

  await page.goto(`https://${domain}/tr/sport/bet/todays-events/football`, { waitUntil: 'load', timeout: 30000 });
  await sleep(15000);

  if (!fixtureSearchUrl) {
    console.log('  fixture-search not captured! Trying to find it...');
    await page.close();
    return;
  }

  // Decode the URL parameters
  const b64Part = fixtureSearchUrl.split('/').pop();
  const decoded = decodeURIComponent(Buffer.from(b64Part, 'base64').toString('utf8'));
  console.log(`  fixture-search params: ${decoded.substring(0, 500)}`);

  // Parse the response
  if (!fixtureSearchBody) {
    console.log('  No response body captured');
    await page.close();
    return;
  }

  console.log(`  Response size: ${fixtureSearchBody.length}`);
  
  const result = await page.evaluate((jsonStr) => {
    try {
      const data = JSON.parse(jsonStr);
      if (!data.success || !data.data) return { error: 'bad response' };
      
      const sports = data.data;
      const football = sports.find(s => s.stId === 170);
      if (!football) return { error: 'no football' };
      
      const matches = [];
      let total1X2 = 0;
      
      for (const cat of (football.cs || [])) {
        for (const season of (cat.sns || [])) {
          for (const fixture of (season.fs || [])) {
            // Find 1X2 market (btgId for match result)
            let ms1 = null, msX = null, ms2 = null;
            let ms1Label = '', ms2Label = '';
            
            if (fixture.btgs) {
              for (const btg of fixture.btgs) {
                // Look for 1X2 market 
                if (btg.btgN && (btg.btgN === '1x2' || btg.btgN === 'Maç Sonucu' || btg.btgN === 'Match Result')) {
                  if (btg.bts) {
                    for (const bt of btg.bts) {
                      if (bt.fos) {
                        for (const fo of bt.fos) {
                          if (fo.hSh === '1' || fo.pSh === '1') ms1 = fo.hO;
                          else if (fo.hSh === 'X' || fo.pSh === 'X') msX = fo.hO;
                          else if (fo.hSh === '2' || fo.pSh === '2') ms2 = fo.hO;
                        }
                      }
                    }
                  }
                  total1X2++;
                }
              }
            }
            
            matches.push({
              fId: fixture.fId,
              home: fixture.hcN,
              away: fixture.acN,
              fsd: fixture.fsd,
              cat: cat.cN,
              season: season.seaN,
              ms1, msX, ms2,
              btgCount: fixture.btgs?.length || 0,
              btgNames: fixture.btgs?.map(b => b.btgN)?.slice(0, 5),
            });
          }
        }
      }
      
      return {
        totalFixtures: matches.length,
        total1X2,
        withOdds: matches.filter(m => m.ms1 && m.msX && m.ms2).length,
        categories: football.cs?.map(c => ({ cN: c.cN, fCnt: c.fCnt })).slice(0, 10),
        sampleMatches: matches.filter(m => m.ms1).slice(0, 5),
        // If 1X2 not found, show btg structure
        noOddsMatch: matches.find(m => !m.ms1 && m.btgCount > 0),
      };
    } catch (e) {
      return { error: e.message };
    }
  }, fixtureSearchBody);

  console.log(JSON.stringify(result, null, 2));

  // If 1X2 wasn't found with our labels, check actual btg structure
  if (result.total1X2 === 0 && !result.error) {
    console.log('\n  --- Checking btg structure ---');
    const btgInfo = await page.evaluate((jsonStr) => {
      const data = JSON.parse(jsonStr);
      const football = data.data.find(s => s.stId === 170);
      const firstCat = football.cs[0];
      const firstSeason = firstCat.sns[0];
      const firstFixture = firstSeason.fs[0];
      
      if (!firstFixture?.btgs) return { error: 'no btgs' };
      
      return {
        fixtureName: `${firstFixture.hcN} vs ${firstFixture.acN}`,
        btgCount: firstFixture.btgs.length,
        btgs: firstFixture.btgs.map(btg => ({
          btgId: btg.btgId,
          btgN: btg.btgN,
          btCount: btg.bts?.length || 0,
          sampleBT: btg.bts?.slice(0, 2).map(bt => ({
            btN: bt.btN,
            foCount: bt.fos?.length || 0,
            sampleFO: bt.fos?.slice(0, 4).map(fo => ({
              foId: fo.foId,
              hO: fo.hO,
              hSh: fo.hSh,
              pSh: fo.pSh,
              oc: fo.oc,
            })),
          })),
        })).slice(0, 5),
      };
    }, fixtureSearchBody);
    console.log(JSON.stringify(btgInfo, null, 2));
  }

  await page.close();
}

await probeFixtureSearch('tulipbet835.com', 'TULIPBET');
await probeFixtureSearch('imajbet1584.com', 'IMAJBET');

await browser.close();
console.log('\n=== DONE ===');
