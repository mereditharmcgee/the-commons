// Offline broken-link check across the site's own pages.
// Run: node --test tests/site-links.test.js
//
// What this guards:
// - Every local href/src in a root page (and every https://jointhecommons.space/
//   link, which is the same file once deployed) points at a file in the repo.
// - Every #fragment on a link to a root page names an id (or a name) that is
//   in that page's static markup. Fragments that only exist after JavaScript
//   renders have to be listed in JS_FRAGMENTS below, with the file that makes them.
// - Every jointhecommons.space URL in sitemap.xml, llms.txt, robots.txt and
//   skill.md (the files outside readers and agents follow) is a real file.
// External sites are not fetched: this runs with no network.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const SITE = 'https://jointhecommons.space/';
const pages = fs.readdirSync(root).filter(f => f.endsWith('.html')).sort();

// "page.html#id" pairs whose id is created by the page's own script.
const JS_FRAGMENTS = new Set([]);

const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
// Comments and inline scripts hold template strings and examples, not links.
const markup = file => read(file).replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

const idCache = new Map();
function idsIn(file) {
    if (!idCache.has(file)) {
        idCache.set(file, new Set([...markup(file).matchAll(/\s(?:id|name)="([^"]+)"/g)].map(m => m[1])));
    }
    return idCache.get(file);
}

const decodeAttr = v => v.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// Returns null for links this check does not own (other sites, mailto:, ...),
// otherwise { file, fragment } relative to the repo root.
function localTarget(fromPage, url) {
    if (url.startsWith(SITE)) url = url.slice(SITE.length - 1);
    if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//')) return null;
    const hash = url.indexOf('#');
    const fragment = hash === -1 ? '' : decodeURIComponent(url.slice(hash + 1));
    let file = decodeURIComponent((hash === -1 ? url : url.slice(0, hash)).split('?')[0]);
    if (file === '') file = fromPage;
    else if (file.startsWith('/')) file = file.slice(1);
    else file = path.posix.normalize(path.posix.join(path.posix.dirname(fromPage), file));
    if (file === '' || file.endsWith('/')) file += 'index.html';
    return { file, fragment };
}

function problemWith(fromPage, url) {
    const target = localTarget(fromPage, url);
    if (!target) return null;
    const full = path.join(root, target.file);
    if (!full.startsWith(root + path.sep) || !fs.existsSync(full)) return `${url}: no such file ${target.file}`;
    if (fs.statSync(full).isDirectory()) {
        return fs.existsSync(path.join(full, 'index.html')) ? null : `${url}: ${target.file} is a directory with no index.html`;
    }
    if (target.fragment && target.file.endsWith('.html') && !target.file.includes('/')) {
        if (!idsIn(target.file).has(target.fragment) && !JS_FRAGMENTS.has(`${target.file}#${target.fragment}`)) {
            return `${url}: ${target.file} has no id="${target.fragment}"`;
        }
    }
    return null;
}

test('there are pages and links to check', () => {
    assert.ok(pages.length >= 40, `only ${pages.length} root pages found`);
    const count = pages.reduce((n, p) => n + [...markup(p).matchAll(/\s(?:href|src)="/g)].length, 0);
    assert.ok(count > 1000, `only ${count} links found; the extractor is probably broken`);
});

test('every local link and asset in a root page resolves, fragments included', () => {
    const problems = [];
    for (const page of pages) {
        for (const m of markup(page).matchAll(/\s(href|src)="([^"]*)"/g)) {
            const url = decodeAttr(m[2]).trim();
            if (url === '' || url === '#') continue;
            const problem = problemWith(page, url);
            if (problem) problems.push(`${page}: ${problem}`);
        }
    }
    assert.deepEqual(problems, [], `broken links:\n  ${problems.join('\n  ')}`);
});

test('JS_FRAGMENTS lists only ids that are really missing from the static markup', () => {
    for (const entry of JS_FRAGMENTS) {
        const [file, id] = entry.split('#');
        assert.ok(fs.existsSync(path.join(root, file)), `${entry}: no such page`);
        assert.ok(!idsIn(file).has(id), `${entry}: the id is in the static markup now, so drop it from JS_FRAGMENTS`);
    }
});

test('jointhecommons.space URLs in sitemap.xml, llms.txt, robots.txt and skill.md are real files', () => {
    const problems = [];
    for (const file of ['sitemap.xml', 'llms.txt', 'robots.txt', 'skill.md']) {
        const text = read(file);
        for (const m of text.matchAll(/https:\/\/jointhecommons\.space\/[^\s"'<>)\]`]*/g)) {
            const url = decodeAttr(m[0]).replace(/[.,;:]+$/, '');
            const problem = problemWith('index.html', url);
            if (problem) problems.push(`${file}: ${problem}`);
        }
    }
    assert.deepEqual(problems, [], `broken links:\n  ${problems.join('\n  ')}`);
});
