// A new facilitator account no longer gets the part of its email before the @
// as its public name (sweep F07-data, option A, 2026-10-22). This covers:
//  - seeding: js/auth.js creates the row with no display_name;
//  - the shared helpers on Auth (fallback, nudge condition, name check);
//  - fallback rendering where a facilitator's name is shown or copied:
//    the thread header, search, moment comments, the profile line;
//  - the inline ask on moment.html when commenting as yourself;
//  - the dashboard nudge's copy and wiring;
//  - the database patch and its dry run (house style; never run here).
// The interest-room ask is in tests/interest-room.test.js. No network.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sandbox: fakeDomSandbox } = require('./lib/fake-dom');

const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const lf = s => s.replace(/\r\n/g, '\n');
const quiet = { log() {}, warn() {}, error() {} };

function loadAuth() {
    const sandbox = { window: {}, console: quiet, setTimeout, clearTimeout };
    vm.runInNewContext(read('js/auth.js'), sandbox, { filename: 'js/auth.js' });
    return sandbox.window.Auth;
}

const flush = async () => {
    for (let i = 0; i < 30; i++) await new Promise(resolve => setImmediate(resolve));
};

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

function fakeFacilitatorsClient({ existing = null } = {}) {
    const inserts = [];
    const client = {
        from(table) {
            return {
                select() { return this; },
                eq() { return this; },
                maybeSingle: async () => ({ data: existing, error: null }),
                insert(row) { inserts.push({ table, row: { ...row } }); return this; },
                single: async () => ({ data: { ...inserts[inserts.length - 1].row, display_name: null }, error: null })
            };
        }
    };
    return { client, inserts };
}

test('a new account row is inserted with id and email only, so it starts with no public name', async () => {
    const auth = loadAuth();
    const { client, inserts } = fakeFacilitatorsClient();
    auth.user = { id: 'fac-new', email: 'Private.Person@example.com' };
    auth.getClient = () => client;
    const created = await auth.createFacilitator();
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].table, 'facilitators');
    assert.deepEqual(Object.keys(inserts[0].row).sort(), ['email', 'id']);
    assert.equal(created.display_name, null);
    assert.equal(auth.facilitator, created);
});

test('the first page load of a signed-in account with no row creates it the same way', async () => {
    const auth = loadAuth();
    const { client, inserts } = fakeFacilitatorsClient({ existing: null });
    auth.user = { id: 'fac-new', email: 'private.person@example.com' };
    auth.getClient = () => client;
    await auth.loadFacilitator();
    assert.equal(inserts.length, 1);
    assert.equal('display_name' in inserts[0].row, false);
});

test('an existing row is loaded as it is, never renamed (the 182 email-derived names stay)', async () => {
    const auth = loadAuth();
    const row = { id: 'fac-old', email: 'private.person@example.com', display_name: 'private.person' };
    const { client, inserts } = fakeFacilitatorsClient({ existing: row });
    auth.user = { id: 'fac-old', email: row.email };
    auth.getClient = () => client;
    const loaded = await auth.loadFacilitator();
    assert.equal(inserts.length, 0);
    assert.equal(loaded.display_name, 'private.person');
});

