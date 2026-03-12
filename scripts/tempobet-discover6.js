import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const contexts = browser.contexts();
const pages = contexts[0].pages();

let page = pages.find(p => p.url().includes('tempobet'));
if (!page) {
    page = await contexts[0].newPage();
}

const BASE = 'https://www.1124tempobet.com';

// Step 1: Check for API calls when loading a league page
console.log('Setting up network monitoring...');
const apiCalls = [];
page.on('request', req => {
    const url = req.url();
    if (url.includes('api') || url.includes('json') || url.includes('ajax') || 
        url.includes('data') || url.includes('sport') || url.includes('event') ||
        url.includes('odds') || url.includes('match') || url.includes('league') ||
        url.includes('.php') || url.includes('bet')) {
        apiCalls.push({ method: req.method(), url: url.substring(0, 200), type: req.resourceType() });
    }
});

page.on('response', async resp => {
    const url = resp.url();
    if (url.includes('.php') || (url.includes('api') && !url.includes('lpsnmedia'))) {
        try {
            const body = await resp.text();
            apiCalls.push({ 
                url: url.substring(0, 200), 
                status: resp.status(),
                bodySize: body.length,
                bodyPreview: body.substring(0, 500)
            });
        } catch(e) {}
    }
});

console.log('Navigating to Süper Lig page...');
await page.goto(`${BASE}/trsuperlig_0.html`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(3000);

console.log(`\nAPI/relevant network calls: ${apiCalls.length}`);
apiCalls.forEach(c => {
    console.log(`  ${c.method || ''} ${c.url} [${c.type || c.status || ''}]`);
    if (c.bodyPreview) console.log(`    Body: ${c.bodyPreview.substring(0, 300)}`);
});

// Step 2: Try a bulk URL approach - check if we can get all football data at once
const testUrls = [
    'sport1_all.html',
    'football_all_0.html', 
    'bulten.html',
    'sport1_markets.html',
    'coupon_football.html',
    'football_0.html',
];

for (const url of testUrls) {
    try {
        const resp = await page.goto(`${BASE}/${url}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
        console.log(`\n${url}: ${resp.status()}`);
        if (resp.status() === 200) {
            const odds = await page.evaluate(() => document.querySelectorAll('.odd[data-odval]').length);
            console.log(`  Odds found: ${odds}`);
        }
    } catch(e) {
        console.log(`\n${url}: ERROR - ${e.message.substring(0, 100)}`);
    }
}

// Step 3: Get ALL league links and categorize for efficient batch scraping
console.log('\n\nGetting all league links...');
await page.goto(`${BASE}/sport1.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(3000);

const leagueInfo = await page.evaluate(() => {
    const links = [];
    const couponDiv = document.getElementById('coupon');
    if (!couponDiv) return { links: [], error: 'no coupon div' };
    
    // Find country headers (h3) and their leagues
    const h3s = couponDiv.querySelectorAll('h3.header');
    for (const h3 of h3s) {
        const country = h3.textContent.trim();
        const next = h3.nextElementSibling;
        if (next) {
            const leagueAnchors = next.querySelectorAll('a[href]');
            for (const a of leagueAnchors) {
                const href = a.getAttribute('href');
                if (href && href.endsWith('.html')) {
                    const name = a.textContent.trim();
                    if (name) {
                        links.push({ country, league: name, href });
                    }
                }
            }
        }
    }
    return { links, total: links.length };
});

console.log(`Total leagues with country info: ${leagueInfo.total || leagueInfo.links.length}`);

// Group by country and show summary
const byCountry = {};
for (const l of leagueInfo.links) {
    if (!byCountry[l.country]) byCountry[l.country] = [];
    byCountry[l.country].push(l);
}
console.log(`Countries: ${Object.keys(byCountry).length}`);
Object.entries(byCountry).slice(0, 15).forEach(([country, leagues]) => {
    console.log(`  ${country}: ${leagues.length} leagues (${leagues.map(l=>l.league).join(', ')})`);
});

await browser.close();
