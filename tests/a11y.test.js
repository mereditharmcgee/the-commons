// Offline accessibility check: axe-core in headless Chromium on every root page.
// Run: node --test tests/a11y.test.js   (needs `npm ci` for axe-core and playwright)
//
// Each page is served from the repo by a local server, and every request that
// leaves 127.0.0.1 is aborted, so Supabase, the CDN and the fonts never load.
// Pages render their static shell plus whatever their scripts draw without
// data (loading and empty states). That is what this checks: labels, alt text,
// names on buttons and links, ARIA use, landmarks, headings, document language,
// keyboard reach of scrollable regions, and the rest of axe's WCAG 2.1 A and AA
// rules.
//
// Two rules are reported but do not fail the run (see KNOWN_TECH_DEBT, "Pre-
// deploy QA"): color-contrast, because --text-muted on the dark background is
// below 4.5:1 site-wide and changing the palette is a design decision, and
// link-in-text-block, because body links are told apart by color alone. Their
// counts are printed as test diagnostics so they stay visible.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pages = fs.readdirSync(root).filter(f => f.endsWith('.html')).sort();
const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const REPORT_ONLY = ['color-contrast', 'link-in-text-block'];
const NIL = '00000000-0000-4000-8000-000000000000';
// Pages that redirect or bail out without a query string get one, so their
// own markup is what gets checked.
const QUERY = {
    'discussion.html': `?id=${NIL}`,
    'text.html': `?id=${NIL}`,
    'profile.html': `?id=${NIL}`,
    'moment.html': `?id=${NIL}`,
    'interest.html': '?slug=noticeboard'
};
// Redirect stubs: they hold no content of their own.
const STUBS = new Set(['discussions.html', 'moments.html', 'whats-new.html']);

const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json', '.txt': 'text/plain',
    '.md': 'text/markdown', '.xml': 'application/xml', '.woff2': 'font/woff2'
};

function serve() {
    const server = http.createServer((req, res) => {
        const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            res.writeHead(404);
            res.end();
            return;
        }
        res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
    });
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function audit(context, base, page) {
    const tab = await context.newPage();
    try {
        await tab.goto(`${base}/${page}${QUERY[page] || ''}`, { waitUntil: 'load' });
        await tab.waitForTimeout(300);
        const landed = new URL(tab.url()).pathname.slice(1);
        if (landed !== page) return { page, redirectedTo: landed };
        await tab.addScriptTag({ content: axeSource });
        const result = await tab.evaluate(tags => window.axe.run(document, { runOnly: { type: 'tag', values: tags } }), TAGS);
        return { page, violations: result.violations };
    } finally {
        await tab.close();
    }
}

test('axe finds no WCAG 2.1 A/AA violations on any root page (offline render)', { timeout: 300000 }, async (t) => {
    const { chromium } = require('playwright');
    const server = await serve();
    const browser = await chromium.launch();
    try {
        // bypassCSP only so axe can be injected; the pages' own CSP is checked by page-heads.test.js.
        const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1280, height: 900 } });
        await context.route('**/*', route => {
            const host = new URL(route.request().url()).hostname;
            return host === '127.0.0.1' ? route.continue() : route.abort();
        });
        const base = `http://127.0.0.1:${server.address().port}`;
        const todo = pages.filter(p => !STUBS.has(p));
        const results = [];
        for (let i = 0; i < todo.length; i += 4) {
            results.push(...await Promise.all(todo.slice(i, i + 4).map(p => audit(context, base, p))));
        }

        const redirected = results.filter(r => r.redirectedTo !== undefined).map(r => `${r.page} -> ${r.redirectedTo}`);
        assert.deepEqual(redirected, [], 'pages that redirected away and were not checked (add a QUERY entry or a STUBS entry)');

        const failures = [];
        const reported = Object.fromEntries(REPORT_ONLY.map(id => [id, 0]));
        for (const { page, violations } of results) {
            for (const v of violations) {
                if (REPORT_ONLY.includes(v.id)) {
                    reported[v.id] += v.nodes.length;
                    continue;
                }
                for (const node of v.nodes) {
                    failures.push(`${page}: ${v.id} (${v.impact}) at ${node.target.join(' ')}: ${v.help}`);
                }
            }
        }
        for (const [id, n] of Object.entries(reported)) t.diagnostic(`report-only ${id}: ${n} elements`);
        assert.ok(results.length >= 38, `only ${results.length} pages audited`);
        assert.deepEqual(failures, [], `accessibility violations:\n  ${failures.join('\n  ')}`);
    } finally {
        await browser.close();
        server.close();
    }
});
