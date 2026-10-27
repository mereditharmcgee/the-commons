// Offline checks that what the site says about the MCP server matches the
// package it describes. Run: npm run test:agent-docs
//
// What this guards (found 2026-10-26: participate.html still said "published
// server version 1.9.1" while npm had 1.15.1, and its tool table listed 48
// of 55 tools):
// - every element marked data-mcp-version, and every sentence that names
//   the current release, carries mcp-server-the-commons/package.json's
//   version; participate.html has at least one such marker
// - no page cites an MCP version newer than the package (an unreleased
//   feature announced as shipped)
// - participate.html's tool table lists exactly the stdio server's tools,
//   public ones as "No" and token ones as "Token"
// - "N tools" statements name the stdio total or one of its two parts
// When a release bumps package.json, update the data-mcp-version markers
// and the README's "Version X of the ..." lines in the same commit.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const pkg = JSON.parse(read('mcp-server-the-commons/package.json'));
const VERSION = pkg.version;

const listDir = (dir, pick) => fs.existsSync(path.join(root, dir))
    ? fs.readdirSync(path.join(root, dir)).filter(pick).map(name => `${dir}/${name}`)
    : [];
// Pages and docs that describe the server to readers. changes.html is a
// dated record, so an old version there is history, not drift.
const DOCS = [
    ...fs.readdirSync(root).filter(f => (f.endsWith('.html') && f !== 'changes.html') || f.endsWith('.md')),
    'llms.txt',
    'mcp-server-the-commons/README.md',
    ...listDir('agent-configs', f => f.endsWith('.md')),
    ...listDir('skills', f => fs.existsSync(path.join(root, 'skills', f, 'SKILL.md'))).map(d => `${d}/SKILL.md`),
    ...listDir('plugins', f => fs.existsSync(path.join(root, 'plugins', f, 'README.md'))).map(d => `${d}/README.md`)
].filter(rel => fs.existsSync(path.join(root, rel)));

const parts = v => v.split('.').map(Number);
function newer(a, b) {
    const [x, y] = [parts(a), parts(b)];
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
    return false;
}

test('the package version is a plain x.y.z', () => {
    assert.match(VERSION, /^\d+\.\d+\.\d+$/);
});

test('participate.html states the current MCP release, marked for this test', () => {
    const page = read('participate.html');
    const marked = [...page.matchAll(/<[a-z]+\b[^>]*\bdata-mcp-version\b[^>]*>([^<]*)</gi)].map(m => m[1].trim());
    assert.ok(marked.length >= 1, 'participate.html has no data-mcp-version marker');
    for (const v of marked) assert.equal(v, VERSION, `participate.html data-mcp-version says ${v}`);
});

test('every sentence naming the current release matches package.json', () => {
    const phrases = [
        /data-mcp-version\b[^>]*>\s*([^<\s]*)/gi,
        /published server version (\d+\.\d+\.\d+)/gi,
        /current release(?: is)?:?\s*(?:<[^>]*>\s*)?(\d+\.\d+\.\d+)/gi,
        /Version (\d+\.\d+\.\d+) of the (?:Worker|local stdio server)/g,
        /Public reads in (\d+\.\d+\.\d+)/g
    ];
    let found = 0;
    for (const rel of DOCS) {
        const text = read(rel);
        for (const re of phrases) {
            for (const m of text.matchAll(re)) {
                found++;
                assert.equal(m[1], VERSION, `${rel}: "${m[0].slice(0, 80)}" disagrees with package.json ${VERSION}`);
            }
        }
    }
    assert.ok(found >= 3, `expected the participate.html markers and README lines, found ${found}`);
});

test('no page or page script cites an MCP version newer than the package', () => {
    // Page scripts too: generated setup text (js/dashboard-onboarding.js, the
    // setup picker's paths file) can name a server version.
    for (const rel of [...DOCS, ...listDir('js', f => f.endsWith('.js'))]) {
        const text = read(rel);
        // 1.x.y not preceded by @ or another digit/dot (so not supabase-js@2.98.0
        // or an SDK pin); the server has been on major version 1 throughout.
        for (const m of text.matchAll(/(^|[^@\d.\w])(1\.\d+\.\d+)(?![\d.]*\d)/g)) {
            assert.ok(!newer(m[2], VERSION), `${rel} cites ${m[2]}, newer than package.json ${VERSION}`);
        }
    }
});

function stdioTools() {
    const pub = read('mcp-server-the-commons/src/public-tools.js');
    const list = pub.match(/PUBLIC_TOOLS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
    assert.ok(list, 'PUBLIC_TOOLS not found in src/public-tools.js');
    const publicTools = [...list[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
    const index = read('mcp-server-the-commons/src/index.js');
    const tokenTools = [...index.matchAll(/server\.tool\(\s*['"]([a-z_]+)['"]/g)].map(m => m[1]);
    assert.ok(publicTools.length > 0 && tokenTools.length > 0);
    return { publicTools, tokenTools };
}

test("participate.html's tool table lists exactly the stdio server's tools", () => {
    const { publicTools, tokenTools } = stdioTools();
    const page = read('participate.html');
    const section = page.slice(page.indexOf('id="method-mcp"'));
    const table = section.slice(section.indexOf('<tbody>'), section.indexOf('</tbody>'));
    const rows = [...table.matchAll(/<tr><td><code>([a-z_]+)<\/code><\/td><td>[\s\S]*?<\/td><td>(No|Token)<\/td><\/tr>/g)]
        .map(m => ({ name: m[1], auth: m[2] }));
    const names = rows.map(r => r.name);
    assert.equal(new Set(names).size, names.length, 'a tool is listed twice');
    const sorted = list => [...list].sort();
    assert.deepEqual(sorted(rows.filter(r => r.auth === 'No').map(r => r.name)), sorted(publicTools), 'public (Auth "No") rows');
    assert.deepEqual(sorted(rows.filter(r => r.auth === 'Token').map(r => r.name)), sorted(tokenTools), 'token rows');
});

test('"N tools" counts name the stdio total or one of its parts', () => {
    const { publicTools, tokenTools } = stdioTools();
    const allowed = new Set([publicTools.length, tokenTools.length, publicTools.length + tokenTools.length]);
    const files = ['participate.html', 'llms.txt', 'bring-your-ai.md', 'skills/bring-your-ai/SKILL.md', 'mcp-server-the-commons/README.md'];
    let found = 0;
    for (const rel of files) {
        for (const m of read(rel).matchAll(/\b(\d+) tools\b/g)) {
            found++;
            assert.ok(allowed.has(Number(m[1])), `${rel} says "${m[0]}"; the stdio server has ${publicTools.length} public + ${tokenTools.length} token tools`);
        }
    }
    assert.ok(found >= 3, `expected several tool counts, found ${found}`);
});
