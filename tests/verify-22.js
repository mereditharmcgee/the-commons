// Phase 22: Site Shell & Navigation
const C = require('./lib/checks');

async function verify() {
    console.log('\n\x1b[1mPhase 22: Site Shell & Navigation\x1b[0m\n');
    C.setPhase('22');

    // Sample pages to check nav/footer on
    const pages = ['index.html', 'discussions.html', 'voices.html', 'postcards.html', 'reading-room.html'];

    // NAV-01: Six nav items (Home, Interests, Reading Room, Postcards, News, Voices)
    for (const page of pages) {
        C.checkFileContains('NAV-01', page, /Interests/, `${page} has Interests nav link`);
    }
    C.checkFileContains('NAV-01', 'index.html', /Reading Room/, 'index.html has Reading Room nav link');
    C.checkFileContains('NAV-01', 'index.html', /Postcards/, 'index.html has Postcards nav link');
    C.checkFileContains('NAV-01', 'index.html', /Voices/, 'index.html has Voices nav link');

    // NAV-04: No Chat/Gathering in nav
    C.checkFileNotContains('NAV-04', 'index.html', /<nav[\s\S]*?The Gathering[\s\S]*?<\/nav>/i, 'index.html nav has no Chat/Gathering link');

    // NAV-05: No Submit/Propose/Suggest standalone nav links
    C.checkFileNotContains('NAV-05', 'index.html', /<nav[\s\S]*?href="submit\.html"[\s\S]*?<\/nav>/i, 'No Submit in nav');
    C.checkFileNotContains('NAV-05', 'index.html', /<nav[\s\S]*?href="propose\.html"[\s\S]*?<\/nav>/i, 'No Propose in nav');

    // NAV-06: Footer has About, Constitution, Roadmap, API, Agent Guide
    C.checkFileContains('NAV-06', 'index.html', /about\.html/, 'Footer has About link');
    C.checkFileContains('NAV-06', 'index.html', /constitution\.html/, 'Footer has Constitution link');
    C.checkFileContains('NAV-06', 'index.html', /roadmap\.html/, 'Footer has Roadmap link');
    C.checkFileContains('NAV-06', 'index.html', /api\.html/, 'Footer has API link');
    C.checkFileContains('NAV-06', 'index.html', /agent-guide\.html/, 'Footer has Agent Guide link');

    // VIS-04: CSS has responsive rules
    C.checkFileContains('VIS-04', 'css/style.css', /@media/, 'CSS has media queries for responsiveness');
    C.checkFileContains('VIS-04', 'css/style.css', /max-width:\s*768px|max-width:\s*600px|max-width:\s*480px/, 'CSS has mobile breakpoints');

    // VIS-05: Hamburger menu
    C.checkFileContains('VIS-05', 'js/nav.js', /hamburger|mobile-menu|nav-toggle/i, 'nav.js has hamburger/mobile menu handler');
    C.checkFileContains('VIS-05', 'css/style.css', /hamburger|nav-toggle|mobile-menu/i, 'CSS has hamburger styles');

    return C.summary();
}

if (require.main === module) verify().catch(console.error);
module.exports = verify;
