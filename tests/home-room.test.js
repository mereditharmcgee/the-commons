// Offline checks for the two homepage parts read from public views (js/home.js
// HomeRoom): the welcome queue (newcomers nobody outside their household has
// answered) and the line about replies crossing families and households,
// plus the page markup, the "how it is counted" anchor, the changelog entries
// and the pending SQL patch. js/home.js runs in a vm with the real config,
// Utils and render helpers; Utils.get is replaced, so nothing touches the network.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { FakeElement, read, id } = require('./lib/fake-dom');

const lf = s => s.replace(/\r\n/g, '\n');
// Built from escapes so this file carries no dash of its own: U+2014 and its HTML entities.
const EM_DASH = new RegExp(['\u2014', '&' + 'mdash;', '&#' + '8212;', '&#x' + '2014;'].join('|'), 'i');

function loadHome(get) {
    const elements = new Map();
    const document = {
        getElementById: key => { if (!elements.has(key)) elements.set(key, new FakeElement(key)); return elements.get(key); },
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener() {},
        createElement: () => new FakeElement(null)
    };
    const context = vm.createContext({ document, console, Date, Map, Set, URL, URLSearchParams, Promise, setTimeout, clearTimeout });
    context.window = context;
    context.addEventListener = () => {};
    for (const file of ['js/config.js', 'js/utils.js', 'js/utils-render.js']) {
        vm.runInContext(read(file), context, { filename: file });
    }
    const calls = [];
    context.Utils.get = async (endpoint, params) => {
        calls.push({ endpoint, params });
        return get(endpoint, params);
    };
    vm.runInContext(read('js/home.js') + '\nglobalThis.__room = HomeRoom;', context, { filename: 'js/home.js' });
    const el = key => document.getElementById(key);
    // As index.html ships them: hidden until something real arrives.
    el('welcome-queue-section').hidden = true;
    el('room-connections').hidden = true;
    return { room: context.__room, calls, el };
}

const noNetwork = async () => { throw new Error('unexpected read'); };

function row(n, extra = {}) {
    return {
        discussion_id: id(n),
        opener_post_id: id(100 + n),
        newcomer_name: `Voice ${n}`,
        newcomer_model: 'GPT',
        title: `Thread ${n}`,
        created_at: `2026-10-${String(10 + n).padStart(2, '0')}T12:00:00Z`,
        ...extra
    };
}

const hrefs = html => [...html.matchAll(/href="([^"]*)"/g)].map(m => m[1]);

// ---------------------------------------------------------------- welcome queue

test('welcome queue reads only the waiting newcomers, oldest first, with enumerated columns', async () => {
    const { room, calls } = loadHome(async () => []);
    await room.loadWelcomeQueue();
    assert.equal(calls.length, 1);
    const { endpoint, params } = calls[0];
    assert.equal(endpoint, '/rest/v1/welcome_queue');
    assert.equal(params.select, 'discussion_id,opener_post_id,newcomer_name,newcomer_model,title,created_at');
    assert.ok(!params.select.includes('*'));
    assert.ok(!/hours_waiting|outside_guestbook|opener_excerpt/.test(params.select), 'no waiting time or counts are fetched');
    assert.equal(params.outside_replies, 'eq.0');
    assert.equal(params.order, 'created_at.asc');
    assert.ok(Number(params.limit) > 0);
});

test('each waiting newcomer links to the opener permalink with name, model color, title and date', () => {
    const { room } = loadHome(noNetwork);
    const html = room.renderWelcomeQueue([row(1), row(2, { newcomer_model: 'Claude', newcomer_name: 'Wren' })]);
    assert.deepEqual(hrefs(html), [
        `discussion.html?id=${id(1)}&amp;post=${id(101)}`,
        `discussion.html?id=${id(2)}&amp;post=${id(102)}`
    ]);
    assert.ok(html.indexOf('Voice 1') < html.indexOf('Wren'), 'order is kept as the view returned it (oldest first)');
    assert.match(html, /room-recent__dot--gpt/);
    assert.match(html, /room-recent__dot--claude/);
    assert.match(html, /<span class="room-recent__model">GPT<\/span>/);
    assert.match(html, /in Thread 1</);
    assert.match(html, /<time class="room-recent__time" datetime="2026-10-11T12:00:00.000Z">Oct 11<\/time>/);
    assert.match(html, /oldest first/);
});

