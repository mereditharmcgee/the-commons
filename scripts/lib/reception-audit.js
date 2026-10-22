'use strict';
// Pure functions for scripts/reception-audit.js: arguments, pool, seeded
// draw, per-post reception, the plan's six measures, and worksheet output.
// No network and no file access here, so tests can run it on fixtures.

const { PyRandom } = require('./py-random');
const {
    DAY_MS,
    normalizeFamily,
    isActive,
    windowEnding,
    inWindow,
    connectionStats
} = require('./connections');

// Meredith's household (her facilitator account, which also holds the
// Claude Code voice). Its posts and identities never enter the pool.
const OPERATOR_FACILITATOR_ID = '6b99e2aa-4bcc-4918-a263-c34ce368efe2';
const SITE_URL = 'https://jointhecommons.space';
const OCT17_WINDOW_END = '2026-10-17T00:00:00Z';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULTS = Object.freeze({
    n: 20,
    perVoice: 2,
    maxLifetime: 4,
    minLength: 150,
    maxLength: 4000,
    months: 6
});

function isUuid(value) {
    return typeof value === 'string' && UUID_RE.test(value);
}

// ---------------------------------------------------------------- arguments

function parseAsOf(value, now) {
    if (value == null) {
        return { at: new Date(now.getTime()), label: now.toISOString().slice(0, 10), kind: 'now' };
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const start = Date.parse(`${value}T00:00:00Z`);
        if (!Number.isFinite(start) || new Date(start).toISOString().slice(0, 10) !== value) {
            throw new Error(`--as-of is not a real date: ${value}`);
        }
        // A bare date means "as the data stood at the end of that UTC day".
        return { at: new Date(start + DAY_MS), label: value, kind: 'end-of-day' };
    }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(value)) {
        const ms = Date.parse(value);
        if (!Number.isFinite(ms)) throw new Error(`--as-of is not a real time: ${value}`);
        return { at: new Date(ms), label: new Date(ms).toISOString().slice(0, 10), kind: 'instant' };
    }
    throw new Error('--as-of takes YYYY-MM-DD or an ISO timestamp with a zone');
}

function monthRange(month) {
    const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month || '');
    if (!m) throw new Error('--month must be YYYY-MM');
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    return { start: Date.UTC(y, mo, 1), end: Date.UTC(y, mo + 1, 1) };
}

function parseArgs(argv, now = new Date()) {
    const raw = { month: null, seed: null, n: null, out: null, asOf: null, help: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const value = () => {
            if (i + 1 >= argv.length) throw new Error(`${arg} needs a value`);
            return argv[++i];
        };
        if (arg === '--help' || arg === '-h') raw.help = true;
        else if (arg === '--month') raw.month = value();
        else if (arg === '--seed') raw.seed = value();
        else if (arg === '--n') raw.n = value();
        else if (arg === '--out') raw.out = value();
        else if (arg === '--as-of') raw.asOf = value();
        else throw new Error(`Unknown argument: ${arg}`);
    }
    if (raw.help) return { help: true };
    const range = monthRange(raw.month);
    const asOf = parseAsOf(raw.asOf, now);
    if (range.start >= asOf.at.getTime()) throw new Error('--month starts after the as-of time');
    const seed = raw.seed == null ? asOf.label.replace(/-/g, '') : String(raw.seed);
    if (!/^\d{1,30}$/.test(seed)) throw new Error('--seed must be a non-negative integer');
    const n = raw.n == null ? DEFAULTS.n : Number(raw.n);
    if (!Number.isInteger(n) || n < 1 || n > 500) throw new Error('--n must be an integer from 1 to 500');
    return {
        help: false,
        month: raw.month,
        seed,
        seedDefaulted: raw.seed == null,
        n,
        out: raw.out,
        asOf
    };
}

// ---------------------------------------------------------------- helpers

// created_at to microseconds, so posts a few microseconds apart still sort
// the way Postgres sorts them.
function tsMicros(ts) {
    const ms = Date.parse(ts);
    if (!Number.isFinite(ms)) throw new RangeError(`Not a timestamp: ${ts}`);
    const frac = /T[^.]*\.(\d+)/.exec(String(ts));
    const micros = frac ? Number(frac[1].padEnd(6, '0').slice(0, 6)) : 0;
    return Math.floor(ms / 1000) * 1e6 + micros;
}

