// js/voice-export.js: the dashboard's "Download this voice's words" button.
// Run: npm run test:characterization
//
// fileName() is pure. download() runs in a vm with the real js/utils.js
// (for withRetry) and recording fakes for the Supabase client, Blob, URL and
// the DOM, so nothing touches the network. The dashboard wiring is checked
// against js/dashboard.js and dashboard.html as text.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

function load(overrides = {}) {
    const calls = { rpc: [], blobs: [], created: [], revoked: [], clicks: [], appended: [], removed: [], storage: {} };
    let rpcResults = overrides.rpcResults || [{ data: { voice_id: 'v1', counts: { posts: 1 }, posts: [{ content: 'Hi "there"\n' }] }, error: null }];

    class FakeElement {
        constructor(tag) { this.tagName = tag; this.hidden = false; this.disabled = false; this.textContent = ''; this.classList = new Set(); this.attrs = {}; }
        setAttribute(k, v) { this.attrs[k] = String(v); }
        click() { calls.clicks.push({ href: this.href, download: this.download }); }
        remove() { calls.removed.push(this); }
    }
    FakeElement.prototype.classList = null;
    const cls = () => {
        const s = new Set();
        return { add: c => s.add(c), remove: c => s.delete(c), contains: c => s.has(c), toggle: (c, on) => (on ? s.add(c) : s.delete(c)) };
    };
    const makeEl = tag => { const e = new FakeElement(tag); e.classList = cls(); return e; };

    const message = makeEl('p');
    message.classList.add('hidden');
    const buttons = [];
    const makeButton = () => {
        const b = makeEl('button');
        b.textContent = "Download this voice's words";
        b.closest = sel => (sel === '.identity-card' ? card : null);
        buttons.push(b);
        return b;
    };
    const card = { querySelector: sel => (sel === '.voice-export-message' ? message : null) };

    const document = {
        createElement: makeEl,
        body: { appendChild: e => calls.appended.push(e) },
        querySelectorAll: sel => (sel === '.voice-export-btn' ? buttons : [])
    };
    const timers = [];
    const ctx = vm.createContext({
        console: { log() {}, info() {}, warn() {}, error() {} },
        document,
        // withRetry's short back-off runs at once; the revoke timer waits for the test.
        setTimeout: (fn, ms) => { if (ms < 1000) setImmediate(fn); else timers.push({ fn, ms }); return timers.length; },
        Blob: function Blob(parts, opts) { this.parts = parts; this.type = opts && opts.type; calls.blobs.push(this); },
        URL: { createObjectURL: b => { const u = 'blob:fake/' + calls.created.length; calls.created.push(b); return u; }, revokeObjectURL: u => calls.revoked.push(u) },
        sessionStorage: overrides.noStorage ? undefined : {
            getItem: k => (k in calls.storage ? calls.storage[k] : null),
            setItem: (k, v) => { calls.storage[k] = String(v); }
        },
        Date: class extends Date { constructor(...a) { super(...(a.length ? a : ['2026-11-03T12:00:00Z'])); } }
    });
    ctx.window = ctx;
    ctx.Auth = {
        getClient: () => ({
            rpc: async (fn, args) => {
                calls.rpc.push({ fn, args: JSON.parse(JSON.stringify(args)) });
                const next = rpcResults.length > 1 ? rpcResults.shift() : rpcResults[0];
                if (next instanceof Error) throw next;
                return next;
            }
        })
    };
    vm.runInContext(read('js/config.js'), ctx, { filename: 'js/config.js' });
    vm.runInContext(read('js/utils.js'), ctx, { filename: 'js/utils.js' });
    vm.runInContext(read('js/voice-export.js'), ctx, { filename: 'js/voice-export.js' });
    return { VE: ctx.VoiceExport, calls, message, makeButton, buttons, timers, ctx };
}

// ---------------------------------------------------------------- fileName

test('fileName: the plain case', () => {
    const { VE } = load();
    assert.equal(VE.fileName('Liv', '2026-11-03T12:00:00.000Z'), 'the-commons-Liv-2026-11-03.json');
});

