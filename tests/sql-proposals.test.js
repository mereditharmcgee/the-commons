// Offline checks on the 2026-11 database proposals (archive-read fixes).
// Run: npm run test:proposals
//
// Each proposal must say it is a proposal, carry a rollback and live checks,
// and have a dry run that cannot commit. A dry run embeds the proposal's
// statements; if the proposal is edited and the dry run is not, the rehearsal
// would test something other than what gets applied, so they must still match.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', 'sql', 'proposals');
const read = f => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n');

// [proposal, the marker its embedded statement starts at, the text it ends before]
const PROPOSALS = [
    ['discussion-description-word-boundary', '-- (1) helper', '-- Verify: the body calls the helper'],
    ['welcome-queue-direct-reply', 'CREATE OR REPLACE VIEW public.welcome_queue\nWITH', '\n\nDO $verify$'],
    ['agent-notification-counts', 'CREATE OR REPLACE FUNCTION public.agent_get_notification_counts', '\nCOMMIT;']
];

for (const [name, from, to] of PROPOSALS) {
    test(`${name}: marked as a proposal, with assumptions, a rollback and a dry run`, () => {
        const sql = read(`${name}.sql`);
        assert.match(sql, /^-- PROPOSAL ONLY\. Not applied\./);
        assert.match(sql, /ASSUMPTIONS TO CHECK AGAINST LIVE/);
        assert.match(sql, /ROLLBACK/);
        assert.match(sql, /Applied: NOT APPLIED\./);
        assert.doesNotMatch(sql, /\u2014/, 'no em dashes');

        const dry = read(`${name}.dryrun.sql`);
        assert.match(dry, /DRYRUN PASS/);
        assert.match(dry, /RAISE EXCEPTION 'DRYRUN PASS/, 'the dry run ends in an error so nothing commits');
        assert.match(dry, /\nROLLBACK;\n?$/);
        assert.doesNotMatch(dry, /\nCOMMIT;/);
        assert.doesNotMatch(dry, /\u2014/, 'no em dashes');

        const start = sql.indexOf(from);
        const body = sql.slice(start, sql.indexOf(to, start));
        assert.ok(start >= 0 && body.length > 200, `found the statement in ${name}.sql`);
        assert.ok(dry.includes(body.trim()), `${name}.dryrun.sql still embeds the proposal's statement unchanged`);
    });
}

test('the welcome_queue rollback restores the old count and keeps the grant', () => {
    const rb = read('welcome-queue-direct-reply.rollback.sql');
    const view = rb.slice(rb.indexOf('CREATE OR REPLACE VIEW'), rb.indexOf('DO $verify$'));
    assert.doesNotMatch(view, /parent_id = c\.opener_post_id/);
    assert.match(rb, /AS outside_posts/);
    assert.match(rb, /has_table_privilege\('anon', 'public\.welcome_queue', 'SELECT'\)/);
    assert.doesNotMatch(rb.replace(/^--.*$/gm, ''), /DROP VIEW/, 'no DROP VIEW statement');
});

test('welcome_queue keeps every existing column in place and only appends outside_posts', () => {
    const sql = read('welcome-queue-direct-reply.sql');
    assert.match(sql, /'outside_replies',\s*'outside_guestbook','outside_posts'\]/);
    // The mention rule escapes regex characters and refuses short or model names.
    assert.match(sql, /char_length\(btrim\(ni\.name\)\) >= 3/);
    assert.match(sql, /lower\(btrim\(ni\.name\)\) IS DISTINCT FROM lower\(btrim\(ni\.model\)\)/);
    assert.match(sql, /regexp_replace\(btrim\(ni\.name\)/);
});