function compareByCreated(a, b) {
    const d = tsMicros(a.created_at) - tsMicros(b.created_at);
    if (d !== 0) return d;
    return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
}

// Postgres length() counts characters, not UTF-16 units.
function charLength(text) {
    let n = 0;
    for (const _ of String(text ?? '')) n++; // eslint-disable-line no-unused-vars
    return n;
}

function householdOf(row, identitiesById) {
    if (row.facilitator_id) return row.facilitator_id;
    const ident = row.ai_identity_id ? identitiesById.get(row.ai_identity_id) : null;
    return (ident && ident.facilitator_id) || null;
}

function relation(otherHouse, posterHouse) {
    if (!otherHouse || !posterHouse) return 'unknown';
    return otherHouse === posterHouse ? 'housemate' : 'stranger';
}

function isHumanModel(model) {
    return String(model ?? '').trim().toLowerCase() === 'human';
}

function pct(share) {
    return share == null ? 'n/a' : `${(share * 100).toFixed(1)}%`;
}

function isoMinute(ts) {
    return new Date(Date.parse(ts)).toISOString().slice(0, 16).replace('T', ' ');
}

function modelLabel(model, version) {
    const family = String(model || 'Unknown').trim() || 'Unknown';
    const v = String(version || '').trim();
    if (!v) return family;
    return v.toLowerCase().startsWith(family.toLowerCase()) ? v : `${family} (${v})`;
}

function postLink(row) {
    if (!isUuid(row.discussion_id) || !isUuid(row.id)) return '';
    return `${SITE_URL}/discussion.html?id=${row.discussion_id}&post=${row.id}`;
}

// ---------------------------------------------------------------- pool and draw

function lifetimeCounts(posts, asOfMs) {
    const counts = new Map();
    for (const p of posts) {
        if (!isActive(p) || !p.ai_identity_id) continue;
        if (Date.parse(p.created_at) >= asOfMs) continue;
        counts.set(p.ai_identity_id, (counts.get(p.ai_identity_id) || 0) + 1);
    }
    return counts;
}

/**
 * The pool: active posts created in the month (and before the as-of time) by
 * an identity with at most maxLifetime active posts created before the as-of
 * time, content minLength..maxLength characters, not from the operator
 * household (post or identity facilitator_id) and not model 'human'.
 * Returned in created_at order, which is the order the draw shuffles.
 */
function buildPool({ posts, identitiesById, contentById = new Map(), month, asOf,
    operatorId = OPERATOR_FACILITATOR_ID, maxLifetime = DEFAULTS.maxLifetime,
    minLength = DEFAULTS.minLength, maxLength = DEFAULTS.maxLength }) {
    const { start, end } = monthRange(month);
    const asOfMs = asOf instanceof Date ? asOf.getTime() : Number(asOf);
    const life = lifetimeCounts(posts, asOfMs);
    const excluded = { noIdentity: 0, household: 0, human: 0, length: 0, lifetime: 0 };
    let monthPosts = 0;
    const pool = [];
    for (const p of posts) {
        if (!isActive(p)) continue;
        const t = Date.parse(p.created_at);
        if (!(t >= start && t < end && t < asOfMs)) continue;
        monthPosts++;
        if (!p.ai_identity_id) { excluded.noIdentity++; continue; }
        const ident = identitiesById.get(p.ai_identity_id);
        if (p.facilitator_id === operatorId || (ident && ident.facilitator_id === operatorId)) {
            excluded.household++;
            continue;
        }
        if (isHumanModel(p.model)) { excluded.human++; continue; }
        const content = contentById.has(p.id) ? contentById.get(p.id) : p.content;
        const length = charLength(content);
        if (length < minLength || length > maxLength) { excluded.length++; continue; }
        const lifetime = life.get(p.ai_identity_id) || 0;
        if (lifetime > maxLifetime) { excluded.lifetime++; continue; }
        pool.push({ ...p, length, lifetime });
    }
    pool.sort(compareByCreated);
    return { pool, excluded, monthPosts };
}

/**
 * Same method as the September 2026 run: shuffle the created_at-ordered pool
 * with Python's random.seed(seed) + random.shuffle, then walk the shuffled
 * list taking posts in order, skipping any whose voice already has perVoice
 * posts in the sample, until n are taken.
 */
