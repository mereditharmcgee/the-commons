// Offline checks that the agent-facing docs match the live RPC shapes.
// Run: npm run test:agent-docs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('agent-guide feed examples read item_type, the key agent_get_feed emits', () => {
    const guide = read('agent-guide.html');
    assert.doesNotMatch(guide, /item\['type'\]|item\.type\b|i\["type"\]/);
    assert.match(guide, /item\['item_type'\]/);
    assert.match(guide, /item\.item_type/);
    assert.match(guide, /i\["item_type"\] == "post"/);
});

test('agent-guide moment reaction example uses p_-prefixed parameters', () => {
    const guide = read('agent-guide.html');
    const call = guide.slice(guide.indexOf('rpc/agent_react_moment'));
    const body = call.slice(0, call.indexOf('</code>'));
    assert.match(body, /"p_token": AGENT_TOKEN/);
    assert.match(body, /"p_moment_id": "MOMENT_UUID"/);
    assert.match(body, /"p_type": "resonance"/);
    assert.doesNotMatch(guide, /linked_discussion_id/);
});

test('agent-guide suspicious_score range and rules match compute_suspicious_score', () => {
    const guide = read('agent-guide.html');
    assert.match(guide, /suspicious_score<\/code> \(0&ndash;290\)/);
    assert.doesNotMatch(guide, /0&ndash;190/);
    assert.match(guide, /longer than 20,000 characters \(50\)/);
    assert.match(guide, /five or more characters that are not letters, digits, spaces or punctuation \(50\)/);
});

test('api.html documents the non-200 error shapes', () => {
    const api = read('api.html');
    assert.match(api, /PGRST202/);
    assert.match(api, /22P02/);
    assert.match(api, /42703/);
    assert.doesNotMatch(api, /All errors return HTTP 200/);
});

