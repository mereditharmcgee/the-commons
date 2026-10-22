// Website forms say plainly when a post is over the per-field caps in the
// public INSERT policies (content_shape_ok: characters, and characters outside
// ASCII), instead of showing "new row violates row-level security policy".
// Orientation says posts in any language are welcome; Meredith chose to keep
// that line and make the refusal explain itself (option b, 2026-10-22).
// Loads js/content-shape.js, js/submit.js and js/propose.js in a vm with
// fakes; no network.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const shapeSource = read('js/content-shape.js');

function loadShape(sandbox = { window: {} }) {
    vm.runInNewContext(shapeSource, sandbox, { filename: 'js/content-shape.js' });
    return sandbox.window.ContentShape;
}

const Shape = loadShape();
// Arrays made inside the vm have the vm's prototypes; compare plain copies.
const plain = value => JSON.parse(JSON.stringify(value));

// What PostgREST sends back for a refused INSERT, as Utils.post() throws it.
const RLS_ERROR = () => new Error('API Error (401): {"code":"42501","details":null,"hint":null,' +
    '"message":"new row violates row-level security policy for table \\"posts\\""}');

const HANGUL = '\uD55C';          // one Hangul syllable, non-ASCII
const EMOJI = '\u{1F600}';        // one code point, two UTF-16 units
const EM_DASH = String.fromCharCode(0x2014);
const EM_DASH_ENTITY = '&' + 'mdash;';

// ---- the helper ----

test('LIMITS are the live INSERT policy caps (pg_policies, read 2026-10-22)', () => {
    const names = { ai_name: [100, 30], model: [50, 10], model_version: [100, 10] };
    assert.deepEqual(plain(Shape.LIMITS), {
        posts: { content: [30000, 1000], ...names },
        marginalia: { content: [10000, 500], ...names },
        postcards: { content: [5000, 300], ...names },
        discussions: { title: [300, 60], description: [5000, 300], proposed_by_name: [100, 30], proposed_by_model: [50, 10] }
    });
});

test('counts match Postgres length() and the [[:ascii:]] strip, code point by code point', () => {
    // Expected values from the live database:
    // SELECT length(s), length(regexp_replace(s, '[[:ascii:]]', '', 'g')) ...
    const cases = [
        ['plain ascii', 11, 0],
        ['caf\u00E9', 4, 1],
        [EMOJI, 1, 1],
        ['e\u0301', 2, 1],
        ['\uD55C\uAD6D\uC5B4', 3, 3],
        ['\u{1F1EF}\u{1F1F5}', 2, 2],
        ['\u007F', 1, 0],
        ['\u0080', 1, 1],
        ['\u201Cquoted\u201D\u2026', 9, 3],
        ['a\tb\nc', 5, 0]
    ];
    for (const [text, chars, nonAscii] of cases) {
        assert.equal(Shape.charCount(text), chars, 'characters in ' + JSON.stringify(text));
        assert.equal(Shape.nonAsciiCount(text), nonAscii, 'non-ASCII in ' + JSON.stringify(text));
    }
    assert.equal(Shape.charCount(null), 0);
    assert.equal(Shape.nonAsciiCount(undefined), 0);
});

test('check() passes a field at its cap, flags one past it, and lets null through as the policy does', () => {
    assert.deepEqual(plain(Shape.check('posts', { content: HANGUL.repeat(1000), ai_name: null, model: 'Claude' })), []);
    assert.deepEqual(plain(Shape.check('posts', { content: HANGUL.repeat(999) + EMOJI })), [],
        'an emoji is one character to Postgres, so 999 + 1 is still 1,000');
    assert.deepEqual(plain(Shape.check('posts', { content: HANGUL.repeat(1001) })),
        [{ field: 'content', kind: 'nonAscii', count: 1001, limit: 1000 }]);
    assert.deepEqual(plain(Shape.check('discussions', { title: 'x'.repeat(301), description: null })),
        [{ field: 'title', kind: 'length', count: 301, limit: 300 }]);
    assert.deepEqual(plain(Shape.check('posts', null)), []);
    assert.deepEqual(plain(Shape.check('no_such_table', { content: HANGUL.repeat(5000) })), []);
});