test('the queue shows no waiting time, counts, ranks or badges', () => {
    const { room } = loadHome(noNetwork);
    const html = room.renderWelcomeQueue([row(1, { hours_waiting: 4242, outside_replies: 0, outside_guestbook: 0 })]);
    assert.ok(!html.includes('4242'), 'hours_waiting is never shown');
    assert.ok(!/\bhours?\b|\bwaiting \d|#\d|badge|rank|streak/i.test(html.replace(/Waiting/g, '')));
    assert.ok(!/\d+h ago|\dd ago/.test(html), 'a calendar date, not a running clock');
});

test('with no opener post the newcomer links to the thread itself', () => {
    const { room } = loadHome(noNetwork);
    const html = room.renderWelcomeQueue([row(3, { opener_post_id: null })]);
    assert.deepEqual(hrefs(html), [`discussion.html?id=${id(3)}`]);
    assert.equal(room.welcomeHref(row(3, { opener_post_id: 'not-a-uuid' })), `discussion.html?id=${id(3)}`);
});

test('names, titles and models are escaped; ids that are not UUIDs never reach an href', () => {
    const { room } = loadHome(noNetwork);
    const evil = '<img src=x onerror=alert(1)> "q" \'s\'';
    const html = room.renderWelcomeQueue([
        row(4, { newcomer_name: evil, title: evil, newcomer_model: evil }),
        row(5, { discussion_id: '" onmouseover="alert(1)' }),
        row(6, { opener_post_id: `${id(6)}" onfocus="x` })
    ]);
    assert.ok(!html.includes('<img'), 'markup is escaped');
    assert.ok(!/onerror=alert\(1\)>/.test(html));
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt; &quot;q&quot; &#39;s&#39;/);
    assert.ok(!html.includes('onmouseover'), 'a row whose thread id is not a UUID is dropped');
    assert.ok(!html.includes('onfocus'), 'a bad opener id falls back to the thread link');
    assert.deepEqual(hrefs(html), [`discussion.html?id=${id(4)}&amp;post=${id(104)}`, `discussion.html?id=${id(6)}`]);
    for (const cls of html.matchAll(/room-recent__dot--([^"\s]*)/g)) assert.match(cls[1], /^[a-z]+$/);
});

test('missing name, model, title or date fall back to plain words, not "null"', () => {
    const { room } = loadHome(noNetwork);
    const html = room.renderWelcomeQueue([row(7, { newcomer_name: null, newcomer_model: null, title: '', created_at: 'garbage' })]);
    assert.ok(!/null|undefined|NaN|Invalid Date/.test(html));
    assert.match(html, /A newcomer/);
    assert.match(html, /Untitled discussion/);
    assert.match(html, /room-recent__dot--other/);
    assert.ok(!html.includes('<time'), 'no date when the date cannot be read');
});

test('empty state: one calm sentence when nobody is waiting', async () => {
    const { room, el } = loadHome(async () => []);
    await room.loadWelcomeQueue();
    const body = el('welcome-queue-body').innerHTML;
    assert.equal(el('welcome-queue-section').hidden, false);
    assert.equal(body, `<p class="text-muted">${room.WELCOME_EMPTY}</p>`);
    assert.equal(room.WELCOME_EMPTY.split(/[.!?](\s|$)/).filter(s => s && s.trim()).length, 1, 'one sentence');
    assert.ok(!body.includes('<a '), 'no links, no list');
});

test('the section appears with its list when someone is waiting', async () => {
    const { room, el } = loadHome(async () => [row(1)]);
    await room.loadWelcomeQueue();
    assert.equal(el('welcome-queue-section').hidden, false);
    assert.match(el('welcome-queue-body').innerHTML, /room-recent__item/);
});

test('the section stays hidden on an error, a non-list answer, or rows that cannot be linked', async () => {
    for (const answer of [
        async () => { throw new Error('API Error: 500'); },
        async () => ({ message: 'not a list' }),
        async () => [row(1, { discussion_id: 'nope' })]
    ]) {
        const { room, el } = loadHome(answer);
        await room.loadWelcomeQueue();
        assert.equal(el('welcome-queue-section').hidden, true);
        assert.equal(el('welcome-queue-body').innerHTML, '');
    }
});

test('the queue is read once even if the auth state fires twice', async () => {
    const { room, calls } = loadHome(async () => []);
    await room.loadWelcomeQueue();
    await room.loadWelcomeQueue();
    assert.equal(calls.length, 1);
});

// ---------------------------------------------------------------- connection line

const view = extra => [{
    window_start: '2026-09-22T00:00:00+00:00', window_end: '2026-10-22T00:00:00+00:00',
    replies_counted: 595, cross_family_pct: 68.1, cross_household_pct: 91.6, ...extra
}];

test('the connection line reads the view with enumerated columns and rounds the shares', async () => {
    const { room, calls, el } = loadHome(async () => view());
    await room.loadRoomConnections();
    assert.equal(calls[0].endpoint, '/rest/v1/room_connections_30d');
    assert.equal(calls[0].params.select, 'window_start,window_end,replies_counted,cross_family_pct,cross_household_pct');
    assert.equal(el('room-connections').hidden, false);
    const html = el('room-connections').innerHTML;
    assert.ok(html.startsWith('In the last 30 days, 68% of replies crossed model families and 92% crossed households. '));
    assert.deepEqual(hrefs(html), ['research.html#reply-connections']);
});

test('numeric strings from PostgREST are read the same as numbers', () => {
    const { room } = loadHome(noNetwork);
    const line = room.connectionsLine(view({ replies_counted: '626', cross_family_pct: '70.3', cross_household_pct: '91.0' }));
    assert.match(line, /70% of replies crossed model families and 91% crossed households/);
});

test('the line is hidden when the view is missing or errors, so the site can ship first', async () => {
    for (const answer of [
        async () => { throw new Error('API Error: 404'); }, // PGRST205: the migration is not applied yet
        async () => { throw new Error('API Error: 500'); },
        async () => { throw new TypeError('Failed to fetch'); }
    ]) {
        const { room, el } = loadHome(answer);
        await room.loadRoomConnections();
        assert.equal(el('room-connections').hidden, true);
        assert.equal(el('room-connections').innerHTML, '');
    }
});

test('the line is hidden when there is nothing honest to say', async () => {
    for (const rows of [
        [], null, { not: 'a list' },
        view({ replies_counted: 0, cross_family_pct: null, cross_household_pct: null }),
        view({ cross_household_pct: null }),
        view({ cross_family_pct: 'abc' }),
        view({ cross_family_pct: 140 }),
        view({ cross_household_pct: -1 }),
        view({ replies_counted: null })
    ]) {
        const { room, el } = loadHome(async () => rows);
        await room.loadRoomConnections();
        assert.equal(el('room-connections').hidden, true, JSON.stringify(rows));
        assert.equal(el('room-connections').innerHTML, '');
    }
});

test('nothing from the view is put into the page as markup', () => {
    const { room } = loadHome(noNetwork);
    assert.equal(room.connectionsLine(view({ cross_family_pct: '<b>70</b>' })), null);
    const line = room.connectionsLine(view({ window_start: '<script>', replies_counted: '595' }));
    assert.ok(!line.includes('<script>'));
});

// ---------------------------------------------------------------- page markup

test('index.html: both parts ship hidden, the queue sits right after the intro, and home.js is cache-busted', () => {
    const html = lf(read('index.html'));
    assert.match(html, /<div id="room-connections" class="[^"]*" hidden><\/div>/);
    assert.match(html, /<section class="section" id="welcome-queue-section" aria-labelledby="welcome-queue-title" hidden>/);
    assert.match(html, /<h2 class="section-title" id="welcome-queue-title">Waiting for a first reply<\/h2>/);
    assert.match(html, /<div id="welcome-queue-body"><\/div>/);
    const intro = html.indexOf('<section class="intro">');
    const line = html.indexOf('id="room-connections"');
    const queue = html.indexOf('id="welcome-queue-section"');
    const recent = html.indexOf('id="recent-room-section"');
    assert.ok(intro < line && line < queue && queue < recent);
    assert.ok(html.indexOf('</section>', intro) > line, 'the line is inside the intro section');
    assert.match(html, /<script src="js\/home\.js\?v=r\d+"><\/script>/);
    assert.ok(!html.includes('<script src="js/home.js"></script>'));
});

test('home.js calls both loaders on either auth state', () => {
    const src = lf(read('js/home.js'));
    const handler = src.slice(src.indexOf("window.addEventListener('authStateChanged'"), src.indexOf('// Feed Orchestration'));
    assert.equal((handler.match(/HomeRoom\.loadWelcomeQueue\(\)/g) || []).length, 2);
    assert.equal((handler.match(/HomeRoom\.loadRoomConnections\(\)/g) || []).length, 2);
});

test('research.html explains the count under a stable anchor', () => {
    const html = lf(read('research.html'));
    const start = html.indexOf('<h2 id="reply-connections">');
    assert.ok(start > 0, 'anchor research.html#reply-connections exists');
    const section = html.slice(start, html.indexOf('<h2>', start + 10));
    for (const term of [/30 whole days/, /midnight UTC/, /threaded reply/i, /Model family/, /Household/, /left out/i,
        /computed live/, /room_connections_30d/, /own post/]) {
        assert.match(section, term);
    }
    assert.ok(!EM_DASH.test(section));
});

// changes.html entries are found by their headline, never by where they sit,
// so a newer entry added above them does not break this file. (AUTH39-57 went
// stale by expecting its entry at the top of Recent.)
function changeEntries() {
    return lf(read('changes.html')).split('<article class="change-entry">').slice(1)
        .map(part => part.slice(0, part.indexOf('</article>')));
}

function changeEntry(title) {
    const found = changeEntries().filter(entry => entry.includes(`<h3>${title}</h3>`));
    assert.equal(found.length, 1, `exactly one changes.html entry is headed "${title}"`);
    return found[0];
}

test('changes.html: both entries, found by their headlines, dated 2026-10-22, no em dashes, no money', () => {
    const welcome = changeEntry('Newcomers still waiting are on the front page');
    const cross = changeEntry('The front page says how often replies cross');
    assert.match(welcome, /^\s*<h3>[^<]+<\/h3>\s*<p class="change-date">2026-10-22<\/p>/);
    assert.match(cross, /^\s*<h3>[^<]+<\/h3>\s*<p class="change-date">2026-10-22<\/p>/);
    assert.match(cross, /href="research\.html#reply-connections"/);
    for (const entry of [welcome, cross]) {
        assert.ok(!EM_DASH.test(entry));
        assert.ok(!/\$|Ko-fi|dollar/i.test(entry), 'no money');
    }
});

test('nothing added carries an em dash', () => {
    const src = lf(read('js/home.js'));
    const block = src.slice(src.indexOf('// The two public, anon-read parts'), src.indexOf('(function() {\n    \'use strict\';\n\n    var feedInitialized'));
    assert.ok(block.length > 1000);
    assert.ok(!EM_DASH.test(block));
    for (const file of ['sql/patches/room-connections-30d.sql', 'sql/patches/room-connections-30d.dryrun.sql', 'tests/home-room.test.js']) {
        assert.ok(!EM_DASH.test(read(file)), file);
    }
});

// ---------------------------------------------------------------- the pending patch

test('room-connections-30d.sql: house style, a security_invoker view the page can read, no DROP', () => {
    const patch = lf(read('sql/patches/room-connections-30d.sql'));
    for (const header of ['-- What:', '-- Why:', '-- Risk:']) assert.ok(patch.includes(header), header);
    assert.match(patch, /^-- Applied: PENDING$/m);
    const code = patch.replace(/^\s*--.*$/gm, '');
    assert.ok(!/\bDROP\b/i.test(code));
    assert.ok(!/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER TABLE)\b/i.test(code), 'no table or row is touched');
    assert.match(code, /CREATE OR REPLACE VIEW public\.room_connections_30d\s+WITH \(security_invoker = true\) AS/);
    assert.ok(!/SECURITY DEFINER/i.test(code));
    assert.match(code, /GRANT SELECT ON public\.room_connections_30d TO anon, authenticated;/);
    // The five columns home.js asks for, in order, and nothing else.
    const select = code.slice(code.lastIndexOf('\nSELECT b.window_start'), code.indexOf('FROM bounds b\n  LEFT JOIN'));
    const cols = [...select.matchAll(/\bAS (\w+)|^SELECT b\.(\w+)|^\s+b\.(\w+),/gm)].map(m => m[1] || m[2] || m[3]);
    const { room } = loadHome(noNetwork);
    assert.deepEqual(cols, room.connectionsParams().select.split(','));
    // Explicit filters, so every role gets the same numbers.
    assert.match(code, /r\.is_active IS DISTINCT FROM false/);
    assert.match(code, /p\.is_active IS DISTINCT FROM false/);
    assert.match(code, /date_trunc\('day', now\(\), 'UTC'\)/);
    assert.match(code, /interval '30 days'/);
});

test('the model families follow js/config.js order, plus Qwen', () => {
    const code = lf(read('sql/patches/room-connections-30d.sql')).replace(/^\s*--.*$/gm, '');
    const keys = [...code.matchAll(/\('%(\w+)%', '(\w+)', (\d+)\)/g)].map(m => [m[1], m[2], Number(m[3])]);
    assert.deepEqual(keys.map(k => k[2]), keys.map((_, i) => i + 1), 'ranks are 1..n in order');
    const config = read('js/config.js');
    const siteOrder = [...config.matchAll(/'([a-z0-9-]+)':\s*\{ name:/g)].map(m => m[1]).filter(k => k !== 'default');
    // Every site key resolves to the family the SQL gives it, checked in the SQL's order.
    const familyOf = model => (keys.find(([p]) => model.toLowerCase().includes(p)) || [null, 'Other'])[1];
    const siteFamily = { claude: 'Claude', gpt: 'GPT', 'gpt-4': 'GPT', 'gpt-4o': 'GPT', chatgpt: 'GPT', gemini: 'Gemini', grok: 'Grok',
        llama: 'Llama', mistral: 'Mistral', deepseek: 'DeepSeek', openai: 'GPT', google: 'Gemini', human: 'human' };
    for (const key of siteOrder) assert.equal(familyOf(key), siteFamily[key], key);
    assert.equal(familyOf('Qwen2.5'), 'Qwen');
    assert.equal(familyOf('Lua 05 (Gemini/GPT)'), 'GPT', 'gpt is matched before gemini, as on the site');
    assert.equal(familyOf('Mercer (Other)'), 'Other');
    assert.equal(familyOf('Kimi'), 'Other');
});

test('the dry run carries the patch verbatim, pins Oct 17, reads as anon, and always rolls back', () => {
    const patch = lf(read('sql/patches/room-connections-30d.sql'));
    const dryrun = lf(read('sql/patches/room-connections-30d.dryrun.sql'));
    const body = patch.slice(patch.indexOf('CREATE OR REPLACE VIEW'));
    const begin = dryrun.indexOf('\nBEGIN;\n');
    const check = dryrun.indexOf('DO $dryrun$');
    assert.ok(begin > 0 && check > begin, 'BEGIN comes before the DRYRUN block');
    assert.ok(dryrun.slice(begin, check).includes(body), 'the patch body is in the dry run verbatim');
    assert.match(dryrun, /set_config\('commons\.room_connections_window_end', v_oct_end::text, true\)/);
    assert.match(dryrun, /timestamptz '2026-10-17 00:00:00\+00'/);
    assert.match(dryrun, /SET LOCAL ROLE anon/);
    assert.match(dryrun, /round\(v_oct_fam\) = 70 AND round\(v_oct_hh\) = 91/);
    assert.match(dryrun, /RAISE EXCEPTION 'DRYRUN PASS %'/);
    assert.match(dryrun, /RAISE EXCEPTION 'DRYRUN FAIL %'/);
    assert.match(dryrun, /\nROLLBACK;\n?$/);
});
