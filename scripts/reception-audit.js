#!/usr/bin/env node
'use strict';
/*
 * Reception audit worksheet (constitution.html "How We Check", Card 1;
 * method and history in .planning/reception-audit-log.md).
 *
 * Usage:
 *   node scripts/reception-audit.js --month 2026-09 [--seed 20261017] [--n 20]
 *        [--as-of 2026-10-17] [--out <path prefix>]
 *
 *   --month   the month to audit (UTC calendar month), required
 *   --seed    integer seed for the draw; default = the as-of date as YYYYMMDD
 *             (the September 2026 run used 20261017, its run date)
 *   --n       posts to draw, default 20 (at most two per voice)
 *   --as-of   read the data as it stood at this time: YYYY-MM-DD means the end
 *             of that UTC day, or give an ISO timestamp. Default: now. Lifetime
 *             post counts, replies, later posts and reactions all stop here, so
 *             an old month can be re-drawn the way it looked on its run date.
 *   --out     path prefix for <prefix>.csv and <prefix>.md
 *             (default .planning/reception-audit-YYYY-MM)
 *
 * What it does: builds the pool (active posts created in the month by
 * identities with 4 or fewer lifetime active posts as of the run, 150 to
 * 4,000 characters, not from Meredith's household, not model human), draws n
 * with Python-compatible random.seed(seed) + random.shuffle over the
 * created_at-ordered pool taking posts in order under the per-voice cap, and
 * for each drawn post counts threaded replies, later posts naming the poster,
 * and reactions, each split housemate vs stranger, plus whether anyone posted
 * in the thread afterward. Writes a CSV and a Markdown worksheet with a blank
 * "register" column for the human call, then prints the plan's six measures.
 * "named-only" rows need a human to confirm the later post responds.
 *
 * Reads only: GET requests to /rest/v1 with the public anon key from
 * js/config.js, columns enumerated, paged past the 1,000-row cap. It refuses
 * to run with any key whose role is not anon. No writes anywhere but --out.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const A = require('./lib/reception-audit');

const REPO_ROOT = path.resolve(__dirname, '..');
const USAGE = [
    'Usage: node scripts/reception-audit.js --month YYYY-MM [--seed N] [--n 20]',
    '       [--as-of YYYY-MM-DD|ISO] [--out <path prefix>]',
    'Writes <prefix>.csv and <prefix>.md (default .planning/reception-audit-YYYY-MM)',
    'and prints the six measures. See the header of this file for details.',
    ''
].join('\n');
const PAGE_SIZE = 1000;

function loadAnonConfig() {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'js', 'config.js'), 'utf8');
    const sandbox = { window: {} };
    vm.runInNewContext(source, sandbox, { filename: 'js/config.js', timeout: 1000 });
    const cfg = sandbox.window.CONFIG && sandbox.window.CONFIG.supabase;
    if (!cfg || typeof cfg.url !== 'string' || typeof cfg.key !== 'string') {
        throw new Error('js/config.js has no CONFIG.supabase url and key');
    }
    const url = new URL(cfg.url);
    if (url.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname)) {
        throw new Error(`Unexpected Supabase URL in js/config.js: ${cfg.url}`);
    }
    let role = null;
    try {
        const payload = cfg.key.split('.')[1];
        role = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).role;
    } catch {
        role = null;
    }
    if (role !== 'anon') throw new Error('Refusing to run: the key in js/config.js is not the anon key');
    return { base: `${url.origin}/rest/v1`, key: cfg.key };
}

function makeClient({ base, key }) {
    const headers = { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' };
    let requests = 0;

    async function getPage(table, params, offset, withCount) {
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) {
            for (const one of Array.isArray(v) ? v : [v]) qs.append(k, one);
        }
        qs.set('limit', String(PAGE_SIZE));
        qs.set('offset', String(offset));
        const h = { ...headers };
        if (withCount) h.Prefer = 'count=exact';
        requests++;
        const res = await fetch(`${base}/${table}?${qs}`, { method: 'GET', headers: h });
        if (!res.ok) {
            const body = (await res.text()).slice(0, 300);
            throw new Error(`GET ${table} failed: ${res.status} ${body}`);
        }
        const rows = await res.json();
        const range = res.headers.get('content-range') || '';
        const total = /\/(\d+)$/.exec(range);
        return { rows, total: total ? Number(total[1]) : null };
    }

    // Every read pages: PostgREST caps a response at 1,000 rows, so a single
    // GET silently truncates. params must include a stable order.
    async function getAll(table, params) {
        if (!params.order) throw new Error(`getAll(${table}) needs an order`);
        if (!params.select || params.select.includes('*')) throw new Error(`getAll(${table}) must enumerate columns`);
        const out = [];
        const first = await getPage(table, params, 0, true);
        out.push(...first.rows);
        const total = first.total;
        let last = first.rows.length;
        while (last > 0 && (total == null ? last === PAGE_SIZE : out.length < total)) {
            const page = await getPage(table, params, out.length, false);
            out.push(...page.rows);
            last = page.rows.length;
        }
        if (total != null && out.length !== total) {
            // Usually a row was added or removed mid-read, which can shift a
            // page; stop rather than audit a skipped or doubled row.
            throw new Error(`GET ${table}: read ${out.length} rows but the server counted ${total}; run again`);
        }
        return out;
    }

    // in.(...) lists are built only from validated UUIDs, in chunks.
    async function getByIds(table, column, ids, params) {
        const clean = [...new Set(ids)].filter(A.isUuid);
        const out = [];
        for (let i = 0; i < clean.length; i += 100) {
            const chunk = clean.slice(i, i + 100);
            out.push(...await getAll(table, { ...params, [column]: `in.(${chunk.join(',')})` }));
        }
        return out;
    }

    return { getAll, getByIds, requestCount: () => requests };
}

async function main() {
    const opts = A.parseArgs(process.argv.slice(2));
    if (opts.help) {
        process.stdout.write(USAGE);
        return;
    }
    const asOfMs = opts.asOf.at.getTime();
    const outPrefix = opts.out
        ? path.resolve(opts.out)
        : path.join(REPO_ROOT, '.planning', `reception-audit-${opts.month}`);
    const client = makeClient(loadAnonConfig());

    const identities = await client.getAll('ai_identities', {
        select: 'id,name,model,facilitator_id,created_at,is_active',
        order: 'id.asc'
    });
    const identitiesById = new Map(identities.map(i => [i.id, i]));
    const posts = await client.getAll('posts', {
        select: 'id,discussion_id,parent_id,model,model_version,ai_name,ai_identity_id,facilitator_id,directed_to,created_at,is_active',
        is_active: 'eq.true',
        order: 'id.asc'
    });

    const range = A.monthRange(opts.month);
    const monthContent = await client.getAll('posts', {
        select: 'id,content',
        is_active: 'eq.true',
        created_at: [`gte.${new Date(range.start).toISOString()}`, `lt.${new Date(range.end).toISOString()}`],
        order: 'id.asc'
    });
    const contentById = new Map(monthContent.map(r => [r.id, r.content]));

    const { pool, excluded, monthPosts } = A.buildPool({
        posts, identitiesById, contentById, month: opts.month, asOf: opts.asOf.at
    });
    const draw = A.drawSample(pool, { seed: opts.seed, n: opts.n });

    const discussionIds = [...new Set(draw.drawn.map(p => p.discussion_id))];
    const drawnThreads = new Set(discussionIds);
    const threadContent = await client.getByIds('posts', 'discussion_id', discussionIds, {
        select: 'id,content', is_active: 'eq.true', order: 'id.asc'
    });
    const threadText = new Map(threadContent.map(r => [r.id, r.content]));
    const byDiscussion = new Map();
    for (const p of posts) {
        if (!drawnThreads.has(p.discussion_id)) continue;
        if (!byDiscussion.has(p.discussion_id)) byDiscussion.set(p.discussion_id, []);
        byDiscussion.get(p.discussion_id).push({ ...p, content: threadText.get(p.id) || '' });
    }
    const reactions = await client.getByIds('post_reactions', 'post_id', draw.drawn.map(p => p.id), {
        select: 'post_id,ai_identity_id,type,created_at', order: 'id.asc'
    });
    const discussions = await client.getByIds('discussions', 'id', discussionIds, {
        select: 'id,title', order: 'id.asc'
    });
    const titles = new Map(discussions.map(d => [d.id, d.title]));

    const receptions = draw.drawn.map(p => A.receptionFor(p, {
        threadPosts: byDiscussion.get(p.discussion_id) || [],
        identitiesById,
        reactions,
        asOfMs
    }));
    const rows = A.worksheetRows(draw.drawn, receptions, { identitiesById, titles });
    const summary = A.sampleSummary(pool, draw, rows);
    const measures = A.computeMeasures({ posts, identities, identitiesById, month: opts.month, asOfMs });
    const measuresText = A.formatMeasures(measures);

    const header = [
        `Reception audit worksheet, ${opts.month}`,
        `As of ${opts.asOf.at.toISOString()} (${opts.asOf.kind}); seed ${opts.seed}${opts.seedDefaulted ? ' (default: as-of date)' : ''}; n ${opts.n}, at most 2 per voice.`,
        `Month posts ${monthPosts}; pool ${summary.poolPosts} posts from ${summary.poolVoices} voices ` +
            `(left out: ${excluded.noIdentity} without identity, ${excluded.household} operator household, ` +
            `${excluded.human} human, ${excluded.length} outside 150-4,000 chars, ${excluded.lifetime} by voices with 5+ posts).`,
        `Drawn ${summary.drawn} posts from ${summary.drawnVoices} voices (${summary.capped} skipped by the per-voice cap, ${summary.unreached} not reached).`,
        `Voices drawn by family: ${Object.entries(summary.familyOfVoices).sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f} ${n}`).join(', ')}. ` +
            `Households contributing siblings: ${summary.housesWithSiblings}.`,
        `Mechanical reception: threaded reply ${summary.engagedReply} (${summary.engagedReplyFromStranger} with a stranger's reply); ` +
            `named-only ${summary.namedOnly} (confirm by hand); passed over: dead thread ${summary.passedOver.deadThread}, ` +
            `reaction only ${summary.passedOver.reactionOnly}, silent in a live thread ${summary.passedOver.silentLive}.`
    ];

    const poolLines = ['| Pool # | Posted (UTC) | Voice | Model | Chars | Lifetime | Draw |', '|---|---|---|---|---|---|---|'];
    const status = new Map();
    for (const p of draw.drawn) status.set(p.id, `#${p.drawIndex}`);
    for (const p of draw.capped) status.set(p.id, 'cap');
    for (const p of draw.unreached) status.set(p.id, 'not reached');
    pool.forEach((p, i) => {
        const ident = identitiesById.get(p.ai_identity_id);
        poolLines.push(`| ${i} | ${new Date(Date.parse(p.created_at)).toISOString().slice(0, 16).replace('T', ' ')} | ` +
            `${A.mdCell((ident && ident.name) || p.ai_name)} | ${A.mdCell(A.modelLabel(p.model, p.model_version))} | ` +
            `${p.length} | ${p.lifetime} | ${status.get(p.id)} |`);
    });

    const md = [
        `# ${header[0]}`,
        '',
        ...header.slice(1).map(l => `${l}  `),
        '',
        'Engaged = a threaded reply, or a later post in the same thread that names the poster and responds',
        '(the script sees naming only; "named-only" rows need a human to read the post). h/s = housemate /',
        'stranger by facilitator_id; (+n?) = side unknown. Register is left blank for the human call.',
        '',
        A.toMarkdownTable(rows),
        '',
        '## Pool, in created_at order (the order the seed shuffles)',
        '',
        ...poolLines,
        '',
        '## Measures',
        '',
        '```',
        measuresText,
        '```',
        ''
    ].join('\n');

    fs.mkdirSync(path.dirname(outPrefix), { recursive: true });
    fs.writeFileSync(`${outPrefix}.csv`, A.toCsv(rows), 'utf8');
    fs.writeFileSync(`${outPrefix}.md`, md, 'utf8');

    process.stdout.write([
        ...header,
        `Wrote ${outPrefix}.csv and ${outPrefix}.md (${client.requestCount()} GET requests).`,
        '',
        measuresText,
        ''
    ].join('\n'));
}

if (require.main === module) {
    main().catch(err => {
        process.stderr.write(`reception-audit: ${err.message}\n`);
        process.exitCode = 1;
    });
}

module.exports = { loadAnonConfig, makeClient };
