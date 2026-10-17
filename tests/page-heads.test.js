// Static checks on every root page's CSP meta tag and shared includes.
// Run: node --test tests/page-heads.test.js
//
// What this guards:
// - script-src names the exact CDN files a page loads, never the bare
//   cdn.jsdelivr.net host (jsdelivr serves any npm/GitHub file, so a host
//   allowance turns any HTML injection that can make an iframe srcdoc into
//   same-origin script).
// - No 'unsafe-inline' in script-src; every inline <script> block is allowed
//   by the sha256 of its LF-normalized body (the served file is LF even when
//   the checkout is CRLF).
// - Pages that load css/style.css allow its data: background image.
// - Shared js/css includes carry one site-wide ?v= cache-busting token, so a
//   deploy never pairs new page code with a 4-hour-old cached shared file.
// - Any js/css file that changed since this branch left origin/main is loaded
//   under a URL main never used (a bumped or new ?v=), on every page and in
//   js/nav.js's injected notifications.js. Set COMMONS_CACHE_BASE to compare
//   against another commit. Skipped when git or origin/main is unavailable.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const pages = fs.readdirSync(root).filter(f => f.endsWith('.html')).sort();
const SHARED = ['js/config.js', 'js/utils.js', 'js/utils-render.js', 'js/utils-context.js', 'js/auth.js', 'js/nav.js', 'css/style.css'];

function load(page) {
    const raw = fs.readFileSync(path.join(root, page), 'utf8').replace(/\r\n/g, '\n');
    const text = raw.replace(/<!--[\s\S]*?-->/g, '');
    const meta = text.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i);
    const csp = {};
    if (meta) {
        for (const part of meta[1].split(';')) {
            const tokens = part.trim().split(/\s+/).filter(Boolean);
            if (tokens.length) csp[tokens[0].toLowerCase()] = tokens.slice(1);
        }
    }
    const scripts = [...text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map(m => {
        const src = m[1].match(/\bsrc="([^"]*)"/i);
        return { attrs: m[1], body: m[2], src: src ? src[1] : null };
    });
    const styles = [...text.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*>/gi)]
        .map(m => (m[0].match(/\bhref="([^"]*)"/i) || [])[1])
        .filter(Boolean);
    return { text, hasCsp: !!meta, csp, scripts, styles };
}

const cspPages = pages.filter(p => load(p).hasCsp);

test('there are CSP pages to check', () => {
    assert.ok(cspPages.length >= 35, `only ${cspPages.length} CSP pages found`);
});

test('script-src pins CDN scripts to exact files, drops unused hosts and unsafe-inline', () => {
    for (const page of cspPages) {
        const scriptSrc = load(page).csp['script-src'] || [];
        assert.ok(scriptSrc.length, `${page}: no script-src`);
        assert.ok(!scriptSrc.includes("'unsafe-inline'"), `${page}: script-src allows 'unsafe-inline'`);
        for (const token of scriptSrc) {
            if (!/^https?:/i.test(token)) continue;
            const url = new URL(token);
            assert.notEqual(url.hostname, 'storage.ko-fi.com', `${page}: unused storage.ko-fi.com allowance`);
            assert.ok(url.pathname.length > 1 && !url.pathname.endsWith('/'),
                `${page}: script-src allows a whole host or directory: ${token}`);
        }
    }
});