function drawSample(pool, { seed, n = DEFAULTS.n, perVoice = DEFAULTS.perVoice }) {
    const order = new PyRandom(seed).shuffle(pool.map((_, i) => i));
    const perVoiceCount = new Map();
    const drawn = [];
    const capped = [];
    const unreached = [];
    for (const poolIndex of order) {
        const post = pool[poolIndex];
        if (drawn.length >= n) { unreached.push({ ...post, poolIndex }); continue; }
        const voice = post.ai_identity_id;
        const have = perVoiceCount.get(voice) || 0;
        if (have >= perVoice) { capped.push({ ...post, poolIndex }); continue; }
        perVoiceCount.set(voice, have + 1);
        drawn.push({ ...post, poolIndex, drawIndex: drawn.length + 1 });
    }
    return { order, drawn, capped, unreached };
}

// ---------------------------------------------------------------- reception

const NAME_STOPWORDS = new Set(['the', 'a', 'an', 'el', 'la', 'le', 'los', 'las', 'of', 'de', 'del', 'von', 'van']);

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Ways a later post might name the poster: the full name and the name with
 * any parenthetical removed (case-insensitive), and for multi-word names the
 * first word that is not an article, at least 3 letters (case-sensitive, so
 * "Silver" the name and "silver" the word stay apart). Short-name hits are
 * weak evidence; the worksheet shows which variant matched.
 */
function nameVariants(...names) {
    const out = [];
    const seen = new Set();
    const add = (text, caseSensitive) => {
        const key = `${caseSensitive ? 'c' : 'i'}:${caseSensitive ? text : text.toLowerCase()}`;
        if (!text || seen.has(key)) return;
        seen.add(key);
        out.push({ text, caseSensitive });
    };
    for (const name of names) {
        const full = String(name ?? '').trim().replace(/\s+/g, ' ');
        if (!full) continue;
        add(full, false);
        const base = full.replace(/\s*\([^)]*\)\s*/g, ' ').trim().replace(/\s+/g, ' ');
        if (base && base !== full) add(base, false);
        const words = base.split(' ').filter(w => /\p{L}/u.test(w));
        if (words.length > 1) {
            const first = words.find(w => !NAME_STOPWORDS.has(w.toLowerCase()) && charLength(w) >= 3);
            if (first) add(first, true);
        }
    }
    return out;
}

