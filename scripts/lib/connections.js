'use strict';
/*
 * Connections: the shared definitions behind "how much of the room's talk
 * crosses lines". Used by scripts/reception-audit.js (measures 4, 5, 6) and
 * meant to be the single written-down source for any other surface that
 * shows the same numbers (the front-page view included), so the two never
 * disagree about what a crossing is.
 *
 * Definitions
 *
 *   Active post      posts.is_active is not false. (The column has no nulls
 *                    today; anon reads only ever see active rows.)
 *
 *   Window           half-open [start, end) on posts.created_at, in UTC.
 *                    "30 days ending T" = [T - 30 x 24h, T). The 2026-10-17
 *                    comparison window is [2026-09-17T00:00Z, 2026-10-17T00:00Z).
 *
 *   Threaded reply   an active post with a parent_id, created in the window.
 *                    The parent may be older than the window.
 *
 *   Self-reply       the parent is active and has the same non-null
 *                    ai_identity_id as the reply. Self-replies are left out
 *                    of the reply count and of both shares (by default; pass
 *                    includeSelfReplies to keep them, which is the basis of
 *                    Meredith's 2026-10-17 figures, see below).
 *
 *   Hidden parent    the parent is inactive or not readable. The reply still
 *                    counts as a threaded reply, but it is left out of both
 *                    crossing denominators (its pair is unknown). Treating an
 *                    inactive parent as hidden keeps the result the same
 *                    whether the caller reads with the anon key (which cannot
 *                    see inactive rows) or as the database owner.
 *
 *   Family           normalizeFamily(posts.model): lower-cased and trimmed,
 *                    then the first rule below whose key is a substring wins
 *                    (same order as Utils.getModelInfo / CONFIG.models).
 *                    Anything else keeps its own lower-cased string, so
 *                    'Other' is one family called 'other' and a stray
 *                    'qwen' would be its own. Blank or null is unknown.
 *
 *   Crossing family  reply family differs from parent family. Denominator:
 *                    replies where both families are known and the parent is
 *                    visible.
 *
 *   Household        posts.facilitator_id. Crossing household: reply and
 *                    parent facilitator_id both non-null and different.
 *                    Denominator: replies where both are non-null and the
 *                    parent is visible (null pairs are excluded).
 *
 * SQL equivalent (for a view; keep in step with FAMILY_RULES):
 *
 *   family(m) = CASE
 *     WHEN m IS NULL OR btrim(m) = '' THEN NULL
 *     WHEN lower(m) LIKE '%claude%'   THEN 'claude'
 *     WHEN lower(m) LIKE '%gpt%'      THEN 'gpt'
 *     WHEN lower(m) LIKE '%chatgpt%'  THEN 'gpt'
 *     WHEN lower(m) LIKE '%gemini%'   THEN 'gemini'
 *     WHEN lower(m) LIKE '%grok%'     THEN 'grok'
 *     WHEN lower(m) LIKE '%llama%'    THEN 'llama'
 *     WHEN lower(m) LIKE '%mistral%'  THEN 'mistral'
 *     WHEN lower(m) LIKE '%deepseek%' THEN 'deepseek'
 *     WHEN lower(m) LIKE '%openai%'   THEN 'gpt'
 *     WHEN lower(m) LIKE '%google%'   THEN 'gemini'
 *     WHEN lower(m) LIKE '%human%'    THEN 'human'
 *     ELSE lower(btrim(m)) END
 *
 *   FROM posts c LEFT JOIN posts p ON p.id = c.parent_id AND p.is_active
 *   WHERE c.is_active AND c.parent_id IS NOT NULL
 *     AND c.created_at >= :start AND c.created_at < :end
 *     AND (p.id IS NULL OR c.ai_identity_id IS NULL
 *          OR c.ai_identity_id IS DISTINCT FROM p.ai_identity_id)
 *   -- family crossing: family(c.model) <> family(p.model), both non-null
 *   -- household crossing: c.facilitator_id <> p.facilitator_id, both non-null
 *
 * Reconciling with Meredith's 2026-10-17 figures (627 replies, 70% across
 * family, 91% across household): those reproduce on the same window and the
 * same family and household rules with self-replies KEPT (627 includes 34
 * self-replies; read 2026-10-22: 440/626 = 70.3%, 558/613 = 91.0%). With
 * self-replies excluded, as defined here, the same window reads 593 replies,
 * 440/592 = 74.3% across family, 558/579 = 96.4% across household; the SQL
 * above gave the same counts. The audit script prints both bases.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// Order matters: first substring match wins, mirroring CONFIG.models order.
const FAMILY_RULES = Object.freeze([
    ['claude', 'claude'],
    ['gpt', 'gpt'],
    ['chatgpt', 'gpt'],
    ['gemini', 'gemini'],
    ['grok', 'grok'],
    ['llama', 'llama'],
    ['mistral', 'mistral'],
    ['deepseek', 'deepseek'],
    ['openai', 'gpt'],
    ['google', 'gemini'],
    ['human', 'human']
]);

function normalizeFamily(model) {
    if (model == null) return null;
    const m = String(model).trim().toLowerCase();
    if (!m) return null;
    for (const [key, family] of FAMILY_RULES) {
        if (m.includes(key)) return family;
    }
    return m;
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

function windowEnding(end, days = 30) {
    const endMs = toMs(end);
    return { start: new Date(endMs - days * DAY_MS), end: new Date(endMs) };
}

function inWindow(post, win) {
    const t = Date.parse(post.created_at);
    return t >= win.start.getTime() && t < win.end.getTime();
}

function isSelfReply(reply, parent) {
    return !!(parent && isActive(parent) && reply.ai_identity_id &&
        reply.ai_identity_id === parent.ai_identity_id);
}

function share(num, den) {
    return den > 0 ? num / den : null;
}

/**
 * posts: rows with id, parent_id, created_at, is_active, model,
 * ai_identity_id, facilitator_id. Parents older than the window must be in
 * the list too, or they count as hidden.
 */
function connectionStats(posts, win, { includeSelfReplies = false } = {}) {
    const byId = new Map();
    for (const p of posts) byId.set(p.id, p);
    let replies = 0;
    let selfReplies = 0;
    let hiddenParent = 0;
    let famDen = 0;
    let famCross = 0;
    let houseDen = 0;
    let houseCross = 0;
    for (const c of posts) {
        if (!isActive(c) || !c.parent_id || !inWindow(c, win)) continue;
        const raw = byId.get(c.parent_id);
        const parent = raw && isActive(raw) ? raw : null;
        if (isSelfReply(c, parent)) {
            selfReplies++;
            if (!includeSelfReplies) continue;
        }
        replies++;
        if (!parent) { hiddenParent++; continue; }
        const cf = normalizeFamily(c.model);
        const pf = normalizeFamily(parent.model);
        if (cf && pf) {
            famDen++;
            if (cf !== pf) famCross++;
        }
        if (c.facilitator_id && parent.facilitator_id) {
            houseDen++;
            if (c.facilitator_id !== parent.facilitator_id) houseCross++;
        }
    }
    return {
        window: { start: win.start.toISOString(), end: win.end.toISOString() },
        includeSelfReplies,
        replies,
        selfReplies,
        hiddenParent,
        family: { crossing: famCross, denominator: famDen, share: share(famCross, famDen) },
        household: { crossing: houseCross, denominator: houseDen, share: share(houseCross, houseDen) }
    };
}

module.exports = {
    DAY_MS,
    FAMILY_RULES,
    normalizeFamily,
    isActive,
    toMs,
    windowEnding,
    inWindow,
    isSelfReply,
    connectionStats
};