test('every external script is allowed by exactly-matching path, carries SRI, and every CDN allowance is used', () => {
    for (const page of cspPages) {
        const { csp, scripts } = load(page);
        const scriptSrc = csp['script-src'] || [];
        const external = scripts.filter(s => s.src && /^https?:/i.test(s.src));
        for (const s of external) {
            assert.ok(scriptSrc.includes(s.src), `${page}: ${s.src} is not in script-src`);
            assert.match(s.attrs, /\bintegrity="sha(256|384|512)-/, `${page}: ${s.src} has no SRI`);
            assert.match(s.attrs, /\bcrossorigin="anonymous"/, `${page}: ${s.src} has no crossorigin`);
        }
        const loaded = new Set(external.map(s => s.src));
        for (const token of scriptSrc.filter(t => /^https?:/i.test(t))) {
            assert.ok(loaded.has(token), `${page}: script-src allows ${token} but the page never loads it`);
        }
    }
});

test('every inline script block is allowed by the hash of its LF-normalized body', () => {
    for (const page of cspPages) {
        const { csp, scripts, text } = load(page);
        const scriptSrc = csp['script-src'] || [];
        for (const s of scripts.filter(x => !x.src)) {
            if (/\btype="application\/(ld\+)?json"/i.test(s.attrs)) continue;
            const hash = crypto.createHash('sha256').update(s.body).digest('base64');
            assert.ok(scriptSrc.includes(`'sha256-${hash}'`), `${page}: inline script needs 'sha256-${hash}'`);
        }
        const markup = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
        const handler = markup.match(/<[a-z][^>]*\son[a-z]+\s*=/i);
        assert.equal(handler, null, `${page}: inline event handler is blocked by the CSP: ${handler && handler[0]}`);
    }
});

test('pages that load style.css allow its data: background image', () => {
    for (const page of cspPages) {
        const { csp, styles } = load(page);
        if (!styles.some(href => href.split('?')[0] === 'css/style.css')) continue;
        const imgSrc = csp['img-src'] || csp['default-src'] || [];
        assert.ok(imgSrc.includes('data:'), `${page}: img-src does not allow data:, so style.css's texture is blocked`);
        assert.ok(imgSrc.includes("'self'"), `${page}: img-src does not allow 'self'`);
    }
});

test('shared includes carry one site-wide ?v= token on every page', () => {
    const tokens = new Map();
    for (const page of pages) {
        const { scripts, styles } = load(page);
        const refs = [...scripts.map(s => s.src).filter(Boolean), ...styles];
        for (const ref of refs) {
            const [file, query] = ref.split('?');
            if (!SHARED.includes(file)) continue;
            const v = new URLSearchParams(query || '').get('v');
            assert.ok(v, `${page}: ${file} has no ?v= cache-buster`);
            if (!tokens.has(v)) tokens.set(v, []);
            tokens.get(v).push(`${page}:${file}`);
        }
    }
    assert.ok(tokens.size >= 1, 'no shared includes found');
    assert.equal(tokens.size, 1, `shared includes disagree on ?v=: ${[...tokens.keys()].join(', ')}`);
});

test('local script and stylesheet includes point at files that exist', () => {
    for (const page of pages) {
        const { scripts, styles } = load(page);
        const refs = [...scripts.map(s => s.src).filter(Boolean), ...styles];
        for (const ref of refs) {
            if (/^https?:/i.test(ref)) continue;
            const file = decodeURIComponent(ref.split(/[?#]/)[0]).replace(/^\//, '');
            assert.ok(fs.existsSync(path.join(root, file)), `${page}: ${ref} does not exist`);
        }
    }
});

// Asset references in root pages and js/ files: src/href attributes and the
// string nav.js uses to inject notifications.js. The same pattern runs over the
// base commit through git grep (POSIX ERE), so both sides parse alike.
const ASSET_REF = /["'`]((?:js|css)\/[A-Za-z0-9_./-]+\.(?:js|css)(?:\?v=[A-Za-z0-9_.-]+)?)["'`]/g;
const ASSET_REF_ERE = "[\"'`](js|css)/[A-Za-z0-9_./-]+[.](js|css)([?]v=[A-Za-z0-9_.-]+)?[\"'`]";

function git(args) {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}

function cacheBase() {
    const wanted = process.env.COMMONS_CACHE_BASE;
    if (wanted) return git(['rev-parse', '--verify', `${wanted}^{commit}`]).trim(); // a bad ref fails loudly
    try {
        return git(['merge-base', 'HEAD', 'origin/main']).trim();
    } catch {
        return null;
    }
}

test('a js/css file changed since origin/main is loaded under a URL main never served', (t) => {
    const base = cacheBase();
    if (!base) {
        t.skip('no git checkout or no origin/main to compare against (set COMMONS_CACHE_BASE)');
        return;
    }
    const changed = new Set(git(['diff', '--name-only', base, '--', 'js', 'css']).split('\n').map(s => s.trim()).filter(Boolean));
    let baseHits = '';
    try {
        baseHits = git(['grep', '-h', '-o', '-I', '-E', ASSET_REF_ERE, base, '--', ':(glob)*.html', ':(glob)js/*.js']);
    } catch (e) {
        if (e.status !== 1) throw e; // 1 = no matches
    }
    const served = new Set(baseHits.split('\n').map(s => s.trim().slice(1, -1)).filter(Boolean));
    const stale = new Set();
    const sources = [
        ...pages.map(p => [p, fs.readFileSync(path.join(root, p), 'utf8').replace(/<!--[\s\S]*?-->/g, '')]),
        ...fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js'))
            .map(f => [`js/${f}`, fs.readFileSync(path.join(root, 'js', f), 'utf8')]),
    ];
    for (const [where, text] of sources) {
        for (const m of text.matchAll(ASSET_REF)) {
            const ref = m[1];
            if (changed.has(ref.split('?')[0]) && served.has(ref)) stale.add(`${where}: ${ref}`);
        }
    }
    assert.deepEqual([...stale], [],
        `changed since ${base.slice(0, 7)} but still loaded under a URL browsers may hold for 4 hours. ` +
        'Shared includes: set a new site-wide ?v= (see /deploy-check). Page scripts and other css: ' +
        'bump ?v=rN, or add ?v=r1 if there is none. notifications.js: change the URL in js/nav.js.\n  ' +
        [...stale].join('\n  '));
});
