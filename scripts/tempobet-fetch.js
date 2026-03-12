/**
 * Tempobet Full Football Fetch
 * Navigates to sport1.html to get all league links,
 * then visits each league page to extract match data with 1X2 odds.
 * Server-rendered HTML — no API available.
 */
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'https://www.1124tempobet.com';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const contexts = browser.contexts();
const page = await contexts[0].newPage();

// Block images and unnecessary resources for speed
await page.route('**/*.{png,jpg,jpeg,gif,svg,ico,woff,woff2,ttf}', route => route.abort());
await page.route('**/liveperson.net/**', route => route.abort());
await page.route('**/google-analytics.com/**', route => route.abort());
await page.route('**/sportradar.com/**', route => route.abort());
await page.route('**/lpsnmedia.net/**', route => route.abort());

// Step 1: Get all league links from sport1.html
console.log('Step 1: Getting league links from sport1.html...');
await page.goto(`${BASE}/sport1.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2000);

const leagues = await page.evaluate(() => {
    const links = [];
    const couponDiv = document.getElementById('coupon');
    if (!couponDiv) return links;

    const h3s = couponDiv.querySelectorAll('h3.header');
    for (const h3 of h3s) {
        const country = h3.textContent.trim();
        const next = h3.nextElementSibling;
        if (next) {
            for (const a of next.querySelectorAll('a[href]')) {
                const href = a.getAttribute('href');
                if (href && href.endsWith('.html')) {
                    const name = a.textContent.trim();
                    if (name && !links.find(l => l.href === href)) {
                        links.push({ country, league: name, href });
                    }
                }
            }
        }
    }
    return links;
});

console.log(`Found ${leagues.length} leagues across ${[...new Set(leagues.map(l => l.country))].length} countries`);

// Step 2: Visit each league page and extract matches
const allMatches = [];
let leaguesProcessed = 0;
let emptyLeagues = 0;
const startTime = Date.now();

for (const league of leagues) {
    leaguesProcessed++;
    
    try {
        await page.goto(`${BASE}/${league.href}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        // Quick wait for any JS rendering
        await page.waitForTimeout(500);

        const matches = await page.evaluate((leagueInfo) => {
            const results = [];
            
            // Find all match rows - they have td.team and td.odds
            const rows = document.querySelectorAll('table.tbl-a.static tr');
            let currentDate = '';
            
            for (const row of rows) {
                // Check if this is a date header row
                const thDesc = row.querySelector('th.desc');
                if (thDesc) {
                    currentDate = thDesc.textContent.trim();
                    continue;
                }
                
                // Check if this is a match row with odds
                const teamCell = row.querySelector('td.team');
                const oddsCells = row.querySelectorAll('td.odds');
                
                if (teamCell && oddsCells.length >= 3) {
                    const teamLink = teamCell.querySelector('a[href*="event"]');
                    if (!teamLink) continue;
                    
                    const teamText = teamLink.textContent.trim();
                    const timeSpan = teamLink.querySelector('span.tim');
                    const time = timeSpan ? timeSpan.textContent.trim() : '';
                    
                    // Extract team names: remove time prefix and "Canlı" suffix
                    let matchName = teamText;
                    if (time) matchName = matchName.replace(time, '').trim();
                    matchName = matchName.replace(/\s*Canlı\s*$/, '').trim();
                    
                    // Split into home - away
                    const parts = matchName.split(' - ');
                    if (parts.length < 2) continue;
                    
                    const home = parts[0].trim();
                    const away = parts.slice(1).join(' - ').trim();
                    
                    // Extract 1X2 odds
                    const odds = [];
                    for (const oddCell of oddsCells) {
                        const oddEl = oddCell.querySelector('.odd[data-odval]');
                        if (oddEl) {
                            odds.push(parseFloat(oddEl.getAttribute('data-odval')));
                        } else {
                            odds.push(null);
                        }
                    }
                    
                    // Get event ID from href
                    const href = teamLink.getAttribute('href');
                    const eventMatch = href.match(/event(\d+)\.html/);
                    const eventId = eventMatch ? eventMatch[1] : '';
                    
                    // Get market count (number in the last td)
                    const noCell = row.querySelector('td.no');
                    const marketCount = noCell ? parseInt(noCell.textContent.trim()) : 0;
                    
                    results.push({
                        country: leagueInfo.country,
                        league: leagueInfo.league,
                        date: currentDate,
                        time,
                        home,
                        away,
                        odds1: odds[0],
                        oddsX: odds[1],
                        odds2: odds[2],
                        eventId,
                        marketCount,
                        isLive: teamText.includes('Canlı')
                    });
                }
            }
            return results;
        }, league);

        if (matches.length > 0) {
            allMatches.push(...matches);
        } else {
            emptyLeagues++;
        }

        // Progress every 20 leagues
        if (leaguesProcessed % 20 === 0 || matches.length > 0) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            const rate = (leaguesProcessed / (Date.now() - startTime) * 1000).toFixed(1);
            const eta = ((leagues.length - leaguesProcessed) / rate).toFixed(0);
            console.log(`[${leaguesProcessed}/${leagues.length}] ${league.country} > ${league.league}: ${matches.length} matches | Total: ${allMatches.length} | ${elapsed}s elapsed, ~${eta}s remaining`);
        }
    } catch (err) {
        console.error(`ERROR [${leaguesProcessed}/${leagues.length}] ${league.country} > ${league.league}: ${err.message.substring(0, 100)}`);
    }
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\n=== COMPLETE ===`);
console.log(`Time: ${elapsed}s`);
console.log(`Leagues: ${leagues.length} (${emptyLeagues} empty)`);
console.log(`Matches: ${allMatches.length}`);
console.log(`Countries: ${[...new Set(allMatches.map(m => m.country))].length}`);
console.log(`Live matches: ${allMatches.filter(m => m.isLive).length}`);
console.log(`Prematch: ${allMatches.filter(m => !m.isLive).length}`);

// Save raw data
fs.writeFileSync('artifacts/tempobet-football-raw.json', JSON.stringify(allMatches, null, 2));
console.log(`\nSaved to artifacts/tempobet-football-raw.json (${allMatches.length} matches)`);

// Quick summary by country
const byCountry = {};
for (const m of allMatches) {
    if (!byCountry[m.country]) byCountry[m.country] = 0;
    byCountry[m.country]++;
}
const sorted = Object.entries(byCountry).sort((a, b) => b[1] - a[1]);
console.log(`\nTop 20 countries:`);
sorted.slice(0, 20).forEach(([c, n]) => console.log(`  ${c}: ${n} matches`));

await page.close();
await browser.close();
