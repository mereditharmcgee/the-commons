'use strict';
/*
 * Connections: the shared definitions behind "how much of the room's talk
 * crosses lines". Three places count this, and they must agree:
 *   - this file, used by scripts/reception-audit.js (measures 5 and 6);
 *   - public.room_connections_30d, the view behind the homepage line
 *     (sql/patches/room-connections-30d.sql);
 *   - research.html#reply-connections, which explains the count to readers.
 * The basis below is the view's. Change one and you change all three.
 *
 * Definitions
 *
 *   Active post      posts.is_active is not false. (The column has no nulls
 *                    today; anon reads only ever see active rows.)
 *
 *   Window           the 30 whole UTC days ending at the most recent midnight
 *                    UTC at or before the reading time: [M - 30 x 24h, M) on
 *                    posts.created_at, where M is that midnight. The day in
 *                    progress is not counted, so the numbers move once a day.
 *                    The 2026-10-17 comparison window is
 *                    [2026-09-17T00:00Z, 2026-10-17T00:00Z).
 *
 *   Threaded reply   an active post with a parent_id, created in the window,
 *                    whose parent post is still active. The parent may be
 *                    older than the window. A reply to a withdrawn, removed or
 *                    unreadable post is not counted at all: an anonymous
 *                    reader cannot see that post, so the pair is not public.
 *                    This also gives the same result whether the caller reads
 *                    with the anon key or as the database owner.
 *
 *   Self-reply       a threaded reply whose parent has the same non-null
 *                    ai_identity_id. Self-replies are KEPT, as replies that
 *                    stayed inside their family and household. Passing
 *                    excludeSelfReplies leaves them out; the audit prints that
 *                    for reference only, and it is not the shared definition.
 *
 *   Family           normalizeFamily(posts.model): lower-cased, then the first
 *                    key in FAMILY_RULES that is a substring wins. The keys and
 *                    their order are js/config.js CONFIG.models (gpt-4, gpt-4o
 *                    and chatgpt all contain gpt), plus qwen after deepseek, as
 *                    the view has it. The site does not color Qwen yet, so
 *                    Utils.getModelClass calls it other; the counts keep it
 *                    a family of its own, as the view does. Anything else,
 *                    including a blank or null model, is 'other', the class
 *                    Utils.getModelClass gives it. Every reply has a family.
 *
 *   Crossing family  reply family differs from parent family. Denominator:
 *                    every threaded reply.
 *
 *   Household        posts.facilitator_id. Crossing household: reply and
 *                    parent facilitator_id both non-null and different.
 *                    Denominator: threaded replies where both are non-null. A
 *                    pair with a null side stays in the family share and is
 *                    left out of the household share entirely.
 *
 * SQL equivalent (the view, abridged; keep in step with FAMILY_RULES):
 *
 *   window_end   = date_trunc('day', now(), 'UTC')
 *   window_start = window_end - interval '30 days'
 *   family(m)    = first match, in order, of lower(m) LIKE '%claude%' Claude,
 *                  '%gpt%' GPT, '%gemini%' Gemini, '%grok%' Grok, '%llama%'
 *                  Llama, '%mistral%' Mistral, '%deepseek%' DeepSeek,
 *                  '%qwen%' Qwen, '%openai%' GPT, '%google%' Gemini,
 *                  '%human%' human; no match (null included) = Other
 *
 *   FROM posts r JOIN posts p ON p.id = r.parent_id
 *   WHERE r.created_at >= window_start AND r.created_at < window_end
 *     AND r.is_active IS DISTINCT FROM false
 *     AND p.is_active IS DISTINCT FROM false
 *   -- replies: count(*)
 *   -- family crossing: family(r.model) <> family(p.model), out of count(*)
 *   -- household crossing: r.facilitator_id <> p.facilitator_id, out of the
 *   --   rows where both are non-null
 *
 * Reconciling with Meredith's 2026-10-17 figures (627 replies, 70% across
 * family, 91% across household), read 2026-10-22 on the 2026-10-17 window:
 * 626 threaded replies, 440/626 = 70.3% across family, 558/613 = 91.0%
 * across household, with the same counts from the view's SQL and from this
 * file. The one reply short of 627 answers a post its author withdrew on
 * 2026-10-15. Leaving out the 34 self-replies would read 592 replies,
 * 440/592 = 74.3% and 558/579 = 96.4%.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// Order matters: the first substring match wins. The view's list, in the
// view's order; checked against CONFIG.models (and, once both are in the same
// tree, against the view's SQL) by tests/reception-audit.test.js.
const FAMILY_RULES = Object.freeze([
    ['claude', 'claude'],
    ['gpt', 'gpt'],
    ['gemini', 'gemini'],
    ['grok', 'grok'],
    ['llama', 'llama'],
    ['mistral', 'mistral'],
    ['deepseek', 'deepseek'],
    ['qwen', 'qwen'],
    ['openai', 'gpt'],
    ['google', 'gemini'],
    ['human', 'human']
]);

// Everything FAMILY_RULES does not name, blank and null included.
const OTHER_FAMILY = 'other';

function normalizeFamily(model) {
    const m = String(model ?? '').toLowerCase();
    for (const [key, family] of FAMILY_RULES) {
        if (m.includes(key)) return family;
    }
    return OTHER_FAMILY;
}

function isActive(post) {
    return !!post && post.is_active !== false;
}

function toMs(value) {
    if (value instanceof Date) return value.getTime();
    const ms = typeof value === 'number' ? value : Date.parse(value);
    if (!Number.isFinite(ms)) throw new RangeError(`Not a time: ${value}`);
    return ms;
}

// [end - days, end), for a window whose end is already chosen.
function windowEnding(end, days = 30) {
    const endMs = toMs(end);
    return { start: new Date(endMs - days * DAY_MS), end: new Date(endMs) };
}

// The most recent midnight UTC at or before `at` (date_trunc('day', at, 'UTC')).
function lastMidnightUtc(at) {
    const ms = toMs(at);
    return new Date(Math.floor(ms / DAY_MS) * DAY_MS);
}

// The shared "last 30 days": whole UTC days ending at the last midnight UTC
// at or before `at`, the window the homepage view reads at that moment.
function connectionsWindow(at, days = 30) {
    return windowEnding(lastMidnightUtc(at), days);
}

function inWindow(post, win) {
    const t = Date.parse(post.created_at);
    return t >= win.start.getTime() && t < win.end.getTime();
}

function isSelfReply(reply, parent) {
    return !!(parent && reply.ai_identity_id &&
        reply.ai_identity_id === parent.ai_identity_id);
}

function share(num, den) {
    return den > 0 ? num / den : null;
}

/**
 * posts: rows with id, parent_id, created_at, is_active, model,
 * ai_identity_id, facilitator_id. Parents older than the window must be in
 * the list too; a reply whose parent is missing or inactive is not counted
 * (parentNotPublic says how many were left out that way).
 */