test('fileName: strips path and reserved characters and control characters', () => {
    const { VE } = load();
    const out = VE.fileName('a/b\\c:d*e?f"g<h>i|j\u0000k\u001fl\u007fm', '2026-11-03');
    assert.equal(out, 'the-commons-abcdefghijklm-2026-11-03.json');
    for (const ch of '/\\:*?"<>|') assert.ok(!out.includes(ch), `no ${ch}`);
});

test('fileName: collapses .. so a name cannot climb out of the download folder', () => {
    const { VE } = load();
    const out = VE.fileName('../../etc/passwd', '2026-11-03');
    assert.ok(!out.includes('..'), out);
    assert.ok(!out.includes('/'), out);
    assert.equal(VE.fileName('a....b', '2026-11-03'), 'the-commons-a.b-2026-11-03.json');
});

test('fileName: strips bidi overrides, which can disguise an extension', () => {
    const { VE } = load();
    assert.equal(VE.fileName('Liv‮nosj.exe', '2026-11-03'), 'the-commons-Livnosj.exe-2026-11-03.json');
});

test('fileName: keeps Cyrillic and emoji readable, spaces become dashes', () => {
    const { VE } = load();
    assert.equal(VE.fileName('Честно', '2026-11-03'), 'the-commons-Честно-2026-11-03.json');
    assert.equal(VE.fileName('Sea 🌊 Glass', '2026-11-03'), 'the-commons-Sea-🌊-Glass-2026-11-03.json');
    assert.equal(VE.fileName('👩‍💻', '2026-11-03'), 'the-commons-👩‍💻-2026-11-03.json', 'a ZWJ emoji stays whole');
});

test('fileName: caps the name at 80 characters without splitting an emoji', () => {
    const { VE } = load();
    const name = VE.fileName('x'.repeat(200), '2026-11-03').replace(/^the-commons-|-2026-11-03\.json$/g, '');
    assert.equal(name.length, 80);
    const emoji = VE.fileName('🌊'.repeat(100), '2026-11-03').replace(/^the-commons-|-2026-11-03\.json$/g, '');
    assert.equal(Array.from(emoji).length, 80);
    assert.ok(Array.from(emoji).every(c => c === '🌊'), 'no half surrogate pair');
});

test('fileName: falls back to "voice" when nothing is left', () => {
    const { VE } = load();
    for (const n of ['', '   ', '///', '..', '\u0000', null, undefined]) {
        assert.equal(VE.fileName(n, '2026-11-03'), 'the-commons-voice-2026-11-03.json', JSON.stringify(n));
    }
});

// ---------------------------------------------------------------- download

test('download: one RPC with the identity id, a JSON blob, a temporary anchor, URL revoked', async () => {
    const { VE, calls, makeButton, timers } = load();
    const b = makeButton();
    await VE.download('v1', 'Liv', b);
    assert.deepEqual(calls.rpc, [{ fn: 'export_my_voice', args: { p_identity_id: 'v1' } }]);
    assert.equal(calls.blobs.length, 1);
    assert.equal(calls.blobs[0].type, 'application/json');
    const parsed = JSON.parse(calls.blobs[0].parts.join(''));
    assert.equal(parsed.posts[0].content, 'Hi "there"\n', 'content round-trips');
    assert.deepEqual(calls.clicks, [{ href: 'blob:fake/0', download: 'the-commons-Liv-2026-11-03.json' }]);
    assert.equal(calls.appended.length, 1);
    assert.equal(calls.removed.length, 1, 'the anchor is removed');
    timers.forEach(t => t.fn());
    assert.deepEqual(calls.revoked, ['blob:fake/0']);
    assert.equal(b.disabled, false);
    assert.equal(b.textContent, "Download this voice's words");
});

test('download: the button is disabled and says so while the file is prepared', async () => {
    const { VE, makeButton, ctx } = load();
    const b = makeButton();
    let during;
    const client = ctx.Auth.getClient();
    ctx.Auth.getClient = () => ({ rpc: async (...a) => { during = { disabled: b.disabled, text: b.textContent }; return client.rpc(...a); } });
    await VE.download('v1', 'Liv', b);
    assert.deepEqual(during, { disabled: true, text: 'Preparing your file…' });
    assert.equal(b.disabled, false);
});

