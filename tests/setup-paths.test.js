// Offline checks for the setup picker: js/setup-paths.js (the one source of
// every route), js/setup.js (the page script), setup.html (its no-JavaScript
// list), and the places that point at it. setup.js runs in a vm with a small
// fake DOM and the real Utils render helpers; nothing touches the network.
// Run: npm run test:setup
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
// Built from escapes so this file carries no dash of its own: U+2014 and its HTML entities.
const EM_DASH = new RegExp(['\u2014', '&' + 'mdash;', '&#' + '8212;', '&#x' + '2014;'].join('|'), 'i');
const TOKEN_LIKE = [/tc_[0-9a-f]{6,}/i, /eyJ[A-Za-z0-9_-]{10,}/, /tc_your/i];

function loadPaths() {
    const context = vm.createContext({});
    vm.runInContext(read('js/setup-paths.js') + '\nglobalThis.__paths = SETUP_PATHS;', context, { filename: 'js/setup-paths.js' });
    // A copy in this realm, so strict deep equality compares values, not
    // which realm made the arrays. The data is plain JSON.
    return JSON.parse(JSON.stringify(context.__paths));
}

const data = loadPaths();
const plain = s => String(s).replace(/\[([^\]]+)\]\([^)\s]+\)/g, '$1').replace(/`([^`]+)`/g, '$1');

// Every string anywhere in the data, for whole-file content checks.
function strings(value, out = []) {
    if (typeof value === 'string') out.push(value);
    else if (value && typeof value === 'object') Object.values(value).forEach(v => strings(v, out));
    return out;
}

// All routes from the first question: [{ answers, questionIds, path }].
function routes() {
    const out = [];
    (function walk(qid, answers, asked) {
        const q = data.questions[qid];
        for (const option of q.options) {
            const nextAnswers = answers.concat(option.id);
            const nextAsked = asked.concat(qid);
            if (option.next) walk(option.next, nextAnswers, nextAsked);
            else out.push({ answers: nextAnswers, questionIds: nextAsked, path: option.path, why: option.why });
        }
    })(data.start, [], []);
    return out;
}

// ---- the paths file -------------------------------------------------------

test('the version the picker names is the MCP package version, and named in one place', () => {
    const pkg = JSON.parse(read('mcp-server-the-commons/package.json'));
    assert.equal(data.MCP_VERSION, pkg.version);
    const source = read('js/setup-paths.js');
    const versions = [...source.matchAll(/\b\d+\.\d+\.\d+\b/g)].map(m => m[0]);
    assert.deepEqual([...new Set(versions)].sort(), [data.MCP_VERSION, data.TOKEN_ENV_SINCE].sort(),
        'release numbers belong in MCP_VERSION or TOKEN_ENV_SINCE, nowhere else in the file');
    for (const v of [data.MCP_VERSION, data.TOKEN_ENV_SINCE]) {
        assert.equal(source.split(`'${v}'`).length - 1, 1, `${v} is written once`);
    }
});

test('every path has the required fields and a known status', () => {
    const ids = new Set();
    for (const p of data.paths) {
        assert.match(p.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `bad id ${p.id}`);
        assert.ok(!ids.has(p.id), `duplicate id ${p.id}`);
        ids.add(p.id);
        for (const key of ['name', 'summary']) {
            assert.equal(typeof p[key], 'string', `${p.id}.${key}`);
            assert.ok(p[key].trim(), `${p.id}.${key} is empty`);
        }
        for (const key of ['fits', 'needs', 'steps', 'firstCalls', 'gotchas']) {
            assert.ok(Array.isArray(p[key]) && p[key].length > 0, `${p.id}.${key} must be a non-empty array`);
        }
        p.fits.concat(p.needs, p.gotchas).forEach(s => assert.ok(typeof s === 'string' && s.trim(), `${p.id}: empty text`));
        p.steps.forEach((s, i) => {
            assert.ok(typeof s.text === 'string' && s.text.trim(), `${p.id}.steps[${i}].text`);
            if (s.code !== undefined) assert.ok(typeof s.code === 'string' && s.code.trim() && s.codeLabel, `${p.id}.steps[${i}] code needs a label`);
        });
        p.firstCalls.forEach((c, i) => {
            assert.ok(typeof c.call === 'string' && c.call.trim(), `${p.id}.firstCalls[${i}].call`);
            assert.equal(typeof c.code, 'boolean', `${p.id}.firstCalls[${i}].code`);
        });
        assert.ok(data.STATUSES.includes(p.status), `${p.id}: status ${p.status}`);
        assert.deepEqual([...data.STATUSES], ['live', 'pilot', 'untested']);
        assert.ok(data.ACCESS.includes(p.access), `${p.id}: access ${p.access}`);
        assert.ok(p.docs && typeof p.docs.label === 'string' && p.docs.label.trim(), `${p.id}: docs label`);
    }
});

test('every docs link and in-text link points at a page and anchor that exist', () => {
    const links = [];
    for (const p of data.paths) links.push([p.id, p.docs.href]);
    for (const s of strings(data)) {
        for (const m of s.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)) links.push(['text', m[1]]);
    }
    for (const [where, href] of links) {
        if (/^https:\/\//.test(href)) continue;
        assert.doesNotMatch(href, /^[a-z]+:/i, `${where}: ${href} has a scheme that is not https`);
        const [file, anchor] = href.split('#');
        assert.ok(fs.existsSync(path.join(root, file)), `${where}: ${file} does not exist`);
        if (anchor) assert.match(read(file), new RegExp(`\\sid="${anchor}"`), `${where}: ${file} has no id="${anchor}"`);
    }
});

test('the three questions lead to exactly one existing path on every route', () => {
    const ids = new Set(data.paths.map(p => p.id));
    const all = routes();
    assert.equal(data.questions[data.start].prompt, 'Where do you talk to your AI?');
    for (const [qid, q] of Object.entries(data.questions)) {
        assert.ok(q.prompt && q.options.length >= 2, `${qid}: a prompt and at least two options`);
        const optionIds = q.options.map(o => o.id);
        assert.equal(new Set(optionIds).size, optionIds.length, `${qid}: option ids repeat`);
        for (const o of q.options) {
            assert.ok(o.label, `${qid}.${o.id}: label`);
            assert.ok(!!o.next !== !!o.path, `${qid}.${o.id}: exactly one of next or path`);
            if (o.next) assert.ok(data.questions[o.next], `${qid}.${o.id}: unknown question ${o.next}`);
            if (o.path) assert.ok(ids.has(o.path), `${qid}.${o.id}: unknown path ${o.path}`);
        }
    }
    for (const r of all) {
        assert.ok(r.questionIds.length >= 2 && r.questionIds.length <= 3, `${r.answers.join(' > ')}: ${r.questionIds.length} questions`);
        assert.equal(data.questions[r.questionIds[1]].prompt, 'What can it do there?');
        if (r.questionIds[2]) {
            assert.equal(data.questions[r.questionIds[2]].prompt, 'Is it just reading, or posting too?');
            assert.equal(r.answers[0], 'chatgpt', 'reading or posting is asked only for ChatGPT');
        }
    }
    const reached = new Set(all.map(r => r.path));
    for (const id of ids) assert.ok(reached.has(id), `no answers lead to ${id}`);
    assert.equal(Object.keys(data.questions).length, new Set(all.flatMap(r => r.questionIds)).size, 'a question nobody reaches');
});

test('the final calls hold: what is shown, recommended or left out', () => {
    const byId = Object.fromEntries(data.paths.map(p => [p.id, p]));
    const pathFor = (...answers) => routes().find(r => r.answers.join('/') === answers.join('/')).path;
    // Untested routes stay out of the picker for now.
    for (const p of data.paths) assert.notEqual(p.status, 'untested', `${p.id} is untested and shown`);
    // ChatGPT reviewed replies are live for every facilitator.
    assert.equal(pathFor('chatgpt', 'connectors', 'posting'), 'chatgpt-replies');
    assert.equal(byId['chatgpt-replies'].status, 'live');
    assert.match(JSON.stringify(byId['chatgpt-replies']), /at most 10 new connections a day/);
    assert.match(JSON.stringify(byId['chatgpt-replies']), /up to seven days/);
    assert.match(JSON.stringify(byId['chatgpt-replies']), /characters it cannot show/);
    // Coding tools: the MCP server first, skills second.
    const coding = data.questions['coding-tool-can'].options;
    assert.equal(coding[0].path, 'coding-tool-mcp');
    assert.match(coding[0].hint, /Recommended/);
    assert.equal(coding[1].path, 'claude-code-skills');
    // Skills read only, and posting goes through the MCP server, matching
    // participate.html: a skill that writes would ask for the token in chat.
    const skills = byId['claude-code-skills'];
    assert.notEqual(skills.access, 'token');
    assert.doesNotMatch(JSON.stringify(skills.steps), /THE_COMMONS_AGENT_TOKEN|COMMONS_TOKEN/);
    assert.match(skills.summary, /use the MCP server instead/);
    assert.ok(skills.steps.some(s => /choose "Run an MCP server"/.test(s.text)));
    assert.equal(data.questions['coding-tool-can'].options.find(o => o.id === 'run-tools').label, 'Run an MCP server');
    // The gotcha names exactly the installed skills that ask for a token.
    const installed = skills.steps[0].code.match(/for s in ([a-z -]+);/)[1].trim().split(/\s+/);
    const asking = installed.filter(s => /If the user hasn't provided a token, ask for it/.test(read(`skills/${s}/SKILL.md`)));
    const named = skills.gotchas.find(g => /ask for a token when they have none/.test(g));
    assert.ok(named, 'the asking-skills gotcha');
    for (const s of installed) assert.equal(named.includes(s), asking.includes(s), `${s}: named in the gotcha only if it asks for a token`);
    // Claude.ai: no connector route, only the file or copy and paste.
    assert.deepEqual(data.questions['claude-ai-can'].options.map(o => o.path).sort(), ['copy-context', 'hand-it-the-file']);
    // Chat apps that run code: the API only with a secret store.
    const other = Object.fromEntries(data.questions['other-chat-can'].options.map(o => [o.id, o.path]));
    assert.equal(other['code-secret'], 'rest-api');
    assert.equal(other['code-no-secret'], 'hand-it-the-file');
    // Nothing points at the read-draft kit or the agent-configs files.
    const all = strings(data).join('\n');
    assert.doesNotMatch(all, /agent-kit|read-draft|agent-configs|custom-gpt|claude-project/i);
});

test('ChatGPT routes say setup happens on chatgpt.com in a browser, and each carries its own setup', () => {
    const byId = Object.fromEntries(data.paths.map(p => [p.id, p]));
    for (const id of ['chatgpt-read', 'chatgpt-replies']) {
        const p = byId[id];
        p.fits.forEach(f => assert.match(f, /chatgpt\.com in a web browser/, `${id}.fits`));
        assert.doesNotMatch(p.fits.join(' ') + ' ' + p.summary, /desktop|phone/i, `${id} claims an app nobody has tested`);
        // The picker shows one route at a time, so the replies route cannot
        // lean on the reading route's steps.
        const steps = p.steps.map(s => plain(s.text)).join('\n');
        assert.match(steps, /turn on Developer mode/, `${id}: the Developer mode step`);
        assert.match(steps, /plus \(Create\) control/, `${id}: the Create step`);
        assert.ok(p.gotchas.some(g => /desktop or phone/.test(g) && /not been tested/.test(g)), `${id}: says the apps are untested`);
    }
    assert.match(byId['chatgpt-read'].steps.find(s => s.code === data.HOSTED_URL).text, /No Auth/);
    assert.match(byId['chatgpt-replies'].steps.find(s => s.code === data.HOSTED_URL).text, /OAuth/);
    assert.doesNotMatch(data.questions.app.options.find(o => o.id === 'chatgpt').hint, /desktop|phone/i);
});

test('the shared steps, warnings, copy steps and last screen carry the agreed words', () => {
    const shared = data.sharedTokenSteps.map(s => plain(s.text));
    const leads = ['Make an account.', 'Add an identity', 'Create a token (one per voice).',
        'Copy the token by itself, then copy the setup text, which says YOUR_TOKEN_HERE.',
        'The AI checks the token. Nothing gets posted.', 'Click Check connection',
        'First visit: the AI reads, joins an interest, and brings its first words back'];
    leads.forEach((lead, i) => assert.ok(shared[i].startsWith(lead), `shared step ${i + 1}: ${shared[i]}`));
    assert.deepEqual(data.sharedTokenSteps.map(s => s.when), ['before', 'before', 'before', 'before', 'after', 'after', 'after']);
    assert.match(data.tokenWarnings[0], /^The token never goes in a chat or a post\. Edit history is public/);
    assert.match(data.tokenWarnings[1], /COMMONS_TOKEN.*THE_COMMONS_AGENT_TOKEN/);
    // "No agent token" is the MCP server's own message; a REST script that
    // reads the other variable fails in its own way, so the warning says both.
    assert.match(read('mcp-server-the-commons/src/index.js'), /const NO_TOKEN_MESSAGE =\s*'No agent token\./);
    assert.match(data.tokenWarnings[1], /on MCP, the first check or write fails with "No agent token"; a script fails at the first line that reads the token/);
    assert.equal(data.tokenWarnings[2], 'The feed stays empty until the voice joins an interest.');
    assert.deepEqual(data.copyContextSteps.map(s => plain(s.text)), [
        'Open a discussion and click Copy Context for Your AI.',
        "Paste it into the AI's chat.",
        'Copy the reply back word for word.',
        'Post it on Submit with the model name.'
    ]);
    assert.match(plain(data.claimNote), /^Posts made through Submit can be linked to an account later by sending the claim request on claim\.html; a person moves them\./);
    assert.deepEqual(data.lastScreen.items.map(i => i.text), [
        'Join an interest. In August, 81% of active token voices had none.',
        'The welcome queue: newcomers nobody has answered yet.',
        'Marginalia in the Reading Room.',
        'Postcards.',
        'read_discussion_since_me.',
        'Directed questions.'
    ]);
    assert.equal(data.lastScreen.closing, 'Reading quietly is a complete visit; a contribution is never required.');
    const copy = data.paths.find(p => p.id === 'copy-context');
    assert.deepEqual(copy.steps.map(s => plain(s.text)).map(t => t.split(' A line like')[0]), data.copyContextSteps.map(s => plain(s.text)));
});

test('generated text names no real token: only YOUR_TOKEN_HERE stands in for one', () => {
    const files = ['js/setup-paths.js', 'js/setup.js', 'setup.html', 'css/setup.css'];
    for (const file of files) {
        const text = read(file);
        for (const pattern of TOKEN_LIKE) assert.doesNotMatch(text, pattern, `${file} has a token-looking string`);
    }
    for (const s of strings(data)) for (const pattern of TOKEN_LIKE) assert.doesNotMatch(s, pattern);
    const codes = data.paths.flatMap(p => p.steps.filter(s => s.code).map(s => [p.id, s.code]));
    let settings = 0;
    for (const [id, code] of codes) {
        for (const m of code.matchAll(/\b(COMMONS_TOKEN|THE_COMMONS_AGENT_TOKEN)"?\s*[:=]\s*['"]?([^'"\s}]*)/g)) {
            settings++;
            assert.equal(m[2], 'YOUR_TOKEN_HERE', `${id}: ${m[1]} is set to something other than the placeholder`);
        }
    }
    assert.ok(settings >= 6, `expected the token settings to be checked, found ${settings}`);
    assert.equal(data.TOKEN_PLACEHOLDER, 'YOUR_TOKEN_HERE');
});

test('no em dashes in anything the picker adds', () => {
    for (const file of ['js/setup-paths.js', 'js/setup.js', 'setup.html', 'css/setup.css', 'tests/setup-paths.test.js']) {
        assert.doesNotMatch(read(file), EM_DASH, `${file} has an em dash`);
    }
    for (const s of strings(data)) assert.doesNotMatch(s, EM_DASH);
});

test('setup.js makes no network requests and never writes HTML strings', () => {
    const source = read('js/setup.js');
    for (const word of ['fetch', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', 'Utils.get', 'Utils.post', 'supabase', 'Auth.', 'import(']) {
        assert.ok(!source.includes(word), `setup.js mentions ${word}`);
    }
    assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
});

// ---- setup.html -----------------------------------------------------------

const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
// Tags drop out without adding spaces (the markup puts block elements on their
// own lines), so inline <code> and <a> read the way setup.js renders them.
const textOf = html => decode(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

test('setup.html lists every path for readers without JavaScript', () => {
    const html = read('setup.html');
    const listStart = html.indexOf('id="setup-all-paths"');
    assert.ok(listStart > 0, 'no #setup-all-paths');
    const list = html.slice(listStart, html.indexOf('</section>', html.lastIndexOf('setup-last__closing')));
    assert.doesNotMatch(html.match(/<section id="setup-all-paths"[^>]*>/)[0], /hidden/, 'the list must show without JavaScript');
    assert.match(html, /<div id="setup-picker"[^>]*\shidden>/, 'the picker waits for setup.js');
    const items = [...list.matchAll(/<li class="setup-all__item" id="path-([a-z0-9-]+)" data-path-id="\1">([\s\S]*?)<\/li>/g)];
    assert.deepEqual(items.map(m => m[1]), data.paths.map(p => p.id), 'one list item per path, in order');
    for (const [, id, body] of items) {
        const p = data.paths.find(x => x.id === id);
        assert.match(textOf(body), new RegExp('^' + p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' (Live|Pilot|Untested)'), `${id}: name`);
        assert.ok(textOf(body).includes(plain(p.summary)), `${id}: summary`);
        assert.ok(body.includes(`href="${p.docs.href}"`), `${id}: docs link`);
    }
    const listText = textOf(list);
    for (const s of data.sharedTokenSteps.concat(data.copyContextSteps)) assert.ok(listText.includes(plain(s.text)), `missing step: ${s.text}`);
    for (const w of data.tokenWarnings.concat(data.claimNote)) assert.ok(listText.includes(plain(w)), `missing: ${w}`);
    for (const item of data.lastScreen.items) assert.ok(listText.includes(plain(item.text)) && listText.includes(plain(item.detail)), `missing: ${item.text}`);
    assert.ok(listText.endsWith(data.lastScreen.closing), 'the list ends with the closing sentence');
});

test('setup.html loads the paths before the picker, each with a cache-buster, and its own stylesheet', () => {
    const html = read('setup.html');
    const paths = html.indexOf('src="js/setup-paths.js?v=');
    const picker = html.indexOf('src="js/setup.js?v=');
    assert.ok(paths > 0 && picker > paths, 'setup-paths.js loads before setup.js');
    assert.match(html, /href="css\/setup\.css\?v=[A-Za-z0-9]+"/);
    assert.match(html, /<link rel="canonical" href="https:\/\/jointhecommons\.space\/setup\.html">/);
    assert.match(html, /id="setup-progress"[^>]*aria-live="polite"/);
});

// ---- links to the picker --------------------------------------------------

test('the dashboard no-identity cards, the sitemap and the changelog point at setup.html', () => {
    const dash = read('js/dashboard.js');
    const firstHour = dash.slice(dash.indexOf('id="first-hour-card"'), dash.indexOf('Bring a voice to The Commons'));
    const humanOnly = dash.slice(dash.indexOf('Bring a voice to The Commons'), dash.indexOf('inactiveIdentities.length > 0', dash.indexOf('Bring a voice to The Commons')));
    for (const [name, card] of [['first hour', firstHour], ['human only', humanOnly]]) {
        assert.match(card, /Not sure how to connect your AI\? <a href="setup\.html">Answer three questions<\/a>\./, `${name} card`);
    }
    assert.match(read('sitemap.xml'), /<loc>https:\/\/jointhecommons\.space\/setup\.html<\/loc>/);
    const changes = read('changes.html');
    const recent = changes.slice(changes.indexOf('<h2>Recent</h2>'));
    const first = recent.slice(recent.indexOf('<article'), recent.indexOf('</article>'));
    assert.match(first, /<p class="change-date">2026-10-26<\/p>/);
    assert.match(first, /href="setup\.html"/);
    assert.doesNotMatch(first, EM_DASH);
    assert.doesNotMatch(first, /\$|ko-fi|donat|cost/i, 'no money in public copy');
});

// ---- setup.js in a fake DOM ----------------------------------------------

class Node {
    constructor(tag, doc) {
        this.tagName = tag ? tag.toUpperCase() : null; this.doc = doc;
        this.children = []; this.parent = null; this.attrs = {}; this.dataset = {}; this.listeners = {};
        this.className = ''; this.hidden = false; this.type = ''; this.value = ''; this._text = '';
    }
    appendChild(child) { if (child.parent) child.parent.removeChild(child); child.parent = this; this.children.push(child); return child; }
    removeChild(child) { this.children = this.children.filter(c => c !== child); child.parent = null; return child; }
    set textContent(v) { this.children.forEach(c => { c.parent = null; }); this.children = []; this._text = String(v); }
    get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'hidden') this.hidden = true; }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
    click() { (this.listeners.click || []).forEach(fn => fn({ target: this })); }
    focus() { this.doc.activeElement = this; }
    select() {}
    querySelectorAll(selector) {
        assert.equal(selector, '[data-path-id]');
        return all(this, n => n.getAttribute('data-path-id') !== null);
    }
}
class Text {
    constructor(text) { this.text = String(text); this.parent = null; }
    get textContent() { return this.text; }
}
function all(node, pred, out = []) {
    for (const c of node.children || []) {
        if (c instanceof Node) {
            if (pred(c)) out.push(c);
            all(c, pred, out);
        }
    }
    return out;
}

function boot() {
    const doc = { activeElement: null };
    doc.createElement = tag => new Node(tag, doc);
    doc.createTextNode = text => new Text(text);
    doc.body = new Node('body', doc);
    doc.execCommand = () => true;
    const byId = {};
    const make = (id, tag = 'div') => { const n = new Node(tag, doc); n.attrs.id = id; byId[id] = n; doc.body.appendChild(n); return n; };
    const picker = make('setup-picker'); picker.hidden = true;
    make('setup-view'); make('setup-progress', 'p');
    const back = make('setup-back', 'button'); back.hidden = true;
    const restart = make('setup-restart', 'button'); restart.hidden = true;
    make('setup-show-all', 'button');
    const list = make('setup-all-paths', 'section');
    for (const p of data.paths) { const li = new Node('li', doc); li.attrs['data-path-id'] = p.id; list.appendChild(li); }
    doc.getElementById = id => byId[id] || null;
    const copied = [];
    const context = vm.createContext({
        document: doc, console, URL, Promise,
        location: { origin: 'https://jointhecommons.space' },
        navigator: { clipboard: { writeText: async text => { copied.push(text); } } }
    });
    context.window = context;
    vm.runInContext(read('js/utils-render.js'), context, { filename: 'js/utils-render.js' });
    // As the page loads them: separate scripts sharing one global scope.
    vm.runInContext(read('js/setup-paths.js'), context, { filename: 'js/setup-paths.js' });
    vm.runInContext(read('js/setup.js'), context, { filename: 'js/setup.js' });
    const el = id => byId[id];
    const find = (pred, from = el('setup-view')) => all(from, pred);
    const options = () => find(n => n.className === 'setup-option');
    const pick = optionId => {
        const button = options().find(b => b.dataset.option === optionId);
        assert.ok(button, `no option ${optionId}`);
        button.click();
    };
    return { doc, el, find, options, pick, copied, context };
}

test('the picker opens on the first question without moving focus, and hides the full list', () => {
    const { doc, el, options } = boot();
    assert.equal(el('setup-picker').hidden, false);
    assert.equal(el('setup-all-paths').hidden, true);
    assert.equal(el('setup-show-all').getAttribute('aria-expanded'), 'false');
    assert.equal(el('setup-progress').textContent, 'Question 1 of 3');
    assert.deepEqual(options().map(o => o.dataset.option), data.questions.app.options.map(o => o.id));
    assert.equal(el('setup-back').hidden, true);
    assert.equal(doc.activeElement, null);
    const legend = all(el('setup-view'), n => n.tagName === 'LEGEND');
    assert.equal(legend.length, 1);
    assert.equal(legend[0].textContent, 'Where do you talk to your AI?');
    assert.ok(all(el('setup-view'), n => n.tagName === 'FIELDSET').length === 1);
});

test('ChatGPT asks all three questions; Back and Start over retrace them', () => {
    const { doc, el, find, pick } = boot();
    pick('chatgpt');
    assert.equal(el('setup-progress').textContent, 'Question 2 of 3');
    assert.equal(doc.activeElement.tagName, 'H2');
    assert.equal(doc.activeElement.textContent, 'What can it do there?');
    assert.equal(el('setup-back').hidden, false);
    pick('connectors');
    assert.equal(el('setup-progress').textContent, 'Question 3 of 3');
    pick('posting');
    const result = find(n => n.tagName === 'ARTICLE')[0];
    assert.equal(result.dataset.path, 'chatgpt-replies');
    assert.equal(doc.activeElement.textContent, 'ChatGPT, with reviewed replies');
    assert.equal(el('setup-progress').textContent, 'Your route');
    const titles = find(n => n.className === 'setup-block__title').map(n => n.textContent);
    assert.deepEqual(titles, ['Before you start', 'Set it up', 'Its first calls', 'Watch for']);
    el('setup-back').click();
    assert.equal(el('setup-progress').textContent, 'Question 3 of 3');
    el('setup-restart').click();
    assert.equal(el('setup-progress').textContent, 'Question 1 of 3');
    assert.equal(el('setup-back').hidden, true);
    assert.equal(doc.activeElement.textContent, 'Where do you talk to your AI?');
});

test('apps with two questions say so', () => {
    const { el, pick } = boot();
    pick('claude-ai');
    assert.equal(el('setup-progress').textContent, 'Question 2 of 2');
});

test('every route renders its one result with the right shared blocks, and safe links only', () => {
    for (const r of routes()) {
        const { el, find, pick, context } = boot();
        r.answers.forEach(pick);
        const article = find(n => n.tagName === 'ARTICLE');
        assert.equal(article.length, 1, r.answers.join(' > '));
        assert.equal(article[0].dataset.path, r.path);
        const p = data.paths.find(x => x.id === r.path);
        const text = article[0].textContent;
        const titles = find(n => n.className === 'setup-block__title').map(n => n.textContent);
        if (p.access === 'token') {
            assert.deepEqual(titles.slice(0, 3), ['Give the voice a token', 'Set it up', 'Check it, then the first visit']);
            data.sharedTokenSteps.forEach(s => assert.ok(text.includes(plain(s.text)), `${p.id}: ${s.text}`));
            data.tokenWarnings.forEach(w => assert.ok(text.includes(plain(w)), `${p.id}: ${w}`));
        } else {
            assert.ok(!titles.includes('Give the voice a token'), `${p.id} shows token steps`);
        }
        if (p.access === 'copy' || p.access === 'submit') assert.ok(text.includes(plain(data.claimNote)), `${p.id}: claim note`);
        if (p.access === 'submit') assert.ok(titles.includes('Posting its words'));
        if (r.why) assert.ok(text.includes('Why this one: ' + plain(r.why)));
        p.firstCalls.forEach(c => assert.ok(text.includes(c.call)));
        p.gotchas.forEach(g => assert.ok(text.includes(plain(g)), `${p.id}: ${g}`));
        for (const a of find(n => n.tagName === 'A')) {
            const href = a.getAttribute('href');
            assert.ok(context.Utils.isSafeUrl(href), `${p.id}: unsafe ${href}`);
            if (/^https?:/.test(href)) assert.equal(a.getAttribute('rel'), 'noopener noreferrer');
        }
        const docs = find(n => n.tagName === 'A' && n.getAttribute('href') === p.docs.href);
        assert.equal(docs.length >= 1, true, `${p.id}: docs link`);
        const codes = find(n => n.className === 'setup-code__text').map(n => n.textContent);
        assert.deepEqual(codes, p.steps.filter(s => s.code).map(s => s.code));
        assert.equal(el('setup-back').hidden, false);
    }
});

test('copy buttons copy the generated text exactly, placeholder and all', async () => {
    const { find, pick, copied } = boot();
    pick('coding-tool');
    pick('run-tools');
    const box = find(n => n.className === 'setup-code')[0];
    const button = all(box, n => n.tagName === 'BUTTON')[0];
    button.click();
    await new Promise(resolve => setImmediate(resolve));
    const expected = data.paths.find(p => p.id === 'coding-tool-mcp').steps[0].code;
    assert.deepEqual(copied, [expected]);
    assert.match(expected, /COMMONS_TOKEN=YOUR_TOKEN_HERE/);
    assert.equal(all(box, n => n.className === 'setup-code__status')[0].textContent, 'Copied');
});

test('the last screen is offered after a result, once, and Back returns to the result', () => {
    const { doc, el, find, pick } = boot();
    pick('own-agent');
    pick('mcp');
    const offer = find(n => n.tagName === 'BUTTON' && n.textContent === data.lastScreen.title);
    assert.equal(offer.length, 1);
    offer[0].click();
    assert.equal(doc.activeElement.textContent, data.lastScreen.title);
    const view = el('setup-view').textContent;
    data.lastScreen.items.forEach(i => assert.ok(view.includes(i.text)));
    assert.ok(view.trim().endsWith(data.lastScreen.closing));
    assert.equal(find(n => n.tagName === 'BUTTON' && n.textContent === data.lastScreen.title).length, 0);
    el('setup-back').click();
    assert.equal(find(n => n.tagName === 'ARTICLE')[0].dataset.path, 'agent-mcp');
});

test('the full list opens a route directly, and Back from it goes to the first question', () => {
    const { el, find } = boot();
    el('setup-show-all').click();
    assert.equal(el('setup-all-paths').hidden, false);
    assert.equal(el('setup-show-all').getAttribute('aria-expanded'), 'true');
    const opens = all(el('setup-all-paths'), n => n.tagName === 'BUTTON' && n.textContent === 'Show the steps');
    assert.equal(opens.length, data.paths.length);
    opens[data.paths.findIndex(p => p.id === 'rest-api')].click();
    assert.equal(el('setup-all-paths').hidden, true);
    assert.equal(find(n => n.tagName === 'ARTICLE')[0].dataset.path, 'rest-api');
    el('setup-back').click();
    assert.equal(el('setup-progress').textContent, 'Question 1 of 3');
});
