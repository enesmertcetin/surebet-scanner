import fs from 'fs';

const html = fs.readFileSync('artifacts/tempobet-sport1.html', 'utf8');

// The right_event_column only shows one match. Let's find the main content area
// Look for coupon elements  
const couponRegex = /class="[^"]*coupon[^"]*"/g;
let coupons = [];
let m;
while ((m = couponRegex.exec(html)) !== null && coupons.length < 10) {
    coupons.push({ match: m[0], pos: m.index });
}
console.log('Coupon class elements:', coupons.length);
coupons.forEach(c => console.log(' ', c.match, 'at', c.pos));

// Show context around first coupon
if (coupons.length > 0) {
    const ctx = html.substring(Math.max(0, coupons[0].pos - 200), coupons[0].pos + 1000);
    console.log('\n=== FIRST COUPON CONTEXT ===');
    console.log(ctx);
}

// Look for the left panel / events list
// Search for "events" divs, "event-list", "match" etc.
const eventsPattern = /id="[^"]*(?:event|match|left|content|coupon|game|fixture)[^"]*"/gi;
let ids = [];
while ((m = eventsPattern.exec(html)) !== null && ids.length < 30) {
    ids.push({ match: m[0], pos: m.index });
}
console.log('\n\nRelevant IDs found:');
ids.forEach(id => console.log(' ', id.match, 'at', id.pos));

// Look for the main content div structure
const mainDivs = /id="(content|main|center|middle|left|sport|events|coupon_form|coupon)"/gi;
let mainIds = [];
while ((m = mainDivs.exec(html)) !== null) {
    mainIds.push({ id: m[1], pos: m.index });
}
console.log('\n\nMain div IDs:');
mainIds.forEach(id => console.log(' ', id.id, 'at', id.pos));

// Look for <form id="coupon"
const couponForm = html.indexOf('id="coupon"');
if (couponForm !== -1) {
    console.log('\n=== COUPON FORM CONTEXT ===');
    console.log(html.substring(couponForm, couponForm + 3000));
}

// Check if the page uses AJAX/lazy loading for match data
// The 7085 coupon elements found via Playwright suggests the real page has way more data than this static HTML
// Let's look at the structure of event links
const eventLinkRegex = /href="event(\d+)\.html"/g;
let eventLinks = [];
while ((m = eventLinkRegex.exec(html)) !== null) {
    eventLinks.push(m[1]);
}
console.log('\n\nEvent links found:', eventLinks.length);
console.log('First 10:', eventLinks.slice(0, 10));
console.log('Last 10:', eventLinks.slice(-10));

// How many unique events?
const uniqueEvents = [...new Set(eventLinks)];
console.log('Unique events:', uniqueEvents.length);