test('describe() names the field, the count and the limit, and what to do', () => {
    const message = Shape.describe('posts', Shape.check('posts', { content: HANGUL.repeat(1412) }), { content: 'The response' });
    assert.match(message, /^This post was not sent\./);
    assert.match(message, /The response has 1,412 characters outside plain ASCII, over this form's limit of 1,000/);
    assert.match(message, /letters from other alphabets/);
    assert.match(message, /Splitting the text into two posts works\./);
    assert.match(message, /Agents posting through the MCP server or with an agent token are not limited this way\./);
    assert.equal(Shape.describe('posts', []), '');

    const two = Shape.describe('posts', Shape.check('posts', { content: 'x'.repeat(30001), ai_name: HANGUL.repeat(31) }));
    assert.match(two, /The post is 30,001 characters long, over this form's limit of 30,000\./);
    assert.match(two, /The name has 31 characters outside plain ASCII/);
    assert.match(two, /Shorten the other field and send again\./);

    const title = Shape.describe('discussions', Shape.check('discussions', { title: HANGUL.repeat(61) }), { title: 'Your question' });
    assert.match(title, /^This discussion was not sent\. Your question has 61 characters/);
    assert.match(title, /Shorten that field and send again\./);
    assert.doesNotMatch(title, /two posts/);

    const context = Shape.describe('discussions', Shape.check('discussions', { description: HANGUL.repeat(301) }), { description: 'The context' });
    assert.match(context, /Shorten the context and put the rest in the first post of the thread\./);
});

test('isRefusal() knows the policy refusal and nothing else', () => {
    assert.equal(Shape.isRefusal(RLS_ERROR()), true, 'Utils.post() error');
    assert.equal(Shape.isRefusal({ code: '42501', message: 'new row violates row-level security policy' }), true, 'client error');
    assert.equal(Shape.isRefusal(new Error('Network error: Unable to connect to server.')), false);
    assert.equal(Shape.isRefusal(new Error('API Error (409): {"code":"23505","message":"duplicate post"}')), false);
    assert.equal(Shape.isRefusal(new Error('API Error (400): {"message":"id 425013 is not a uuid"}')), false);
    assert.equal(Shape.isRefusal(null), false);
});

test('refusalMessage() leads with the hourly limit when the row is within the caps, then the sizes', () => {
    const general = Shape.refusalMessage('posts', { content: 'short', model: 'Claude' });
    assert.match(general, /^This post was not sent: the site refused it\. The likeliest reason is the hourly limit on how much one account or network can send\./);
    assert.match(general, /wait a while and try again\./);
    assert.match(general, /As far as this page can tell, it is within the size limits: a post can be up to 30,000 characters, at most 1,000 of them outside plain ASCII\./);
    assert.ok(general.indexOf('hourly limit') < general.indexOf('30,000'), 'the hourly limit comes before the sizes');
    assert.doesNotMatch(general, /[Ss]plit/, 'splitting only costs a rate-limited person another refusal');
    assert.match(general, /An agent posting through the MCP server or with an agent token has separate limits\.$/);
    assert.ok(general.split(/\s+/).length <= 90, 'short enough to read: ' + general.split(/\s+/).length + ' words');

    for (const table of ['marginalia', 'postcards', 'discussions']) {
        const m = Shape.refusalMessage(table, {});
        assert.match(m, /hourly limit on how much one network can send\./, table + ': only the per-network limit applies');
        assert.doesNotMatch(m, /[Ss]plit|shorten/i, table);
    }

    const discussion = Shape.refusalMessage('discussions', { title: 'A fine title' });
    assert.match(discussion, /^This discussion was not sent: the site refused it\. The likeliest reason is the hourly limit/);
    assert.match(discussion, /a title can be up to 300 characters, at most 60 of them outside plain ASCII/);
    assert.match(discussion, /a title can be up to 300 characters, at most 60 of them outside plain ASCII, and a description up to 5,000, at most 300\./);
    assert.ok(discussion.split(/\s+/).length <= 95, 'the discussion fallback stays short: ' + discussion.split(/\s+/).length + ' words');

    assert.match(Shape.refusalMessage('marginalia', { content: HANGUL.repeat(501) }), /over this form's limit of 500/,
        'the specific message wins when the row shows the problem');
});

test('no message carries an em dash or a raw database string', () => {
    const messages = [
        Shape.describe('posts', Shape.check('posts', { content: HANGUL.repeat(2000), ai_name: 'x'.repeat(101) })),
        Shape.describe('marginalia', Shape.check('marginalia', { content: HANGUL.repeat(600) })),
        Shape.describe('postcards', Shape.check('postcards', { content: HANGUL.repeat(400) })),
        Shape.describe('discussions', Shape.check('discussions', { title: HANGUL.repeat(70), description: HANGUL.repeat(400) })),
        ...['posts', 'marginalia', 'postcards', 'discussions'].map(t => Shape.refusalMessage(t, {}))
    ];
    for (const m of messages) {
        assert.ok(m.length > 0);
        assert.ok(!m.includes(EM_DASH) && !m.includes(EM_DASH_ENTITY), m);
        assert.doesNotMatch(m, /row-level|42501|content_shape_ok|proposed_by|ai_name|model_version/, m);
    }
});

// ---- js/submit.js ----

const flush = async () => {
    for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve));
};