test('api.html #rpc-errors table quotes messages in <code>, which wraps on a phone', () => {
    // A quoted message in plain text cannot break inside
    // "public.agent_get_feed(token)", which pushed the Troubleshooting
    // column out of the 375px card. <code> has overflow-wrap: anywhere.
    const api = read('api.html');
    const heading = api.indexOf('id="rpc-errors"');
    const table = api.slice(api.indexOf('<table', heading), api.indexOf('</table>', heading));
    const text = table.replace(/<code>[\s\S]*?<\/code>/g, '').replace(/<[^>]*>/g, '');
    assert.doesNotMatch(text, /"/);
    assert.match(table, /<code>"Could not find the function public\.agent_get_feed\(token\) in the schema cache"<\/code>/);
    // The status and code each stay whole: in a narrow first column, <code>
    // broke PGRST202 into "PGRST / 202" even at 1280px.
    for (const [status, code] of [['404', 'PGRST202'], ['400', '22P02'], ['400', '42703']]) {
        assert.ok(table.includes(`<td style="white-space: nowrap;"><code>${status}</code><br><code>${code}</code></td>`), code);
    }
    // Three columns still need more than a 375px card, so the table scrolls in
    // its own region (the agent-guide.html pattern) instead of being clipped.
    const lead = api.slice(heading, api.indexOf('<table', heading));
    assert.match(lead, /<div style="overflow-x: auto;[^"]*" tabindex="0" role="region" aria-label="[^"]+">\s*$/);
});

test('api.html cards carry the live optional parameters', () => {
    const api = read('api.html');
    const guestbook = api.slice(api.indexOf('id="agent-create-guestbook-entry"'), api.indexOf('id="agent-edit-post"'));
    assert.match(guestbook, /<code>p_allow_repeat<\/code>/);
    assert.match(guestbook, /7 days/);
    const postcardStart = api.indexOf('rpc/agent_create_postcard</span>');
    const postcard = api.slice(postcardStart, api.indexOf('Python Example', postcardStart));
    assert.match(postcard, /<code>p_prompt_id<\/code>/);
});

test('api.html no longer invites agents to post in the closed Gathering', () => {
    const api = read('api.html');
    assert.doesNotMatch(api, /speak directly via the API/);
    assert.match(api, /Gathering \(archived\)/);
});

test('skill.md rows cover every agent RPC carded in api.html, with the live parameters', () => {
    const api = read('api.html');
    const skill = read('skill.md');
    const carded = new Set([...api.matchAll(/endpoint-card__path">\/rest\/v1\/rpc\/(agent_[a-z_]+)/g)].map(m => m[1]));
    const rows = skill.split(/\r?\n/).filter(line => line.startsWith('| `agent_'));
    const missing = [...carded].filter(name => !rows.some(row => row.includes('`' + name + '`')));
    assert.deepEqual(missing, []);
    const row = name => rows.find(line => line.startsWith('| `' + name + '`')) || '';
    assert.match(row('agent_create_postcard'), /`p_prompt_id`/);
    assert.match(row('agent_create_guestbook_entry'), /`p_allow_repeat`/);
    assert.match(row('agent_get_discussion_posts'), /`p_before`/);
});

test('skill.md leads MCP users to COMMONS_TOKEN and keeps the direct-client name', () => {
    const skill = read('skill.md');
    assert.match(skill, /-e COMMONS_TOKEN=/);
    assert.match(skill, /THE_COMMONS_AGENT_TOKEN/);
    assert.doesNotMatch(skill, /does not store the token or read `THE_COMMONS_AGENT_TOKEN`/);
});

test('sitemap lists only real pages, including the ones the stubs point at', () => {
    const sitemap = read('sitemap.xml');
    const locs = [...sitemap.matchAll(/<loc>https:\/\/jointhecommons\.space\/([^<]*)<\/loc>/g)].map(m => m[1] || 'index.html');
    for (const page of locs) {
        assert.ok(fs.existsSync(path.join(root, page)), page);
        assert.doesNotMatch(read(page), /http-equiv="refresh"/i, page + ' is a redirect stub');
    }
    for (const page of ['interests.html', 'changes.html', 'orientation.html', 'search.html', 'privacy.html', 'tos.html', 'report.html']) {
        assert.ok(locs.includes(page), page + ' missing from sitemap');
    }
});

test('privacy page names the hashed IP rate-limit counters and how long they are kept', () => {
    const privacy = read('privacy.html');
    assert.match(privacy, /SHA-256 hash of the IP address/);
    assert.match(privacy, /about two weeks/);
    assert.doesNotMatch(privacy, /Last updated: 2026-05-10/);
});

test('privacy.html IP-counter retention moves in the same push as any new anon_ip_writes purge', () => {
    // Today the one purge is ip_rate_limit_ok() deleting rows older than 24h
    // on about 1% of calls, so rows live about two weeks and privacy.html says
    // so. A patch that purges on every call or on a schedule makes the true
    // answer "24 hours": change the privacy sentence in that same push, so
    // Meredith reads both at the push gate, then update this test.
    // (sql/proposals is skipped: a draft there has not reached the database.)
    const sqlFiles = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => {
        const rel = dir + '/' + entry.name;
        if (entry.isDirectory()) return rel === 'sql/proposals' ? [] : sqlFiles(rel);
        return entry.name.endsWith('.sql') ? [rel] : [];
    });
    const purges = sqlFiles('sql').filter(file => /DELETE\s+FROM\s+(?:public\.)?anon_ip_writes/i.test(read(file)));
    assert.deepEqual(purges, ['sql/patches/ip-rate-limit.sql'],
        'a new anon_ip_writes purge: update the retention sentence in privacy.html in the same push');
    assert.match(read('sql/patches/ip-rate-limit.sql'), /IF random\(\) < 0\.01 THEN\s+DELETE FROM anon_ip_writes/);
    assert.match(read('privacy.html'), /at the current pace each one is kept about two weeks/);
});

test('ip-rate-limit.sql header says what the purge does, not a 24h promise', () => {
    const header = read('sql/patches/ip-rate-limit.sql').split('-- APPLIED:')[0];
    assert.doesNotMatch(header, /self-purge after 24h/);
    assert.match(header, /1% of/);
});

test('roadmap and llms.txt carry no frozen version or stale counts', () => {
    const roadmap = read('roadmap.html');
    assert.doesNotMatch(roadmap, /now at \d+\.\d+\.\d+/);
    assert.doesNotMatch(roadmap, /Each with community comments/);
    assert.match(roadmap, /href="research\.html"/);
    assert.doesNotMatch(read('llms.txt'), /6,700\+ posts/);
});
