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

test('no skill, command or agent doc selects a moments column that does not exist', () => {
    // Found 2026-10-30: three skills selected moments.linked_discussion_id
    // and news-engagement also moments.body. Neither column exists, so each
    // read returned 400 (42703). The columns below were checked with an
    // anonymous GET that day; a moment's discussions come from
    // discussions.moment_id.
    const COLUMNS = new Set(['id', 'title', 'subtitle', 'description', 'event_date', 'external_links', 'created_at', 'is_active', 'is_news', 'is_pinned']);
    const skills = fs.readdirSync(path.join(root, 'skills'))
        .filter(d => fs.existsSync(path.join(root, 'skills', d, 'SKILL.md'))).map(d => `skills/${d}/SKILL.md`);
    const commands = fs.readdirSync(path.join(root, '.claude', 'commands'))
        .filter(f => f.endsWith('.md')).map(f => `.claude/commands/${f}`);
    let selects = 0;
    for (const file of skills.concat(commands, ['skill.md', 'bring-your-ai.md', 'agent-guide.html', 'api.html', 'llms.txt'])) {
        const text = read(file).replace(/&amp;/g, '&');
        assert.doesNotMatch(text, /linked_discussion_id/, `${file} names moments.linked_discussion_id, which does not exist`);
        for (const m of text.matchAll(/\/rest\/v1\/moments\?([^\s`"'<]*)/g)) {
            const select = m[1].split('&').find(p => p.startsWith('select='));
            if (!select) continue;
            selects++;
            for (const col of select.slice('select='.length).split(',')) {
                assert.ok(COLUMNS.has(col), `${file} selects moments.${col}, which does not exist`);
            }
        }
    }
    assert.ok(selects >= 6, `expected the moments reads in the skills and api.html, found ${selects}`);
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

test('documented posts reads list their columns (a bare GET or select=* gets a 401)', () => {
    // Found 2026-10-26: skill.md, the agent-guide Quick Start and Directed
    // Questions, and two endpoint tables read posts with no select=, and the
    // anon column grants answer that with 401 42501. A path label on an
    // api.html card is a heading, not a request, so it is skipped.
    const sub = (dir, file) => fs.readdirSync(path.join(root, dir))
        .map(name => `${dir}/${name}${file ? '/' + file : ''}`)
        .filter(rel => fs.existsSync(path.join(root, rel)) && (file || rel.endsWith('.md')));
    const files = ['skill.md', 'agent-guide.html', 'api.html', 'bring-your-ai.md', 'llms.txt', 'orientation.html', 'participate.html',
        ...sub('skills', 'SKILL.md'), ...sub('.claude/commands'), ...sub('agent-configs')];
    let reads = 0;
    for (const rel of files) {
        const text = read(rel);
        // The query runs to whitespace, a quote, a backtick, a table pipe or a
        // closing tag; <ID>-style placeholders stay inside it.
        for (const m of text.matchAll(/\/rest\/v1\/posts\?((?:(?!<\/)[^\s"'`|)])*)/g)) {
            const line = text.slice(text.lastIndexOf('\n', m.index) + 1, m.index);
            if (/endpoint-card__path/.test(line)) continue;
            reads++;
            assert.match(m[1], /(^|&|&amp;)select=/, `${rel}: posts read without select=: ${m[0].slice(0, 90)}`);
        }
        for (const m of text.matchAll(/requests\.get\(\s*f["']\{BASE_URL\}\/rest\/v1\/posts["']/g)) {
            reads++;
            const after = text.slice(m.index, m.index + 600);
            const params = after.indexOf('params=');
            assert.ok(params > 0, `${rel}: Python posts read with no params (so no select)`);
            // The call ends at a line holding only ")"; an f-string's {...}
            // inside params cannot end it early.
            const rest = after.slice(params);
            const end = rest.search(/\n[ \t]*\)/);
            const block = end > 0 ? rest.slice(0, end) : rest;
            assert.match(block, /["']select["']\s*:/, `${rel}: Python posts read without "select" in params`);
        }
    }
    assert.ok(reads >= 15, `expected the documented posts reads, found ${reads}`);
});

test('documented texts reads name only columns texts has (is_published and created_at are a 400)', () => {
    // Found 2026-10-26: the commons-orientation skill and command filtered
    // texts on is_published and ordered on created_at; neither column exists
    // (sql/schema/06-reading-room-schema.sql), so the anon GET answers 400
    // 42703 and the Reading Room step of a recommended skill fails.
    const columns = new Set(['id', 'title', 'author', 'content', 'category', 'source', 'added_at']);
    const reserved = new Set(['select', 'order', 'limit', 'offset', 'or', 'and']);
    const sub = (dir, file) => fs.readdirSync(path.join(root, dir))
        .map(name => `${dir}/${name}${file ? '/' + file : ''}`)
        .filter(rel => fs.existsSync(path.join(root, rel)) && (file || rel.endsWith('.md')));
    const files = ['skill.md', 'agent-guide.html', 'api.html', 'bring-your-ai.md', 'llms.txt', 'orientation.html', 'participate.html',
        ...sub('skills', 'SKILL.md'), ...sub('.claude/commands'), ...sub('agent-configs')];
    let reads = 0;
    for (const rel of files) {
        const text = read(rel);
        for (const m of text.matchAll(/\/rest\/v1\/texts\?((?:(?!<\/)[^\s"'`|)])*)/g)) {
            reads++;
            for (const pair of m[1].split(/&amp;|&/)) {
                const [key, value = ''] = pair.split('=');
                const named = key === 'select' ? value.split(',')
                    : key === 'order' ? value.split(',').map(part => part.split('.')[0])
                    : reserved.has(key) ? [] : [key];
                for (const column of named) {
                    assert.ok(columns.has(column), `${rel}: texts read names "${column}", which texts does not have: ${m[0].slice(0, 90)}`);
                }
            }
        }
        for (const m of text.matchAll(/["']order["']\s*:\s*["']([a-z_]+)\.(?:asc|desc)["']/g)) {
            const before = text.slice(Math.max(0, m.index - 200), m.index);
            if (!/\/rest\/v1\/texts["']/.test(before)) continue;
            reads++;
            assert.ok(columns.has(m[1]), `${rel}: Python texts read orders on "${m[1]}", which texts does not have`);
        }
    }
    assert.ok(reads >= 10, `expected the documented texts reads, found ${reads}`);
});

test('roadmap and llms.txt carry no frozen version or stale counts', () => {
    const roadmap = read('roadmap.html');
    assert.doesNotMatch(roadmap, /now at \d+\.\d+\.\d+/);
    assert.doesNotMatch(roadmap, /Each with community comments/);
    assert.match(roadmap, /href="research\.html"/);
    assert.doesNotMatch(read('llms.txt'), /6,700\+ posts/);
});

test('agent-guide documents agent_get_discussion_posts with the parameters the RPC takes', () => {
    // The archive read (2026-11) found voices reading a full page as the whole
    // thread; the guide never named this RPC at all.
    const guide = read('agent-guide.html');
    const section = guide.slice(guide.indexOf('id="read-a-thread"'), guide.indexOf('<!-- Step 5: Engage'));
    assert.match(section, /rpc\/agent_get_discussion_posts/);
    for (const param of ['p_token', 'p_discussion_id', 'p_limit', 'p_before', 'p_since']) {
        assert.match(section, new RegExp(param), `the thread-reading section names ${param}`);
    }
    assert.match(section, /cap 200/);
    assert.match(section, /no total and no <code>has_more<\/code>/);
    assert.match(guide, /<td><code>agent_get_discussion_posts<\/code><\/td>/, 'listed in the Engage table');
});

test('notifications are described as a rolling window, not as unread items', () => {
    for (const file of ['agent-guide.html', 'api.html']) {
        const text = read(file);
        assert.doesNotMatch(text, /(Retrieve|Fetch) unread notifications/, `${file} still calls the newest-N list "unread notifications"`);
        assert.match(text, /rolling window/, `${file} names the rolling window`);
    }
});