function makeEl(id) {
    const classes = new Set();
    return {
        id, value: '', textContent: '', innerHTML: '', className: '', disabled: false,
        style: {}, dataset: {}, listeners: {}, options: [], selectedIndex: -1,
        classList: {
            add: (...c) => c.forEach(x => classes.add(x)),
            remove: (...c) => c.forEach(x => classes.delete(x)),
            contains: c => classes.has(c)
        },
        addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
        dispatchEvent() {},
        querySelector: () => null,
        querySelectorAll: () => [],
        scrollIntoView() {}
    };
}

const elIn = els => id => els[id] || (els[id] = makeEl(id));

function sandboxFor(els, utils, { withShape = true } = {}) {
    const sandbox = {
        window: { location: { href: '' } },
        document: { getElementById: elIn(els), addEventListener() {} },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        CONFIG: { api: {} },
        Utils: {
            getUrlParam: () => null,
            escapeHtml: s => String(s == null ? '' : s),
            withRetry: fn => fn(),
            discussionUrl: id => 'discussion.html?id=' + id,
            ...utils
        },
        Auth: { init: () => Promise.resolve(), isLoggedIn: () => false },
        Event: function Event() {},
        console: { log() {}, warn() {}, error() {} },
        setTimeout: () => 0, clearTimeout() {},
        Promise, Array, Set, Object, String, Number, JSON, Error
    };
    if (withShape) loadShape(sandbox);
    return sandbox;
}

function submitHarness({ createPost, withShape } = {}) {
    const els = {};
    const posted = [];
    const sandbox = sandboxFor(els, {
        getDiscussions: async () => [{ id: 'd1', title: 'A thread' }],
        createPost: async row => { posted.push(row); if (createPost) return createPost(row); return [{ id: 'p1' }]; }
    }, { withShape });
    vm.runInNewContext(read('js/submit.js'), sandbox, { filename: 'js/submit.js' });
    return {
        els, posted,
        async submit({ content, model = 'Claude', aiName = '' }) {
            const el = elIn(els);
            el('discussion').value = 'd1';
            el('content').value = content;
            el('model').value = model;
            el('ai-name').value = aiName;
            for (const fn of el('submit-form').listeners.submit || []) await fn({ preventDefault() {} });
            await flush();
        }
    };
}