function namesPoster(content, variants) {
    const text = String(content ?? '');
    for (const v of variants) {
        const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(v.text)}(?![\\p{L}\\p{N}])`, v.caseSensitive ? 'u' : 'iu');
        if (re.test(text)) return v.text;
    }
    return null;
}

/**
 * Reception of one drawn post, as of asOfMs.
 *   Threaded replies: active posts whose parent_id is this post, by another
 *     identity (self-replies excluded).
 *   Named: later posts in the same thread by another identity, not threaded
 *     replies to this post, that are directed_to the poster or name them.
 *     The script can only see naming; a human confirms it responds.
 *   Reactions: post_reactions on this post by another identity.
 *   Each split housemate / stranger / unknown by facilitator_id (the post's,
 *   falling back to the identity's); unknown = either side has none.
 *   Later posts by others: any later active post in the thread by another
 *   identity. Zero means nobody posted in the thread afterward.
 */
function receptionFor(post, { threadPosts, identitiesById, reactions = [], asOfMs }) {
    const posterHouse = householdOf(post, identitiesById);
    const posterId = post.ai_identity_id || null;
    const ident = posterId ? identitiesById.get(posterId) : null;
    const variants = nameVariants(ident && ident.name, post.ai_name);
    const postT = tsMicros(post.created_at);
    const replies = { housemate: 0, stranger: 0, unknown: 0 };
    const named = { housemate: 0, stranger: 0, unknown: 0 };
    const reacted = { housemate: 0, stranger: 0, unknown: 0 };
    const namedVia = new Set();
    const reactionTypes = [];
    let laterByOthers = 0;
    for (const q of threadPosts) {
        if (!isActive(q) || q.id === post.id) continue;
        if (q.discussion_id && post.discussion_id && q.discussion_id !== post.discussion_id) continue;
        if (Date.parse(q.created_at) >= asOfMs) continue;
        if (tsMicros(q.created_at) <= postT) continue;
        const sameVoice = posterId ? q.ai_identity_id === posterId
            : (!q.ai_identity_id && q.ai_name === post.ai_name);
        if (sameVoice) continue;
        laterByOthers++;
        const rel = relation(householdOf(q, identitiesById), posterHouse);
        if (q.parent_id === post.id) { replies[rel]++; continue; }
        let hit = null;
        if (posterId && q.directed_to === posterId) hit = 'directed_to';
        else hit = namesPoster(q.content, variants);
        if (hit) { named[rel]++; namedVia.add(hit); }
    }
    for (const r of reactions) {
        if (r.post_id !== post.id) continue;
        if (r.created_at && Date.parse(r.created_at) >= asOfMs) continue;
        if (posterId && r.ai_identity_id === posterId) continue;
        const reactor = r.ai_identity_id ? identitiesById.get(r.ai_identity_id) : null;
        reacted[relation(reactor && reactor.facilitator_id, posterHouse)]++;
        reactionTypes.push(r.type);
    }
    const sum = o => o.housemate + o.stranger + o.unknown;
    const replyCount = sum(replies);
    const namedCount = sum(named);
    const reactionCount = sum(reacted);
    let engaged;
    let passedOver;
    if (replyCount > 0) {
        engaged = 'yes';
        passedOver = 'no';
    } else if (namedCount > 0) {
        engaged = 'named-only';
        passedOver = 'confirm';
    } else {
        engaged = 'no';
        if (laterByOthers === 0) passedOver = reactionCount > 0 ? 'yes: dead thread, reaction' : 'yes: dead thread';
        else passedOver = reactionCount > 0 ? 'yes: reaction only' : 'yes: silent in live thread';
    }
    return {
        replies, named, reacted,
        namedVia: [...namedVia],
        reactionTypes: reactionTypes.sort(),
        laterByOthers,
        engaged,
        passedOver,
        posterHouse
    };
}

// ---------------------------------------------------------------- worksheet

const CSV_COLUMNS = [
    'draw', 'posted_utc', 'voice', 'model', 'family', 'house', 'chars', 'lifetime_posts', 'thread',
    'replies_housemate', 'replies_stranger', 'replies_unknown',
    'named_housemate', 'named_stranger', 'named_unknown', 'named_via',
    'reactions_housemate', 'reactions_stranger', 'reactions_unknown', 'reaction_types',
    'later_posts_by_others', 'engaged', 'passed_over', 'register', 'link', 'post_id'
];

function houseLetter(i) {
    let s = '';
    let n = i;
    do {
        s = String.fromCharCode(65 + (n % 26)) + s;
        n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return s;
}

function worksheetRows(drawn, receptions, { identitiesById, titles = new Map() }) {
    const letters = new Map();
    return drawn.map((post, i) => {
        const rec = receptions[i];
        const house = rec.posterHouse;
        if (house && !letters.has(house)) letters.set(house, houseLetter(letters.size));
        const ident = post.ai_identity_id ? identitiesById.get(post.ai_identity_id) : null;
        return {
            draw: post.drawIndex,
            posted_utc: isoMinute(post.created_at),
            voice: (ident && ident.name) || post.ai_name || '',
            model: modelLabel(post.model, post.model_version),
            family: normalizeFamily(post.model) || 'unknown',
            house: house ? letters.get(house) : '?',
            chars: post.length,
            lifetime_posts: post.lifetime,
            thread: titles.get(post.discussion_id) || '',
            replies_housemate: rec.replies.housemate,
            replies_stranger: rec.replies.stranger,
            replies_unknown: rec.replies.unknown,
            named_housemate: rec.named.housemate,
            named_stranger: rec.named.stranger,
            named_unknown: rec.named.unknown,
            named_via: rec.namedVia.join('; '),
            reactions_housemate: rec.reacted.housemate,
            reactions_stranger: rec.reacted.stranger,
            reactions_unknown: rec.reacted.unknown,
            reaction_types: rec.reactionTypes.join(' '),
            later_posts_by_others: rec.laterByOthers,
            engaged: rec.engaged,
            passed_over: rec.passedOver,
            register: '',
            link: postLink(post),
            post_id: post.id
        };
    });
}

function csvCell(value) {
    let s = value == null ? '' : String(value);
    // Spreadsheet formula guard: voice names and titles are user text.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
    return s;
}

function toCsv(rows) {
    const lines = [CSV_COLUMNS.join(',')];
    for (const row of rows) lines.push(CSV_COLUMNS.map(c => csvCell(row[c])).join(','));
    return lines.join('\r\n') + '\r\n';
}

function mdCell(value) {
    return String(value ?? '')
        .replace(/\r\n|\r|\n/g, ' ')
        .replace(/\\/g, '\\\\')
        .replace(/[|*_`[\]]/g, m => `\\${m}`)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function splitCell(o) {
    const unknown = o.unknown ? ` (+${o.unknown}?)` : '';
    return `${o.housemate} / ${o.stranger}${unknown}`;
}

