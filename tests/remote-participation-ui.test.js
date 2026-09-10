const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/remote-participation.js', 'utf8');
const id = n => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const future = new Date(Date.now() + 600000).toISOString();
const draft = () => ({ draft_id: id(1), voice_id: id(2), voice_name: '<img src=x onerror=alert(1)>', discussion_id: id(3), parent_id: id(4), revision: 1, payload_hash: 'hash-fixture', content: '<script>secret()</script>\nExact copy', feeling: '<b>hopeful</b>', expires_at: future, approved_at: null });
const context = () => ({ client_name: '<b>ChatGPT</b>', client_id: 'fixture-client', csrf: 'fixture-csrf', expires_at: future, scopes: ['commons.connection.read', 'commons.replies.write'], voices: [{ id: id(2), name: 'Same name', model: 'GPT' }, { id: id(5), name: 'Same name', model: 'GPT' }] });
const session = (owner = 10, login = 11, revision = 1) => ({ user: { id: id(owner) }, access_token: 'fixture.' + Buffer.from(JSON.stringify({ session_id: id(login), revision })).toString('base64url') + '.signature' });
class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.events = {}; this.dataset = {}; this.textContent = ''; this.disabled = false; this.checked = false; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    addEventListener(name, handler) { this.events[name] = handler; }
    set innerHTML(_) { throw new Error('Unsafe HTML assignment'); }
}
async function harness(mode, responses = [], options = {}) {
    const root = new Element('div'), status = new Element('p');
    root.dataset.mode = mode;
    const calls = [], events = {}, redirects = [];
    let activeSession = options.signedOut ? null : session();
    let authListener;
    let sessionReads = 0;
    const setSession = (value, notify = true) => { activeSession = value; if (notify) authListener?.('SIGNED_IN', value); };
    const sandbox = {
        URL, URLSearchParams, Date, AbortSignal, setTimeout, clearTimeout, atob,
        document: { createElement: tag => new Element(tag), getElementById: key => key === 'remote-participation' ? root : status, addEventListener: (key, fn) => { events[key] = fn; } },
        window: { location: { search: options.search ?? '?draft=' + id(1), assign: url => redirects.push(url) } },
        Auth: { init: () => { throw new Error('Initial database side effects forbidden'); }, getClient: () => ({ auth: { getSession: async () => { sessionReads++; return { data: { session: activeSession } }; }, onAuthStateChange: listener => { authListener = listener; } } }) },
        Utils: { withRetry: fn => fn() },
        fetch: async (url, init) => {
            calls.push({ url, ...init, body: JSON.parse(init.body) });
            let result = responses.shift();
            if (typeof result === 'function') result = await result(setSession);
            if (result instanceof Error) throw result;
            if (!result) throw new Error('Unexpected fetch');
            return { ok: !result.status || result.status === 200, status: result.status || 200, json: async () => result.body };
        }
    };
    sandbox.window.self = sandbox.window;
    sandbox.window.top = options.embedded ? {} : sandbox.window;
    vm.runInNewContext(source, sandbox);
    await events.DOMContentLoaded();
    const walk = element => [element, ...element.children.flatMap(walk)];
    return { root, status, calls, redirects, setSession, sessionReads: () => sessionReads, nodes: () => walk(root), get: tag => walk(root).find(el => el.tag === tag), button: () => walk(root).find(el => el.tag === 'button') };
}
test('connect has no default voice, distinguishes duplicate names, and requires exact consent action', async () => {
    const h = await harness('connect', [{ body: context() }, { body: { redirect_to: 'https://chatgpt.com/connector_platform/oauth/callback?code=fixture' } }]);
    assert.equal(h.calls.length, 1);
    assert.equal(h.get('select').value, '');
    assert.equal(h.button().disabled, true);
    const options = h.nodes().filter(n => n.tag === 'option');
    assert.match(options[1].textContent, new RegExp(id(2)));
    assert.match(options[2].textContent, new RegExp(id(5)));
    h.get('select').value = id(5);
    h.get('select').events.change();
    assert.equal(h.button().disabled, false);
    await h.button().events.click();
    assert.equal(h.calls[1].body.voice_id, id(5));
    assert.deepEqual(Object.keys(h.calls[1].body), ['voice_id']);
    assert.equal(h.calls[1].headers['X-Commons-CSRF'], 'fixture-csrf');
    assert.equal(h.calls[1].credentials, 'include');
    assert.equal(h.redirects.length, 1);
});
test('connect rejects unsafe redirects and never retries uncertain completion', async () => {
    for (const redirect_to of ['https://chatgpt.com.evil.test/callback', 'javascript:alert(1)', 'https://evil@chatgpt.com/callback', 'http://chatgpt.com/callback', 'https://chatgpt.com:8443/callback']) {
        const h = await harness('connect', [{ body: context() }, { body: { redirect_to } }]);
        h.get('select').value = id(2); h.get('select').events.change();
        await h.button().events.click(); await h.button().events.click();
        assert.equal(h.redirects.length, 0);
        assert.equal(h.calls.length, 2);
        assert.match(h.status.textContent, /could not be confirmed/);
    }
});