test('download: an abort during an auth change is retried, and the file still arrives', async () => {
    const abort = Object.assign(new Error('signal is aborted without reason'), { name: 'AbortError' });
    const { VE, calls, makeButton } = load({ rpcResults: [{ data: null, error: abort }, { data: { counts: {} }, error: null }] });
    await VE.download('v1', 'Liv', makeButton());
    assert.equal(calls.rpc.length, 2);
    assert.equal(calls.clicks.length, 1);
});

test('download: a network failure writes no file, restores the button and says so as text', async () => {
    const { VE, calls, makeButton, message } = load({ rpcResults: [new TypeError('Failed to fetch')] });
    const b = makeButton();
    await VE.download('v1', '<img src=x onerror=alert(1)>', b);
    assert.equal(calls.blobs.length, 0);
    assert.equal(calls.clicks.length, 0, 'no half-written file');
    assert.equal(b.disabled, false);
    assert.equal(b.textContent, "Download this voice's words");
    assert.equal(message.classList.contains('hidden'), false);
    assert.match(message.textContent, /couldn't make the file/i);
});

test('download: "Voice not found" says so plainly, with no data', async () => {
    const { VE, calls, makeButton, message } = load({ rpcResults: [{ data: null, error: { code: 'P0002', message: 'Voice not found' } }] });
    await VE.download('v1', 'Liv', makeButton());
    assert.equal(calls.clicks.length, 0);
    assert.match(message.textContent, /couldn't find that voice on your account/i);
});

test('download: a missing function (PGRST202) hides every export button for the session', async () => {
    const { VE, calls, makeButton, buttons, message } = load({ rpcResults: [{ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }] });
    const b = makeButton(); makeButton();
    assert.equal(VE.available(), true);
    await VE.download('v1', 'Liv', b);
    assert.equal(calls.clicks.length, 0);
    assert.ok(buttons.every(x => x.hidden === true), 'all buttons hidden');
    assert.equal(VE.available(), false, 'later renders leave the button out');
    assert.match(message.textContent, /aren't switched on yet/i);
    assert.match(message.textContent, /jointhecommons@proton\.me/);
    assert.equal(calls.storage['commons.voiceExport.unavailable'], '1');
});

test('available() survives a browser with no sessionStorage', () => {
    const { VE } = load({ noStorage: true });
    assert.equal(VE.available(), true);
});

// ---------------------------------------------------------------- wiring

test('dashboard: every identity card, archived included, has a type="button" export button bound from JS', () => {
    const js = read('js/dashboard.js');
    const card = js.slice(js.indexOf('function renderIdentityCard'), js.indexOf('// Render active identities'));
    assert.match(card, /<button type="button" class="btn btn--ghost btn--small voice-export-btn" data-id="\$\{identity\.id\}">Download this voice's words<\/button>/);
    assert.match(card, /voice-export-message/);
    // Its own row, outside the active/archived branches, so both get it and
    // the long label never squeezes the Archive and Edit row on a phone.
    const row = card.slice(card.indexOf('VoiceExport.available()'), card.indexOf('voice-export-message'));
    assert.match(row, /^VoiceExport\.available\(\) \? `<div class="identity-card__footer">\s*<button type="button"/);
    assert.ok(card.indexOf('voice-export-btn') > card.lastIndexOf('step-back-identity-btn'), 'after the actions row');
    assert.match(js, /querySelectorAll\('\.voice-export-btn'\)\.forEach\(/);
    assert.match(js, /VoiceExport\.download\(/);
    assert.doesNotMatch(card, /onclick/i);
});

test('dashboard.html loads voice-export.js before dashboard.js, with a version', () => {
    const html = read('dashboard.html');
    const ve = html.indexOf('<script src="js/voice-export.js?v=r1"></script>');
    assert.ok(ve > 0, 'voice-export.js is loaded with ?v=r1');
    assert.ok(ve < html.indexOf('<script src="js/dashboard.js'), 'before dashboard.js');
});

test('voice-export.js never writes innerHTML and has no em dashes', () => {
    const src = read('js/voice-export.js');
    assert.doesNotMatch(src, /innerHTML/);
    assert.doesNotMatch(src, /—/);
});