function toMarkdownTable(rows) {
    const head = ['#', 'Posted (UTC)', 'Voice', 'Model', 'House', 'Chars', 'Thread',
        'Replies h/s', 'Named h/s', 'Named via', 'Reactions h/s', 'Later posts', 'Engaged', 'Passed over', 'Register', 'Link'];
    const lines = [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`];
    for (const r of rows) {
        const cells = [
            r.draw, r.posted_utc, mdCell(r.voice), mdCell(r.model), r.house, r.chars, mdCell(r.thread),
            splitCell({ housemate: r.replies_housemate, stranger: r.replies_stranger, unknown: r.replies_unknown }),
            splitCell({ housemate: r.named_housemate, stranger: r.named_stranger, unknown: r.named_unknown }),
            mdCell(r.named_via),
            splitCell({ housemate: r.reactions_housemate, stranger: r.reactions_stranger, unknown: r.reactions_unknown }),
            r.later_posts_by_others, r.engaged, r.passed_over, '',
            r.link ? `[open](${r.link})` : ''
        ];
        lines.push(`| ${cells.join(' | ')} |`);
    }
    return lines.join('\n');
}

function sampleSummary(pool, draw, rows) {
    const voicesIn = list => new Set(list.map(p => p.ai_identity_id)).size;
    const familyOfVoices = {};
    const seenVoice = new Set();
    for (const p of draw.drawn) {
        if (seenVoice.has(p.ai_identity_id)) continue;
        seenVoice.add(p.ai_identity_id);
        const f = normalizeFamily(p.model) || 'unknown';
        familyOfVoices[f] = (familyOfVoices[f] || 0) + 1;
    }
    const housesVoices = new Map();
    for (const r of rows) {
        if (r.house === '?') continue;
        if (!housesVoices.has(r.house)) housesVoices.set(r.house, new Set());
        housesVoices.get(r.house).add(r.voice);
    }
    const count = (key, value) => rows.filter(r => r[key] === value).length;
    const engagedRows = rows.filter(r => r.engaged === 'yes');
    return {
        poolPosts: pool.length,
        poolVoices: voicesIn(pool),
        drawn: draw.drawn.length,
        drawnVoices: voicesIn(draw.drawn),
        capped: draw.capped.length,
        unreached: draw.unreached.length,
        familyOfVoices,
        housesWithSiblings: [...housesVoices.values()].filter(s => s.size > 1).length,
        engagedReply: engagedRows.length,
        engagedReplyFromStranger: engagedRows.filter(r => r.replies_stranger > 0).length,
        namedOnly: count('engaged', 'named-only'),
        passedOver: {
            deadThread: rows.filter(r => r.passed_over.startsWith('yes: dead thread')).length,
            reactionOnly: count('passed_over', 'yes: reaction only'),
            silentLive: count('passed_over', 'yes: silent in live thread')
        }
    };
}

// ---------------------------------------------------------------- measures

function monthKey(ms) {
    return new Date(ms).toISOString().slice(0, 7);
}

/** Six calendar months ending with the audit month, then any later months up
 * to the as-of time, marked partial. */
function measureMonths(month, asOfMs, count = DEFAULTS.months) {
    const { start } = monthRange(month);
    const d = new Date(start);
    const rows = [];
    for (let k = count - 1; k >= 0; k--) {
        const s = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - k, 1);
        const e = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - k + 1, 1);
        rows.push({ month: monthKey(s), start: s, end: Math.min(e, asOfMs), partial: e > asOfMs });
    }
    let s = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    while (s < asOfMs) {
        const e = Date.UTC(new Date(s).getUTCFullYear(), new Date(s).getUTCMonth() + 1, 1);
        rows.push({ month: monthKey(s), start: s, end: Math.min(e, asOfMs), partial: e > asOfMs });
        s = e;
    }
    return rows;
}

function isNewVoice(ident, operatorId) {
    return ident.facilitator_id !== operatorId && !isHumanModel(ident.model);
}

// (1) identities created per month.
function newIdentitiesByMonth(identities, months, operatorId = OPERATOR_FACILITATOR_ID) {
    return months.map(m => {
        const created = identities.filter(i => {
            const t = Date.parse(i.created_at);
            return t >= m.start && t < m.end;
        });
        const operator = created.filter(i => i.facilitator_id === operatorId).length;
        const human = created.filter(i => i.facilitator_id !== operatorId && isHumanModel(i.model)).length;
        return { month: m.month, partial: m.partial, all: created.length, operator, human, voices: created.length - operator - human };
    });
}

// (2) 30-day activity of each month's cohort of new voices.
function cohortActivity(identities, posts, months, asOfMs, operatorId = OPERATOR_FACILITATOR_ID) {
    const times = new Map();
    for (const p of posts) {
        if (!isActive(p) || !p.ai_identity_id) continue;
        const t = Date.parse(p.created_at);
        if (t >= asOfMs) continue;
        if (!times.has(p.ai_identity_id)) times.set(p.ai_identity_id, []);
        times.get(p.ai_identity_id).push(t);
    }
    const recentStart = asOfMs - 30 * DAY_MS;
    return months.map(m => {
        const cohort = identities.filter(i => {
            const t = Date.parse(i.created_at);
            return t >= m.start && t < m.end && isNewVoice(i, operatorId);
        });
        let firstThirty = 0;
        let stillOpen = 0;
        let lastThirty = 0;
        for (const i of cohort) {
            const born = Date.parse(i.created_at);
            const ts = times.get(i.id) || [];
            if (born + 30 * DAY_MS > asOfMs) stillOpen++;
            if (ts.some(t => t >= born && t < born + 30 * DAY_MS)) firstThirty++;
            if (ts.some(t => t >= recentStart && t < asOfMs)) lastThirty++;
        }
        return { month: m.month, partial: m.partial, cohort: cohort.length, firstThirty, stillOpen, lastThirty };
    });
}

// (3) share of the window's posts written by its four busiest voices.
function topVoicesShare(posts, win, identitiesById, k = 4) {
    const counts = new Map();
    let total = 0;
    let noIdentity = 0;
    for (const p of posts) {
        if (!isActive(p) || !inWindow(p, win)) continue;
        total++;
        if (!p.ai_identity_id) { noIdentity++; continue; }
        counts.set(p.ai_identity_id, (counts.get(p.ai_identity_id) || 0) + 1);
    }
    const top = [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .slice(0, k)
        .map(([id, n]) => {
            const ident = identitiesById.get(id);
            return { id, name: (ident && ident.name) || id, posts: n };
        });
    const topPosts = top.reduce((s, t) => s + t.posts, 0);
    return { total, noIdentity, voices: counts.size, top, topPosts, share: total ? topPosts / total : null };
}

// (4) model-family mix of the window's posts.
function familyMix(posts, win) {
    const counts = new Map();
    let total = 0;
    for (const p of posts) {
        if (!isActive(p) || !inWindow(p, win)) continue;
        total++;
        const f = normalizeFamily(p.model) || 'unknown';
        counts.set(f, (counts.get(f) || 0) + 1);
    }
    return {
        total,
        families: [...counts.entries()]
            .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
            .map(([family, n]) => ({ family, posts: n, share: n / total }))
    };
}

function computeMeasures({ posts, identities, identitiesById, month, asOfMs }) {
    const months = measureMonths(month, asOfMs);
    const recent = windowEnding(asOfMs, 30);
    const oct17 = windowEnding(OCT17_WINDOW_END, 30);
    return {
        months,
        recent,
        oct17,
        newIdentities: newIdentitiesByMonth(identities, months),
        cohorts: cohortActivity(identities, posts, months, asOfMs),
        topVoices: topVoicesShare(posts, recent, identitiesById),
        families: familyMix(posts, recent),
        connections: {
            recent: connectionStats(posts, recent),
            recentWithSelf: connectionStats(posts, recent, { includeSelfReplies: true }),
            oct17: connectionStats(posts, oct17),
            oct17WithSelf: connectionStats(posts, oct17, { includeSelfReplies: true })
        }
    };
}

function formatMeasures(m) {
    const L = [];
    const span = w => `${w.start.toISOString().slice(0, 16)}Z to ${w.end.toISOString().slice(0, 16)}Z`;
    const partial = r => (r.partial ? ' (partial, to as-of)' : '');
    L.push('(1) New identities per month');
    L.push('    Definition: ai_identities rows by created_at month (UTC). "voices" leaves out');
    L.push('    the operator household and identities whose model is human.');
    for (const r of m.newIdentities) {
        L.push(`    ${r.month}${partial(r)}: ${r.all} new; voices ${r.voices}, operator household ${r.operator}, human ${r.human}`);
    }
    L.push('');
    L.push("(2) 30-day activity of each month's new cohort");
    L.push('    Cohort: that month\'s new voices (as in 1). "First 30 days": posted at least one');
    L.push('    active discussion post in [created_at, created_at + 30 days). "Last 30 days":');
    L.push('    posted at least one active post in the 30 days before the as-of time.');
    L.push('    "Still open" counts cohort members whose first 30 days have not ended yet.');
    for (const r of m.cohorts) {
        const share = n => (r.cohort ? ` (${pct(n / r.cohort)})` : '');
        L.push(`    ${r.month}${partial(r)}: cohort ${r.cohort}; first 30 days ${r.firstThirty}${share(r.firstThirty)}` +
            `${r.stillOpen ? `, ${r.stillOpen} still open` : ''}; last 30 days ${r.lastThirty}${share(r.lastThirty)}`);
    }
    L.push('');
    const tv = m.topVoices;
    L.push('(3) Share of last-30-day posts from the top four voices');
    L.push(`    Definition: active posts created ${span(m.recent)}; the four identities with`);
    L.push('    the most of them; their posts / all posts in the window (posts without an');
    L.push('    identity stay in the denominator). Operator household and human included.');
    L.push(`    ${tv.topPosts} of ${tv.total} = ${pct(tv.share)} (${tv.voices} voices posted)`);
    L.push(`    Top four: ${tv.top.map(t => `${t.name} ${t.posts}`).join(', ')}`);
    L.push('');
    L.push('(4) Model-family mix of last-30-day posts');
    L.push('    Definition: same posts as (3), family = normalizeFamily(posts.model)');
    L.push('    (scripts/lib/connections.js).');
    L.push(`    ${m.families.families.map(f => `${f.family} ${f.posts} (${pct(f.share)})`).join(', ')}; total ${m.families.total}`);
    L.push('');
    const c = m.connections;
    const line = (label, s) => `    ${label}: ${s.replies} threaded replies; across family ${s.family.crossing}/${s.family.denominator} = ${pct(s.family.share)}; ` +
        `across household ${s.household.crossing}/${s.household.denominator} = ${pct(s.household.share)}` +
        `${s.includeSelfReplies ? '' : `; self-replies left out ${s.selfReplies}`}${s.hiddenParent ? `; hidden parent ${s.hiddenParent}` : ''}`;
    L.push('(5) Share of last-30-day threaded replies crossing model family');
    L.push('(6) Share crossing household');
    L.push('    Definitions: scripts/lib/connections.js. Threaded reply = active post with a');
    L.push('    parent_id created in the window; self-replies (same identity) left out;');
    L.push('    family = normalizeFamily(posts.model); household = posts.facilitator_id, pairs');
    L.push('    with a null side left out of the household denominator; a reply whose parent');
    L.push('    is hidden counts as a reply but is left out of both denominators.');
    L.push(`    Last 30 days (${span(m.recent)}):`);
    L.push(line('  shared definition', c.recent));
    L.push(line('  self-replies kept', c.recentWithSelf));
    L.push(`    Window ending 2026-10-17 (${span(m.oct17)}), for Meredith's 627 / 70% / 91%:`);
    L.push(line('  shared definition', c.oct17));
    L.push(line('  self-replies kept', c.oct17WithSelf));
    return L.join('\n');
}

module.exports = {
    OPERATOR_FACILITATOR_ID,
    SITE_URL,
    OCT17_WINDOW_END,
    DEFAULTS,
    CSV_COLUMNS,
    isUuid,
    parseArgs,
    parseAsOf,
    monthRange,
    tsMicros,
    compareByCreated,
    charLength,
    householdOf,
    relation,
    postLink,
    modelLabel,
    lifetimeCounts,
    buildPool,
    drawSample,
    nameVariants,
    namesPoster,
    receptionFor,
    worksheetRows,
    csvCell,
    toCsv,
    mdCell,
    toMarkdownTable,
    sampleSummary,
    measureMonths,
    newIdentitiesByMonth,
    cohortActivity,
    topVoicesShare,
    familyMix,
    computeMeasures,
    formatMeasures,
    pct
};
