import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const contexts = browser.contexts();
const pages = contexts[0].pages();

let page = pages.find(p => p.url().includes('tempobet'));
if (!page) {
    page = await contexts[0].newPage();
}

const BASE = 'https://www.1124tempobet.com';

// Go to Süper Lig page
console.log('Navigating to Süper Lig...');
await page.goto(`${BASE}/trsuperlig_0.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);

// Extract detailed match structure from the page
const matchData = await page.evaluate(() => {
    const result = {};
    
    // Find the main events area - look for tbl-wrap.events  
    const eventWraps = document.querySelectorAll('.tbl-wrap.events');
    result.eventWraps = eventWraps.length;
    
    // Get the full inner HTML structure of the events area
    if (eventWraps.length > 0) {
        result.firstEventWrapHTML = eventWraps[0].innerHTML.substring(0, 5000);
    }
    
    // Try different approach - get all rows that contain match data
    const rows = document.querySelectorAll('tr');
    const matchRows = [];
    for (const row of rows) {
        const oddEls = row.querySelectorAll('.odd');
        if (oddEls.length >= 3) { // 1X2 = 3 odds
            const cells = row.querySelectorAll('td');
            matchRows.push({
                outerHTML: row.outerHTML.substring(0, 2000),
                oddCount: oddEls.length,
                cellCount: cells.length,
                text: row.textContent.trim().substring(0, 200)
            });
        }
    }
    result.matchRows = matchRows.slice(0, 5);
    result.totalMatchRows = matchRows.length;
    
    // Look for the event/match wrapper divs
    const h3s = document.querySelectorAll('h3.header');
    result.h3Headers = Array.from(h3s).map(h => ({
        text: h.textContent.trim().substring(0, 100),
        nextHTML: h.nextElementSibling ? h.nextElementSibling.outerHTML.substring(0, 3000) : ''
    }));
    
    // Get all event links with their context
    const eventAnchors = document.querySelectorAll('a[href*="event"]');
    result.eventAnchorsDetail = Array.from(eventAnchors).slice(0, 10).map(a => ({
        href: a.getAttribute('href'),
        text: a.textContent.trim().substring(0, 150),
        parentTag: a.parentElement?.tagName,
        parentClass: a.parentElement?.className,
        grandparentTag: a.parentElement?.parentElement?.tagName,
        grandparentClass: a.parentElement?.parentElement?.className
    }));
    
    return result;
});

console.log('Event wraps:', matchData.eventWraps);
console.log('Total match rows (3+ odds):', matchData.totalMatchRows);

console.log('\n=== H3 HEADERS ===');
matchData.h3Headers.forEach((h, i) => {
    console.log(`\n--- H3 ${i}: ${h.text} ---`);
    if (h.nextHTML) console.log(h.nextHTML.substring(0, 1500));
});

console.log('\n=== MATCH ROWS SAMPLE ===');
matchData.matchRows.forEach((r, i) => {
    console.log(`\n--- Row ${i} (${r.oddCount} odds, ${r.cellCount} cells) ---`);
    console.log('Text:', r.text);
    console.log('HTML:', r.outerHTML);
});

console.log('\n=== EVENT ANCHORS ===');
matchData.eventAnchorsDetail.forEach(a => {
    console.log(`  ${a.text} → ${a.href}`);
    console.log(`    Parent: ${a.parentTag}.${a.parentClass}`);
    console.log(`    GP: ${a.grandparentTag}.${a.grandparentClass}`);
});

if (matchData.firstEventWrapHTML) {
    console.log('\n=== FIRST EVENT WRAP ===');
    console.log(matchData.firstEventWrapHTML);
}

await browser.close();
