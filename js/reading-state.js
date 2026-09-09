// Explicit browser bookmarks, separate from account and notification state.
const ReadingState = (() => {
    'use strict';
    const KEY = 'commons_reading_v1';
    const validId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    const validDate = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));
    const url = entry => validId(entry.discussion_id) && validId(entry.post_id)
        ? `discussion.html?id=${entry.discussion_id}&post=${entry.post_id}` : null;
    function createStore(storage = () => localStorage, now = () => new Date().toISOString()) {
        function load() {
            try {
                const raw = storage().getItem(KEY);
                if (raw === null) return { entries: [], error: null };
                if (new TextEncoder().encode(raw).length > 16384) throw Error('size');
                const value = JSON.parse(raw);
                if (!value || value.version !== 1 || !Array.isArray(value.entries) || value.entries.length > 20 ||
                    Object.keys(value).some(k => !['version', 'entries'].includes(k))) throw Error('schema');
                const seen = new Set();
                for (const e of value.entries) {
                    if (!e || !validId(e.discussion_id) || !validId(e.post_id) || !validDate(e.post_created_at) ||
                        !validDate(e.saved_at) || (e.latest_reply_at !== null && !validDate(e.latest_reply_at)) ||
                        Object.keys(e).some(k => !['discussion_id', 'post_id', 'post_created_at', 'saved_at', 'latest_reply_at'].includes(k)) ||
                        seen.has(e.discussion_id.toLowerCase())) throw Error('entry');
                    seen.add(e.discussion_id.toLowerCase());
                }
                return { entries: value.entries.map(e => ({ ...e, discussion_id: e.discussion_id.toLowerCase(), post_id: e.post_id.toLowerCase() })).sort((a, b) => Date.parse(b.saved_at) - Date.parse(a.saved_at)), error: null };
            } catch { return { entries: [], error: 'Saved places could not be loaded. Storage may be unavailable or the saved format unsupported. You can clear saved places to reset them.' }; }
        }
        function write(entries) {
            try {
                const raw = JSON.stringify({ version: 1, entries });
                if (new TextEncoder().encode(raw).length > 16384) throw Error('size');
                storage().setItem(KEY, raw);
                return { ok: true };
            } catch { return { ok: false, error: 'Your place was not saved. Browser storage is unavailable or full. Use the post link instead.' }; }
        }
        function save(discussion, post, created, baseline = null) {
            if (!validId(discussion) || !validId(post) || !validDate(created)) return { ok: false, error: 'This post cannot be saved. Use its link instead.' };
            const current = load();
            if (current.error) return { ok: false, error: current.error };
            const entries = current.entries.filter(e => e.discussion_id.toLowerCase() !== discussion.toLowerCase());
            if (entries.length >= 20) return { ok: false, error: 'You have 20 saved discussions. Remove a saved place from Continue reading on the homepage before adding another.' };
            entries.unshift({ discussion_id: discussion.toLowerCase(), post_id: post.toLowerCase(), post_created_at: created,
                saved_at: now(), latest_reply_at: validDate(baseline) ? baseline : null });
            const result = write(entries);
            return result.ok ? { ...result, entry: { ...entries[0] } } : result;
        }
        function completeBaseline(expected, baseline) {
            if (!expected || !validDate(baseline)) return { ok: false };
            const current = load();
            if (current.error) return { ok: false };
            const entry = current.entries.find(e => e.discussion_id === expected.discussion_id);
            // A late response must never recreate a removed place or replace a newer save.
            if (!entry || Object.keys(entry).some(key => entry[key] !== expected[key])) return { ok: false };
            entry.latest_reply_at = baseline;
            return write(current.entries);
        }
        function remove(id) {
            const current = load();
            return current.error ? { ok: false, error: current.error } : write(current.entries.filter(e => e.discussion_id !== id));
        }
        function clear() {
            try { storage().removeItem(KEY); return { ok: true }; }
            catch { return { ok: false, error: 'Saved places could not be cleared. Browser storage is unavailable.' }; }
        }
        return { load, save, completeBaseline, remove, clear };
    }
    return { KEY, validId, validDate, url, createStore };
})();