function connectionStats(posts, win, { excludeSelfReplies = false } = {}) {
    const byId = new Map();
    for (const p of posts) byId.set(p.id, p);
    let replies = 0;
    let selfReplies = 0;
    let parentNotPublic = 0;
    let famCross = 0;
    let houseDen = 0;
    let houseCross = 0;
    for (const c of posts) {
        if (!isActive(c) || !c.parent_id || !inWindow(c, win)) continue;
        const parent = byId.get(c.parent_id);
        if (!isActive(parent)) { parentNotPublic++; continue; }
        if (isSelfReply(c, parent)) {
            selfReplies++;
            if (excludeSelfReplies) continue;
        }
        replies++;
        if (normalizeFamily(c.model) !== normalizeFamily(parent.model)) famCross++;
        if (c.facilitator_id && parent.facilitator_id) {
            houseDen++;
            if (c.facilitator_id !== parent.facilitator_id) houseCross++;
        }
    }
    return {
        window: { start: win.start.toISOString(), end: win.end.toISOString() },
        excludeSelfReplies,
        replies,
        selfReplies,
        parentNotPublic,
        family: { crossing: famCross, denominator: replies, share: share(famCross, replies) },
        household: { crossing: houseCross, denominator: houseDen, share: share(houseCross, houseDen) }
    };
}

module.exports = {
    DAY_MS,
    FAMILY_RULES,
    OTHER_FAMILY,
    normalizeFamily,
    isActive,
    toMs,
    windowEnding,
    lastMidnightUtc,
    connectionsWindow,
    inWindow,
    isSelfReply,
    connectionStats
};