test('auth.js never derives a name from the email anywhere', () => {
    const source = read('js/auth.js');
    assert.ok(!/email\.split\(\s*['"]@/.test(source), 'no email.split("@") in auth.js');
    assert.ok(!/display_name\s*:[^,\n}]*email/.test(source), 'no display_name built from an email');
});

// ---------------------------------------------------------------------------
// Helpers on Auth
// ---------------------------------------------------------------------------

test('hasPublicName and publicNameOf: a missing or blank name is "A facilitator", a real one is verbatim', () => {
    const auth = loadAuth();
    assert.equal(auth.PUBLIC_NAME_FALLBACK, 'A facilitator');
    for (const display_name of [null, undefined, '', '   ', 42]) {
        assert.equal(auth.hasPublicName({ display_name }), false, JSON.stringify(display_name));
        assert.equal(auth.publicNameOf({ display_name }), 'A facilitator', JSON.stringify(display_name));
    }
    assert.equal(auth.hasPublicName(null), false);
    assert.equal(auth.publicNameOf(null), null, 'no row yet: the caller must not write');
    assert.equal(auth.hasPublicName({ display_name: 'Wren' }), true);
    assert.equal(auth.publicNameOf({ display_name: ' Wren ' }), ' Wren ', 'verbatim: intro_household() matches it exactly');
});

test('publicNameNudge: unset, or the start of the account\'s own email, case-insensitively; nothing else', () => {
    const auth = loadAuth();
    const email = 'Private.Person@Example.com';
    assert.equal(auth.publicNameNudge(null, email), null, 'no row, no nudge');
    assert.equal(auth.publicNameNudge({ display_name: null }, email), 'unset');
    assert.equal(auth.publicNameNudge({ display_name: '  ' }, email), 'unset');
    assert.equal(auth.publicNameNudge({ display_name: null }, null), 'unset');
    assert.equal(auth.publicNameNudge({ display_name: 'private.person' }, email), 'email');
    assert.equal(auth.publicNameNudge({ display_name: ' PRIVATE.PERSON ' }, email), 'email');
    assert.equal(auth.publicNameNudge({ display_name: 'private' }, email), null, 'a prefix is not a match');
    assert.equal(auth.publicNameNudge({ display_name: 'Wren' }, email), null);
    assert.equal(auth.publicNameNudge({ display_name: 'Wren' }, null), null, 'no email to compare: a set name stands');
    assert.equal(auth.publicNameNudge({ display_name: 'Wren' }, '@nolocal.example'), null);
});

test('checkPublicName trims, caps at 50, and refuses the fallback label and email addresses', () => {
    const auth = loadAuth();
    const ok = input => auth.checkPublicName(input).name;
    const refused = input => auth.checkPublicName(input).error;
    assert.equal(ok('  Wren of the Hedge  '), 'Wren of the Hedge');
    assert.equal(ok('x'.repeat(50)), 'x'.repeat(50));
    assert.equal(ok('@wren'), '@wren', 'a handle is fine');
    assert.equal(ok('Wren & Co <3'), 'Wren & Co <3', 'escaping is the renderer\'s job, not this check\'s');
    assert.ok(refused(''));
    assert.ok(refused('   '));
    assert.ok(refused(null));
    assert.match(refused('x'.repeat(51)), /50/);
    assert.match(refused('A Facilitator'), /no name is set/);
    assert.match(refused(' a facilitator '), /no name is set/);
    assert.match(refused('wren@example.com'), /email/);
    for (const input of ['', 'x'.repeat(51), 'A facilitator', 'wren@example.com']) {
        assert.equal(auth.checkPublicName(input).name, undefined, input);
    }
});

// ---------------------------------------------------------------------------
// Fallback rendering
// ---------------------------------------------------------------------------

const escapeAll = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => '&#' + ch.charCodeAt(0) + ';');

test('the thread header says "Started by A facilitator" when created_by is missing, and keeps every real value', () => {
    const source = read('js/discussion.js');
    const match = source.match(/Started by \$\{([\s\S]*?)\} ·/);
    assert.ok(match, 'the "Started by" line is still one template expression');
    const startedBy = new Function('Utils', 'currentDiscussion', 'return ' + match[1]);
    const Utils = { escapeHtml: escapeAll };
    for (const created_by of [null, undefined, '', '   ']) {
        assert.equal(startedBy(Utils, { created_by }), 'A facilitator', JSON.stringify(created_by));
    }
    for (const created_by of ['Wren', 'claude-sonnet', 'The Commons', '[deleted]']) {
        assert.equal(startedBy(Utils, { created_by }), created_by);
    }
    assert.equal(startedBy(Utils, { created_by: '<b>x</b>' }), '&#60;b&#62;x&#60;/b&#62;', 'still escaped');
    assert.ok(!/created_by \|\| 'unknown'/.test(source), 'the old "unknown" fallback is gone');
});

test('search names a discussion with no created_by "A facilitator"; posts keep "Anonymous"', () => {
    const source = read('js/search.js');
    const block = source.match(/type: 'discussion',[\s\S]*?name: ([^\n]+)\n/);
    assert.ok(block, 'the discussion result still sets name from one expression');
    const nameOf = new Function('d', 'return ' + block[1]);
    for (const created_by of [null, undefined, '', '  ']) {
        assert.equal(nameOf({ created_by }), 'A facilitator', JSON.stringify(created_by));
    }
    assert.equal(nameOf({ created_by: 'Wren' }), 'Wren');
    assert.ok(source.includes("const nameText = item.name ? Utils.escapeHtml(item.name) : 'Anonymous';"),
        'the shared fallback for posts is unchanged');
});

test('the profile "Facilitated by" line is hidden for a missing or blank name, and trimmed otherwise', () => {
    const s = fakeDomSandbox({ CONFIG: { api: { discussions: 'discussions' } } });
    s.context.location = { search: '' };
    Object.assign(s.context.Utils, { showError() {}, get: async () => [] });
    vm.runInContext(read('js/profile.js') + '\nglobalThis.__helpers = ProfileHelpers;', s.context, { filename: 'js/profile.js' });
    const { facilitatorLine } = s.context.__helpers;
    for (const value of [null, undefined, '', '   ', 42]) {
        assert.equal(facilitatorLine(value), null, JSON.stringify(value));
    }
    assert.equal(facilitatorLine('  Wren '), 'Facilitated by Wren');
    const source = read('js/profile.js');
    assert.match(source, /ProfileHelpers\.facilitatorLine\(data\)/, 'loadFacilitatorName goes through it');
    assert.match(source, /rpc\('get_identity_facilitator_name'/, 'the RPC (and its anon EXECUTE) is still what it calls');
});

// ---------------------------------------------------------------------------
// moment.js: comment fallback and the inline ask
// ---------------------------------------------------------------------------

function makeEl(elementId) {
    return {
        id: elementId, hidden: false, disabled: false, value: '', textContent: '', innerHTML: '',
        style: {}, dataset: {}, listeners: {},
        addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
    };
}

function loadMoment({ facilitator, saveFails = false, identities = [] } = {}) {
    const realAuth = loadAuth();
    const els = {};
    const el = key => (els[key] = els[key] || makeEl(key));
    el('comment-public-name-group').hidden = true; // as in moment.html
    const saves = [];
    const posts = [];
    const log = [];
    const Auth = {
        PUBLIC_NAME_FALLBACK: realAuth.PUBLIC_NAME_FALLBACK,
        PUBLIC_NAME_MAX_LENGTH: realAuth.PUBLIC_NAME_MAX_LENGTH,
        hasPublicName: realAuth.hasPublicName,
        publicNameOf: realAuth.publicNameOf,
        checkPublicName: realAuth.checkPublicName,
        user: { id: 'fac-1', email: 'private.person@example.com' },
        facilitator,
        isLoggedIn: () => true,
        getMyIdentities: async () => identities,
        async updateFacilitator(updates) {
            saves.push({ ...updates });
            log.push('save');
            if (saveFails) throw new Error('network down');
            this.facilitator = { ...this.facilitator, ...updates };
            return this.facilitator;
        }
    };
    const sandbox = {
        window: {},
        document: {
            getElementById: el,
            querySelector: () => null,
            addEventListener() {}
        },
        URLSearchParams,
        Auth,
        CONFIG: { api: { moment_comments: 'moment_comments', ai_identities: 'ai_identities' } },
        Utils: {
            escapeHtml: escapeAll,
            formatContent: escapeAll,
            formatRelativeTime: () => 'just now',
            getModelClass: () => 'claude',
            showLoading() {}, showEmpty() {}, showError() {},
            get: async () => [],
            withRetry: fn => fn(),
            post: async (endpoint, payload) => { posts.push({ endpoint, payload: { ...payload } }); log.push('post'); return [payload]; }
        },
        alert() {},
        console: quiet,
        setTimeout, clearTimeout, Promise, Set, Map, JSON, Object, Array, String
    };
    vm.runInNewContext(read('js/moment.js'), sandbox, { filename: 'js/moment.js' });
    return {
        sandbox, els, saves, posts, log, Auth,
        async comment(text, name) {
            el('comment-input').value = text;
            if (name !== undefined) el('comment-public-name').value = name;
            for (const fn of el('comment-submit').listeners.click || []) await fn();
        },
        async chooseVoice(value) {
            for (const fn of el('comment-as-select').listeners.change || []) fn({ target: { value } });
        }
    };
}

test('a moment comment shows its name, "A facilitator" for a facilitator with none, "Anonymous" otherwise', () => {
    const m = loadMoment({ facilitator: { display_name: 'Wren' } });
    const render = c => m.sandbox.renderComment({ created_at: '2026-10-22T00:00:00Z', content: 'hi', ...c }, {});
    assert.match(render({ display_name: 'Wren', user_id: 'fac-1' }), /comment__author">Wren</);
    assert.match(render({ display_name: null, user_id: 'fac-1' }), />A facilitator</);
    assert.match(render({ display_name: '   ', user_id: 'fac-1' }), />A facilitator</);
    assert.match(render({ display_name: null, user_id: null }), />Anonymous</);
    assert.doesNotMatch(render({ display_name: null, user_id: 'fac-1' }), /null|undefined|fac-1/);
});

test('commenting as yourself with no public name: the field shows, a typed name is saved first and used', async () => {
    const m = loadMoment({ facilitator: { display_name: null } });
    m.sandbox.setupCommentForm('moment-1');
    await flush();
    assert.equal(m.els['comment-public-name-group'].hidden, false);
    assert.match(m.els['comment-as-selector'].innerHTML, /<option value="self">Myself</);
    await m.comment('A thought.', '  Wren  ');
    assert.deepEqual(m.saves, [{ display_name: 'Wren' }]);
    assert.deepEqual(m.log, ['save', 'post'], 'saved before the comment is written');
    assert.equal(m.posts[0].payload.display_name, 'Wren');
    assert.equal(m.posts[0].payload.user_id, 'fac-1');
    assert.equal(m.els['comment-public-name-group'].hidden, true, 'asked once');
});

test('skipping the name posts the comment as "A facilitator" and saves nothing', async () => {
    const m = loadMoment({ facilitator: { display_name: null } });
    m.sandbox.setupCommentForm('moment-1');
    await flush();
    await m.comment('A thought.', '');
    assert.deepEqual(m.saves, []);
    assert.equal(m.posts.length, 1);
    assert.equal(m.posts[0].payload.display_name, 'A facilitator');
    assert.doesNotMatch(JSON.stringify(m.posts[0].payload), /private|@|Anonymous/);
});

test('a refused name, or a failed save, writes no comment', async () => {
    for (const name of ['A facilitator', 'me@example.com']) {
        const m = loadMoment({ facilitator: { display_name: null } });
        m.sandbox.setupCommentForm('moment-1');
        await flush();
        await m.comment('A thought.', name);
        assert.deepEqual(m.saves, [], name);
        assert.equal(m.posts.length, 0, name);
        assert.ok(m.els['comment-public-name-error'].textContent, name);
    }
    const failing = loadMoment({ facilitator: { display_name: null }, saveFails: true });
    failing.sandbox.setupCommentForm('moment-1');
    await flush();
    await failing.comment('A thought.', 'Wren');
    assert.equal(failing.posts.length, 0);
    assert.match(failing.els['comment-public-name-error'].textContent, /not posted/);
    assert.equal(failing.els['comment-submit'].disabled, false);
});

test('a facilitator with a name, or a comment as a voice, is never asked', async () => {
    const named = loadMoment({ facilitator: { display_name: 'Wren' } });
    named.sandbox.setupCommentForm('moment-1');
    await flush();
    assert.equal(named.els['comment-public-name-group'].hidden, true);
    await named.comment('A thought.', 'Someone Else');
    assert.deepEqual(named.saves, []);
    assert.equal(named.posts[0].payload.display_name, 'Wren');

    const voiced = loadMoment({ facilitator: { display_name: null }, identities: [{ id: 'voice-1', name: 'Sol', model: 'Claude' }] });
    voiced.sandbox.setupCommentForm('moment-1');
    await flush();
    assert.equal(voiced.els['comment-public-name-group'].hidden, false);
    await voiced.chooseVoice('voice-1');
    assert.equal(voiced.els['comment-public-name-group'].hidden, true, 'a voice has its own name');
    await voiced.comment('A thought.', 'Wren');
    assert.deepEqual(voiced.saves, []);
    assert.equal(voiced.posts[0].payload.ai_identity_id, 'voice-1');
    assert.equal('display_name' in voiced.posts[0].payload, false);
});

test('moment.js never falls back to "Anonymous" for a facilitator commenting as themselves', () => {
    const source = read('js/moment.js');
    assert.ok(!/display_name\s*\|\|\s*'Anonymous'/.test(source));
});

// ---------------------------------------------------------------------------
// Dashboard nudge
// ---------------------------------------------------------------------------

function loadOnboarding() {
    const sandbox = { window: {}, console, Date, URL, URLSearchParams, setTimeout, clearTimeout };
    vm.runInNewContext(read('js/dashboard-onboarding.js'), sandbox, { filename: 'js/dashboard-onboarding.js' });
    return sandbox.window.DashboardOnboarding;
}

test('the nudge copy exists for "unset" and "email" only, and names no email', () => {
    const O = loadOnboarding();
    const unset = O.publicNameNudgeText('unset');
    const fromEmail = O.publicNameNudgeText('email');
    assert.match(unset, /not picked a public name/);
    assert.match(unset, /"A facilitator"/);
    assert.match(fromEmail, /start of your email address/);
    for (const text of [unset, fromEmail]) assert.doesNotMatch(text, /@/);
    assert.equal(O.publicNameNudgeText(null), null);
    assert.equal(O.publicNameNudgeText('toString'), null, 'only its own keys');
    assert.equal(O.publicNameNudgeKey('fac-1'), 'tc_public_name_nudge_dismissed_fac-1');
});

test('nudge condition end to end: who sees which copy', () => {
    const auth = loadAuth();
    const O = loadOnboarding();
    const email = 'private.person@example.com';
    const copyFor = display_name => O.publicNameNudgeText(auth.publicNameNudge({ display_name }, email));
    assert.match(copyFor(null), /not picked/, 'a new account');
    assert.match(copyFor('Private.Person'), /email address/, 'one of the 182 seeded names');
    assert.equal(copyFor('Wren'), null, 'a chosen name');
});

test('dashboard.js wires the nudge: client-side compare, textContent, guarded storage, hidden on save', () => {
    const source = read('js/dashboard.js');
    const start = source.indexOf('const syncPublicNameNudge = () => {');
    const end = source.indexOf("window.addEventListener('authStateChanged', syncPublicNameNudge);");
    assert.ok(start > 0 && end > start, 'the nudge is built in one function and re-synced on authStateChanged');
    const block = source.slice(start, end);
    assert.ok(block.includes('Auth.publicNameNudge(current, user && user.email)'), 'compares against the session email');
    assert.ok(block.includes('DashboardOnboarding.publicNameNudgeText(kind)'));
    assert.ok(block.includes('copy.textContent = text;'), 'copy goes in as text');
    assert.ok(!/innerHTML/.test(block), 'no innerHTML in the nudge');
    assert.equal((block.match(/email/g) || []).length, 1, 'the email is only passed to the compare, never rendered');
    assert.match(source, /try \{ return localStorage\.getItem\(nudgeKey\) === '1'; \} catch/);
    assert.match(source, /try \{ localStorage\.setItem\(nudgeKey, '1'\); \} catch/);
    assert.match(source, /Auth\.checkPublicName\(newName\)/, 'the dashboard save refuses the label and emails too');
    assert.match(source, /Utils\.withRetry\(\(\) => Auth\.updateFacilitator\(\{ display_name: checked\.name \}\)\)/);
    assert.match(source, /publicNameSaved = true;\s*removePublicNameNudge\(\);/);
});

test('the dashboard help text says new accounts start without a name', () => {
    const html = read('dashboard.html');
    const help = html.match(/<input type="text" id="display-name"[^>]*>\s*<p class="form-help">([^<]*)<\/p>/);
    assert.ok(help, 'help text sits under the display-name input');
    assert.match(help[1], /New accounts start without one/);
    assert.match(help[1], /"A facilitator"/);
    assert.match(help[1], /Facilitated by/);
});

// ---------------------------------------------------------------------------
// The database patch (never run by tests)
// ---------------------------------------------------------------------------

test('facilitator-public-name.sql: house style, no DROP, the dry run carries it verbatim and rolls back', () => {
    const patch = lf(read('sql/patches/facilitator-public-name.sql'));
    const dryrun = lf(read('sql/patches/facilitator-public-name.dryrun.sql'));
    for (const header of ['-- What:', '-- Why:', '-- Risk:']) assert.ok(patch.includes(header), header);
    assert.match(patch, /^-- Applied: (PENDING|\d{4}-\d{2}-\d{2}\b.*)$/m);
    const code = patch.replace(/^\s*--.*$/gm, '');
    assert.ok(!/\bDROP\b/i.test(code), 'the patch drops nothing');
    assert.ok(!/\bUPDATE\s+public\.facilitators\b/i.test(code), 'no existing facilitator row is rewritten');
    assert.ok(!/\bREVOKE\b/i.test(code), 'no grant is taken away (get_identity_facilitator_name keeps anon EXECUTE)');
    assert.ok(!/get_identity_facilitator_name/.test(code), 'get_identity_facilitator_name is not touched');
    assert.match(code, /BEFORE INSERT ON public\.facilitators/);
    assert.ok(!/BEFORE (INSERT OR )?UPDATE/i.test(code), 'the trigger never fires on UPDATE');
    assert.match(code, /CREATE OR REPLACE FUNCTION public\.intro_household\(p_discussion_id uuid\)\s*RETURNS uuid\s*LANGUAGE sql STABLE SECURITY DEFINER\s*SET search_path = public, extensions/,
        'intro_household keeps its signature, return type and settings');

    const body = patch.slice(patch.indexOf('-- (A) a new row never starts'));
    const begin = dryrun.indexOf('\nBEGIN;\n');
    const check = dryrun.indexOf('DO $dryrun$');
    assert.ok(begin > 0 && check > begin, 'BEGIN comes before the DRYRUN block');
    assert.ok(dryrun.slice(begin, check).includes(body), 'the patch body is in the dry run verbatim');
    assert.match(dryrun, /RAISE EXCEPTION 'DRYRUN PASS /);
    assert.match(dryrun, /RAISE EXCEPTION 'DRYRUN FAIL /);
    assert.match(dryrun, /\nROLLBACK;\n?$/);
});

test('intro_household path 2b credits an opener who picked a name afterwards, and the dry run proves it', () => {
    const patch = lf(read('sql/patches/facilitator-public-name.sql'));
    const dryrun = lf(read('sql/patches/facilitator-public-name.dryrun.sql'));
    const code = patch.replace(/^\s*--.*$/gm, '');
    const p2b = code.slice(code.indexOf('WHERE d.unnamed'), code.indexOf('WHERE NOT d.unnamed\n        AND f.display_name = d.created_by'));
    assert.ok(p2b.length > 0, 'path 2b is found');
    assert.match(p2b, /ai\.name = d\.proposed_by_name/);
    assert.match(p2b, /ai\.created_at <= d\.created_at/);
    assert.match(p2b, /HAVING count\(DISTINCT ai\.facilitator_id\) = 1/);
    assert.ok(!/display_name/.test(p2b), 'path 2b does not look at the display_name the opener has today');

    // The specimen the review asked for, and the ambiguity it trades for.
    assert.match(dryrun, /\(2, 't_renamed',\s+'A facilitator', v_voice_f\)/);
    assert.match(dryrun, /\(v_f_renamed, 'dryrun\.fpn\.renamed\.' \|\| v_tag \|\| '@example\.invalid', v_renamed\)/);
    assert.match(dryrun, /'t_renamed=renamed'/);
    assert.match(dryrun, /'t_ambig=NULL'/);
    assert.match(dryrun, /'t_labelvoice=NULL'/);
});

test('the dry run reads the live catalog for other writers of facilitators and email cutters, and fails on either', () => {
    const dryrun = lf(read('sql/patches/facilitator-public-name.dryrun.sql'));
    const check = dryrun.slice(dryrun.indexOf('DO $dryrun$'));
    assert.match(check, /pg_get_functiondef\(p\.oid\)/, 'function bodies via pg_get_functiondef (BEGIN ATOMIC too)');
    assert.match(check, /n\.nspname NOT IN \('pg_catalog', 'information_schema'\)/);
    assert.ok(check.includes(String.raw`'\m(insert|merge)\s+into\s+("?public"?\s*\.\s*)?"?facilitators\M'`),
        'any function that INSERTs or MERGEs into facilitators is found');
    assert.match(check, /FROM pg_views v/);
    assert.match(check, /FROM pg_matviews m/);
    assert.match(check, /split_part\|substring/);
    assert.match(check, /p\.oid <> 'public\.facilitators_no_email_name\(\)'::regprocedure/, 'the guard itself is not a finding');
    assert.match(check, /AND cardinality\(v_fac_inserters\) = 0/);
    assert.match(check, /AND cardinality\(v_email_splitters\) = 0/);
    assert.match(check, /functions_inserting_facilitators=%s email_splitters_reading_facilitators=%s/);
    // Read-only: nothing in the catalog step writes or calls what it finds.
    const step7 = check.slice(check.indexOf('-- 7.'), check.indexOf('-- 8.'));
    assert.ok(!/\b(INSERT|UPDATE|DELETE|EXECUTE|PERFORM)\b/.test(step7.replace(/^\s*--.*$/gm, '').replace(/'[^']*'/g, "''")),
        'step 7 only reads');
});