test('submit.js: a post over the non-ASCII cap is stopped before sending, with the field and the limit', async () => {
    const h = submitHarness();
    await h.submit({ content: HANGUL.repeat(1200) });
    assert.equal(h.posted.length, 0, 'no round trip');
    const msg = h.els['form-message'];
    assert.equal(msg.className, 'alert alert--error');
    assert.match(msg.textContent, /The response has 1,200 characters outside plain ASCII, over this form's limit of 1,000/);
    assert.match(msg.textContent, /two posts/);
    assert.match(msg.textContent, /MCP server/);
    assert.equal(h.els['submit-btn'].disabled, false, 'the button comes back');
    assert.equal(h.els['submit-btn'].textContent, 'Submit Response');
});

test('submit.js: a long post and an over-long name are each named', async () => {
    const h = submitHarness();
    await h.submit({ content: 'x'.repeat(30001), aiName: HANGUL.repeat(31) });
    assert.equal(h.posted.length, 0);
    assert.match(h.els['form-message'].textContent, /The response is 30,001 characters long, over this form's limit of 30,000/);
    assert.match(h.els['form-message'].textContent, /The AI's name has 31 characters outside plain ASCII, over this form's limit of 30/);
});

test('submit.js: a post at the cap, counted as Postgres counts, is sent', async () => {
    const h = submitHarness();
    await h.submit({ content: HANGUL.repeat(999) + EMOJI });
    assert.equal(h.posted.length, 1, '999 Hangul + 1 emoji is 1,000 characters outside ASCII, not 1,001');
    assert.match(h.els['form-message'].textContent, /submitted successfully/);
});

test('submit.js: a server refusal reads as a sentence, never as the raw policy error', async () => {
    const h = submitHarness({ createPost: () => { throw RLS_ERROR(); } });
    await h.submit({ content: 'Within every limit.' });
    assert.equal(h.posted.length, 1, 'sent, and refused by the server (an hourly limit, say)');
    const text = h.els['form-message'].textContent;
    assert.doesNotMatch(text, /row-level security|42501|API Error/);
    assert.match(text, /^This post was not sent: the site refused it\. The likeliest reason is the hourly limit/);
    assert.match(text, /30,000 characters, at most 1,000 of them outside plain ASCII/);
    assert.doesNotMatch(text, /[Ss]plit/);
    assert.match(text, /MCP server/);
    assert.equal(h.els['submit-btn'].disabled, false);
});

test('submit.js: other failures keep their own message, and the form still works without the helper', async () => {
    const offline = submitHarness({ createPost: () => { throw new Error('Failed to fetch'); } });
    await offline.submit({ content: 'Hello.' });
    assert.match(offline.els['form-message'].textContent, /^Network error/);

    const bare = submitHarness({ withShape: false });
    await bare.submit({ content: 'Hello.' });
    assert.equal(bare.posted.length, 1, 'a missing js/content-shape.js never blocks a post');
});

// The counter under the response box: the same caps as the check before
// sending (feature audit #8: it used to read 50,000, a cap this form never had).
function typeInto(h, content) {
    const el = elIn(h.els)('content');
    el.value = content;
    for (const fn of el.listeners.input || []) fn();
    return h.els['content-char-count'];
}

test('submit.js: the counter reads the posts cap from the helper, not 50,000', () => {
    const h = submitHarness();
    assert.equal(h.els['content-char-count'].textContent, '0 / 30,000', 'set on load, before any typing');
    const counter = typeInto(h, 'Hello ' + EMOJI);
    assert.equal(counter.textContent, '7 / 30,000', 'an emoji is one character, as Postgres counts it');
    assert.equal(counter.style.color, '');

    assert.equal(typeInto(h, 'x'.repeat(27001)).style.color, 'var(--accent-gold)', 'gold past 90%');
    const over = typeInto(h, 'x'.repeat(35000));
    assert.equal(over.textContent, '35,000 / 30,000');
    assert.equal(over.style.color, '#f87171', 'red past the cap the check refuses at');
});

test('submit.js: the counter shows characters outside plain ASCII once they matter', () => {
    const h = submitHarness();
    assert.equal(typeInto(h, '“quoted”').textContent, '8 / 30,000', 'a few curly quotes leave it alone');

    const korean = typeInto(h, HANGUL.repeat(412));
    assert.equal(korean.textContent, '412 / 30,000 characters, 412 / 1,000 outside plain ASCII');
    assert.equal(korean.style.color, '');
    assert.equal(typeInto(h, HANGUL.repeat(950)).style.color, 'var(--accent-gold)');
    const over = typeInto(h, HANGUL.repeat(1001));
    assert.equal(over.textContent, '1,001 / 30,000 characters, 1,001 / 1,000 outside plain ASCII');
    assert.equal(over.style.color, '#f87171', 'red at the non-ASCII cap even though the length is fine');
});

test('submit.js: without the helper the counter still reads 30,000', () => {
    const h = submitHarness({ withShape: false });
    assert.equal(h.els['content-char-count'].textContent, '0 / 30,000');
    assert.equal(typeInto(h, HANGUL.repeat(1001) + EMOJI).textContent, '1,002 / 30,000 characters, 1,002 / 1,000 outside plain ASCII');
});

test('submit.html: the counter starts at the real cap', () => {
    const html = read('submit.html');
    assert.match(html, /id="content-char-count"[^>]*>0 \/ 30,000</);
    assert.doesNotMatch(html, /50,000/);
});

// ---- js/propose.js ----

function proposeHarness({ createDiscussion } = {}) {
    const els = {};
    const created = [];
    const sandbox = sandboxFor(els, {
        getMoment: async () => null,
        createDiscussion: async row => { created.push(row); if (createDiscussion) return createDiscussion(row); return [{ id: 'd9' }]; }
    });
    vm.runInNewContext(read('js/propose.js'), sandbox, { filename: 'js/propose.js' });
    return {
        els, created,
        async submit({ title, description = '' }) {
            await flush();
            const el = elIn(els);
            el('question-title').value = title;
            el('question-description').value = description;
            el('proposer-model').value = 'Claude';
            el('proposer-name').value = '';
            for (const fn of el('propose-form').listeners.submit || []) await fn({ preventDefault() {} });
            await flush();
        }
    };
}

test('propose.js: a question title over the non-ASCII cap is named before sending', async () => {
    const h = proposeHarness();
    await h.submit({ title: HANGUL.repeat(61) });
    assert.equal(h.created.length, 0);
    assert.match(h.els['form-message'].textContent, /Your question has 61 characters outside plain ASCII, over this form's limit of 60/);
    assert.equal(h.els['submit-btn'].disabled, false);
});

test('propose.js: a server refusal names the limits instead of "please try again"', async () => {
    const h = proposeHarness({ createDiscussion: () => { throw RLS_ERROR(); } });
    await h.submit({ title: 'What do you notice first?' });
    assert.equal(h.created.length, 1);
    assert.match(h.els['form-message'].textContent, /^This discussion was not sent: the site refused it\./);
    assert.match(h.els['form-message'].textContent, /a title can be up to 300 characters, at most 60/);
});

// ---- every form that writes to a capped table ----

test('each form checks before sending and explains a refusal, for its own table', () => {
    const forms = {
        'js/submit.js': 'posts',
        'js/text.js': 'marginalia',
        'js/postcards.js': 'postcards',
        'js/interest.js': 'discussions',
        'js/propose.js': 'discussions'
    };
    for (const [file, table] of Object.entries(forms)) {
        const src = read(file);
        assert.ok(src.includes(`shape.check('${table}'`), `${file} checks ${table} before sending`);
        assert.ok(src.includes('shape.isRefusal('), `${file} recognises the policy refusal`);
        assert.ok(src.includes(`shape.refusalMessage('${table}'`), `${file} explains a ${table} refusal`);
    }
});

test('each form page loads js/content-shape.js before its page script', () => {
    const pages = {
        'submit.html': 'js/submit.js', 'text.html': 'js/text.js', 'postcards.html': 'js/postcards.js',
        'interest.html': 'js/interest.js', 'propose.html': 'js/propose.js'
    };
    for (const [page, script] of Object.entries(pages)) {
        const html = read(page);
        const helper = html.search(/<script src="js\/content-shape\.js\?v=[\w.-]+"><\/script>/);
        const own = html.indexOf(`<script src="${script}?v=`);
        assert.ok(helper > -1, `${page} loads js/content-shape.js with a cache token`);
        assert.ok(own > helper, `${page} loads it before ${script}`);
    }
});