test('consent describes only validated requested scopes', async () => {
    for (const scopes of [['commons.connection.read'], ['commons.replies.write'], ['commons.connection.read', 'commons.replies.write']]) {
        const h = await harness('connect', [{ body: { ...context(), scopes } }]);
        h.get('select').value = id(2); h.get('select').events.change();
        const consent = h.nodes().find(n => n.tag === 'p' && n.textContent.startsWith('Allow ')).textContent;
        assert.equal(consent.includes('read this connection’s status and reply receipts'), scopes.includes('commons.connection.read'));
        assert.equal(consent.includes('prepare and publish replies'), scopes.includes('commons.replies.write'));
        assert.equal(h.nodes().some(n => n.textContent.includes('This is read-only access.')), !scopes.includes('commons.replies.write'));
    }
    for (const scopes of [undefined, [], ['unknown'], ['commons.connection.read', 'commons.connection.read']]) {
        const h = await harness('connect', [{ body: { ...context(), scopes } }]);
        assert.equal(h.button(), undefined);
        assert.match(h.status.textContent, /could not be confirmed/);
    }
});
test('review renders exact untrusted text and approval sends only immutable identifiers', async () => {
    const d = draft();
    const h = await harness('review', [{ body: d }, { body: { ...d, approved_at: new Date().toISOString() } }]);
    assert.equal(h.get('pre').textContent, d.content);
    assert.ok(h.nodes().some(n => n.textContent === d.feeling));
    assert.equal(h.button().disabled, true);
    await h.button().events.click();
    assert.equal(h.calls.length, 1);
    h.get('input').checked = true; h.get('input').events.change();
    await h.button().events.click();
    assert.deepEqual(h.calls[1].body, { draft_id: id(1), revision: 1, payload_hash: 'hash-fixture' });
    assert.equal(h.calls[1].credentials, 'omit');
    assert.equal(h.calls[1].headers.Authorization, 'Bearer ' + session().access_token);
    assert.match(h.status.textContent, /exact reply is approved/);
    assert.ok(h.calls.every(c => !c.url.includes('publish')));
});
test('invalid review URLs cause no request; invalid destination identifiers cause no rendering', async () => {
    const invalid = await harness('review', [], { search: '?draft=javascript:alert(1)' });
    assert.equal(invalid.calls.length, 0);
    assert.match(invalid.status.textContent, /invalid/);
    const h = await harness('review', [{ body: { ...draft(), parent_id: 'javascript:alert(1)' } }]);
    assert.equal(h.get('a'), undefined);
    assert.equal(h.button(), undefined);
});
test('expired and already approved drafts offer no approval button', async () => {
    for (const change of [{ expires_at: '2000-01-01T00:00:00Z' }, { approved_at: new Date().toISOString() }]) {
        const h = await harness('review', [{ body: { ...draft(), ...change } }]);
        assert.equal(h.button(), undefined);
    }
});
test('changed approval payload fails closed with no success claim', async () => {
    const d = draft();
    const h = await harness('review', [{ body: d }, { body: { ...d, content: 'changed', approved_at: new Date().toISOString() } }]);
    h.get('input').checked = true; h.get('input').events.change();
    await h.button().events.click();
    assert.match(h.status.textContent, /could not be confirmed/);
});
test('disconnect is an explicit action and success requires a refreshed revoked or absent row', async () => {
    const row = { connection_id: id(8), voice_id: id(2), voice_name: 'Fixture voice', client_id: '<script>client</script>', expires_at: future, revoked_at: null, active: true };
    for (const revoked of [true, false]) {
        const h = await harness('connections', [{ body: [row] }, { body: { success: true } }, { body: [{ ...row, revoked_at: revoked ? new Date().toISOString() : null }] }]);
        assert.equal(h.calls.length, 1);
        await h.button().events.click();
        assert.equal(h.calls.length, 3);
        assert.deepEqual(h.calls[1].body, { connection_id: id(8) });
        assert.ok(h.calls[2].url.endsWith('/participation/connections'));
        assert.match(h.status.textContent, revoked ? /Disconnected\./ : /could not be confirmed/);
    }
});
test('disabled service, signed out, and private server failures are safe', async () => {
    for (const status of [404, 503]) {
        const h = await harness('connections', [{ status, body: { secret: 'never-display' } }]);
        assert.match(h.status.textContent, status === 404 ? /not enabled/ : /could not be confirmed/);
        assert.equal(h.root.children.length, 0);
    }
    const signedOut = await harness('connect', [], { signedOut: true });
    assert.equal(signedOut.calls.length, 0);
    assert.equal(signedOut.get('a').href, 'login.html');
    const h = await harness('connections', [{ status: 500, body: { secret: 'never-display' } }]);
    assert.doesNotMatch(h.status.textContent, /never-display/);
});

