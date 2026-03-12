import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const contexts = browser.contexts();
const pages = contexts[0].pages();

// Find or create a page for tempobet
let page = pages.find(p => p.url().includes('tempobet'));
if (!page) {
    page = await contexts[0].newPage();
}

const BASE = 'https://www.1124tempobet.com';

// Step 1: Go to sport1.html and extract all league URLs
console.log('Navigating to sport1.html...');
await page.goto(`${BASE}/sport1.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);

// Extract league links from the coupon form
const leagueLinks = await page.evaluate(() => {
    const links = [];
    const anchors = document.querySelectorAll('#coupon a[href]');
    for (const a of anchors) {
        const href = a.getAttribute('href');
        if (href && (href.includes('league') || href.includes('_0.html') || href.includes('_5_0.html'))) {
            const name = a.textContent.trim();
            if (name && !links.find(l => l.href === href)) {
                links.push({ href, name });
            }
        }
    }
    return links;
});

console.log(`Found ${leagueLinks.length} league links`);
leagueLinks.slice(0, 20).forEach(l => console.log(`  ${l.name} → ${l.href}`));

// Step 2: Check if there's a better approach - look for a bulk bülten page 
// Try navigating to the main sport page and check what kind of data it loads
console.log('\n--- Checking sport page structure ---');

// First let's check a single league page to understand match listing format
const testLeague = leagueLinks[0]; // First league (Süper Lig)
console.log(`\nTesting league: ${testLeague.name} → ${testLeague.href}`);
await page.goto(`${BASE}/${testLeague.href}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);

const leagueData = await page.evaluate(() => {
    const result = {
        title: document.title,
        url: location.href,
        bodySize: document.body.innerHTML.length,
    };

    // Check for match rows/events
    const eventHeaders = document.querySelectorAll('.header');
    result.headers = Array.from(eventHeaders).slice(0, 10).map(h => ({
        text: h.textContent.trim().substring(0, 100),
        tag: h.tagName,
        class: h.className
    }));

    // Check for odds
    const odds = document.querySelectorAll('.odd[data-odval]');
    result.oddsCount = odds.length;
    result.oddsSample = Array.from(odds).slice(0, 20).map(o => ({
        desc: o.querySelector('.desc')?.textContent?.trim(),
        val: o.getAttribute('data-odval'),
        id: o.getAttribute('data-odd')
    }));

    // Check for event links
    const eventLinks = document.querySelectorAll('a[href*="event"]');
    result.eventLinks = Array.from(eventLinks).slice(0, 20).map(a => ({
        href: a.getAttribute('href'),
        text: a.textContent.trim().substring(0, 100)
    }));

    // Check for match rows - look for team names in structure
    // Look for tbl-wrap or events sections
    const tblWraps = document.querySelectorAll('.tbl-wrap');
    result.tblWraps = tblWraps.length;

    // Get the main content structure
    const content = document.querySelector('#coupon');
    if (content) {
        result.couponHTML = content.innerHTML.substring(0, 5000);
    }

    return result;
});

console.log(`Title: ${leagueData.title}`);
console.log(`Body size: ${leagueData.bodySize}`);
console.log(`Odds count: ${leagueData.oddsCount}`);
console.log(`Event links: ${leagueData.eventLinks.length}`);
console.log(`Tbl-wraps: ${leagueData.tblWraps}`);

console.log('\nHeaders:');
leagueData.headers.forEach(h => console.log(`  [${h.tag}.${h.class}] ${h.text}`));

console.log('\nEvent links:');
leagueData.eventLinks.forEach(l => console.log(`  ${l.text} → ${l.href}`));

console.log('\nOdds sample:');
leagueData.oddsSample.forEach(o => console.log(`  ${o.desc}: ${o.val}`));

if (leagueData.couponHTML) {
    console.log('\nFirst 3000 chars of coupon HTML:');
    console.log(leagueData.couponHTML.substring(0, 3000));
}

await browser.close();
