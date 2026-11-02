// CSS lint for the bug class that has actually shipped here: a var(--name)
// with no fallback whose custom property is never defined. The browser drops
// the whole declaration without a console message, so a typo or a token that
// was renamed (--bg-secondary, --text-tertiary) silently falls back to
// transparent or to the inherited color.
// Run: node --test tests/css-custom-properties.test.js
//
// Uses are read from css/*.css, every root page (style blocks and style
// attributes) and js/*.js (inline style strings). A property counts as defined
// if any of those sources sets "--name:" or calls setProperty('--name').
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const sources = [
    ...fs.readdirSync(path.join(root, 'css')).filter(f => f.endsWith('.css')).map(f => `css/${f}`),
    ...fs.readdirSync(root).filter(f => f.endsWith('.html')),
    ...fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js')).map(f => `js/${f}`)
].sort();

// Known undefined uses, found when this check was added (2026-11). Each one is
// a real display bug left for a design decision rather than guessed at here:
// the fix is to pick an existing token (or define this one) and then delete the
// entry, which this test insists on once the use is gone.
const KNOWN = new Set([
    'css/style.css: --bg-secondary', // .identity-setup-stage__button and .identity-empty-onboarding render with no background
    'changes.html: --text-tertiary' // .change-date and .credit inherit the body color instead of a quieter tone
]);

const text = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function scan() {
    const defined = new Set();
    const uses = new Map();
    for (const file of sources) {
        const body = text(file);
        for (const m of body.matchAll(/(?:^|[\s{;"'`(])(--[A-Za-z0-9_-]+)\s*:/g)) defined.add(m[1]);
        for (const m of body.matchAll(/setProperty\(\s*['"`](--[A-Za-z0-9_-]+)/g)) defined.add(m[1]);
        for (const m of body.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)\s*\)/g)) {
            const key = `${file}: ${m[1]}`;
            const line = body.slice(0, m.index).split('\n').length;
            if (!uses.has(key)) uses.set(key, []);
            uses.get(key).push(line);
        }
    }
    const undefinedUses = [...uses.keys()].filter(key => !defined.has(key.split(': ')[1]));
    return { defined, uses, undefinedUses };
}

test('the scan finds the site tokens', () => {
    const { defined, uses } = scan();
    for (const token of ['--bg-deep', '--accent-gold', '--text-primary', '--space-md']) {
        assert.ok(defined.has(token), `${token} not found; the definition pattern is probably broken`);
    }
    assert.ok(uses.size > 200, `only ${uses.size} var() uses found`);
});

test('every var(--name) without a fallback names a defined custom property', () => {
    const { uses, undefinedUses } = scan();
    const fresh = undefinedUses.filter(key => !KNOWN.has(key))
        .map(key => `${key} (line ${uses.get(key).join(', ')}): never defined; use an existing token or add a fallback`);
    assert.deepEqual(fresh, [], `undefined custom properties:\n  ${fresh.join('\n  ')}`);
});

test('every KNOWN entry is still a real undefined use (delete it once fixed)', () => {
    const { undefinedUses } = scan();
    const stale = [...KNOWN].filter(key => !undefinedUses.includes(key));
    assert.deepEqual(stale, [], 'fixed, so remove from KNOWN');
});