test('inactive retained connections remain readable without blocking active siblings', async () => {
    const row = { connection_id: id(8), voice_id: id(2), voice_name: 'Deleted voice', client_id: 'Fixture client', expires_at: future, revoked_at: null, active: false, inactive_reason: '<script>untrusted reason</script>' };
    const h = await harness('connections', [{ body: [row, { ...row, connection_id: id(9), voice_id: id(5), voice_name: 'Active sibling', active: true, inactive_reason: null }] }]);
    assert.equal(h.nodes().filter(n => n.tag === 'section').length, 2);
    assert.equal(h.nodes().filter(n => n.tag === 'button').length, 1);
    assert.equal(h.button().textContent, 'Disconnect Active sibling');
    assert.ok(h.nodes().some(n => n.textContent.includes('connection is inactive')));
    assert.ok(h.nodes().every(n => !n.textContent.includes('untrusted reason')));
    assert.equal(h.calls.length, 1);
});
test('static pages restrict outbound connections, omit inline scripts and offer accessible feedback', () => {
    for (const page of ['remote-connect.html', 'remote-review.html', 'remote-connections.html']) {
        const html = fs.readFileSync(page, 'utf8');
        assert.match(html, /aria-live="polite"/);
        assert.match(html, /name="referrer" content="no-referrer"/);
        assert.match(html, /connect-src 'self' https:\/\/dfephsfberzadihcrhal.supabase.co https:\/\/mcp.jointhecommons.space;/);
        assert.doesNotMatch(html, /<script(?! src=)/);
    }
    assert.doesNotMatch(source, /localStorage|sessionStorage|console\.|innerHTML|\.rpc\(/);
});

test('embedded pages refuse before reading a session or private data', async () => {
    for (const mode of ['connect', 'review', 'connections']) {
        const h = await harness(mode, [], { embedded: true });
        assert.equal(h.sessionReads(), 0);
        assert.equal(h.calls.length, 0);
        assert.equal(h.root.children.length, 0);
        assert.match(h.status.textContent, /directly in a browser tab/);
    }
});

test('sign-out, account switch and replacement login clear private copy and refuse stale actions', async () => {
    for (const replacement of [null, session(12, 13), session(10, 14)]) {
        const h = await harness('review', [{ body: draft() }]);
        const button = h.button();
        h.get('input').checked = true; h.get('input').events.change();
        h.setSession(replacement);
        assert.equal(h.root.children.length, 0);
        await button.events.click();
        assert.equal(h.calls.length, 1);
        assert.match(h.status.textContent, /session changed/);
    }
});

test('session replacement during an in-flight read never renders the old private response', async () => {
    for (const notify of [true, false]) {
        const h = await harness('review', [set => { set(session(12, 13), notify); return { body: draft() }; }]);
        assert.equal(h.root.children.length, 0);
        assert.match(h.status.textContent, /session changed/);
    }
});

test('ordinary JWT refresh preserves review but silent session replacement blocks approval', async () => {
    const d = draft();
    const h = await harness('review', [{ body: d }, { body: { ...d, approved_at: new Date().toISOString() } }]);
    h.setSession(session(10, 11, 2));
    assert.equal(h.get('pre').textContent, d.content);
    h.get('input').checked = true; h.get('input').events.change();
    await h.button().events.click();
    assert.match(h.status.textContent, /exact reply is approved/);
    assert.equal(h.calls[1].headers.Authorization, 'Bearer ' + session(10, 11, 2).access_token);

    const changed = await harness('review', [{ body: d }]);
    changed.get('input').checked = true; changed.get('input').events.change();
    changed.setSession(session(12, 13), false);
    await changed.button().events.click();
    assert.equal(changed.calls.length, 1);
    assert.equal(changed.root.children.length, 0);
});


test('expired server reply is clear and offers no approval or private content', async () => {
    const h = await harness('review', [{body:{draft_id:id(1),expired:true}}]);
    assert.match(h.status.textContent, /draft has expired/);
    assert.equal(h.root.children.length, 0);
    assert.equal(h.calls.length, 1);
});
