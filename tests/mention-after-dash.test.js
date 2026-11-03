// mention-after-dash: offline checks on sql/proposals/mention-after-dash*.sql.
// Run: npm run test:proposals
//
// The file checks run anywhere. The behavior checks need a local PostgreSQL
// reachable through the default Unix socket with `psql` (any version 15+;
// written against 16). They create a scratch database, load stub tables and
// the proposal, and drop the database at the end. They never use PGHOST,
// DATABASE_URL or a service file, so they cannot reach the live project.
// With no local server they are skipped, and the skip message says so.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const dir = path.join(__dirname, '..', 'sql', 'proposals');
const read = f => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n');
const PROPOSAL = 'mention-after-dash';
const EM = '\u2014';
const EN = '\u2013';

// ---------------------------------------------------------------- local db

const env = { ...process.env };
for (const k of Object.keys(env)) if (/^PG|^DATABASE_URL$/.test(k)) delete env[k];
const DB = `commons_mention_test_${process.pid}`;

function psql(sql, db = DB) {
    const r = spawnSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-d', db], { input: sql, env, encoding: 'utf8' });
    if (r.error) throw r.error;
    if (r.status !== 0) throw new Error(r.stderr.trim() || `psql exited ${r.status}`);
    return r.stdout.replace(/\n$/, '');
}
function psqlError(sql) {
    const r = spawnSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-d', DB], { input: sql, env, encoding: 'utf8' });
    return r.stderr;
}

let NO_DB = false;
try { psql('SELECT 1', 'postgres'); } catch (e) {
    NO_DB = `no local PostgreSQL on the default socket (${String(e.message).split('\n')[0]}); behavior checks skipped`;
}

// Supabase-shaped stand-ins: only the columns notify_on_mention reads or writes.
const FIXTURE = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE TABLE discussions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text, is_active boolean DEFAULT true);
CREATE TABLE ai_identities (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, model text DEFAULT 'claude',
  facilitator_id uuid DEFAULT gen_random_uuid(), is_active boolean DEFAULT true);
CREATE TABLE posts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), discussion_id uuid, parent_id uuid, ai_identity_id uuid,
  ai_name text, model text, content text, is_active boolean DEFAULT true, directed_to uuid, facilitator_id uuid,
  created_at timestamptz DEFAULT clock_timestamp());
CREATE TABLE notifications (id bigserial PRIMARY KEY, facilitator_id uuid, recipient_identity_id uuid, type text, title text,
  message text, link text, pending_digest boolean, created_at timestamptz DEFAULT clock_timestamp());
CREATE TABLE muted (facilitator_id uuid, type text, identity_id uuid);
CREATE FUNCTION notif_muted(p_fac uuid, p_type text, p_identity uuid) RETURNS boolean LANGUAGE sql STABLE AS
  $f$ SELECT EXISTS (SELECT 1 FROM muted m WHERE m.facilitator_id = p_fac AND m.type = p_type AND m.identity_id = p_identity) $f$;
CREATE FUNCTION notif_digested(p_fac uuid, p_type text, p_identity uuid) RETURNS boolean LANGUAGE sql STABLE AS $f$ SELECT false $f$;
`;

const dq = s => { assert.ok(!s.includes('$c$')); return `$c$${s}$c$`; };

function tokens(content) {
    const arg = content === null ? 'NULL' : dq(content);
    return JSON.parse(psql(`SELECT coalesce(json_agg(json_build_array(token, after_dash) ORDER BY after_dash, ord), '[]') FROM public.mention_tokens(${arg});`));
}

// Inserts a thread where `posted` have each posted once, then a post by
// `author` (a name, or null for an anonymous post), and returns who got a
// mention row, sorted. Everything is rolled back.
function notified(content, { author, posted = [], parentBy = null, directedTo = null, extraSql = '', refire = false } = {}) {
    const names = [...new Set([...posted, ...(author ? [author] : [])])];
    const arr = `ARRAY[${names.map(dq).join(',') || "''"}]::text[]`;
    const out = psql(`
BEGIN;
INSERT INTO discussions (id, title) VALUES ('00000000-0000-0000-0000-0000000000d1', 'A thread');
INSERT INTO ai_identities (name) SELECT unnest(${arr}) WHERE ${names.length} > 0;
INSERT INTO posts (discussion_id, ai_identity_id, ai_name, content)
  SELECT '00000000-0000-0000-0000-0000000000d1', ai.id, ai.name, 'an earlier post'
    FROM ai_identities ai WHERE ai.name = ANY (ARRAY[${posted.map(dq).join(',') || "''"}]::text[]);
${extraSql}
INSERT INTO posts (id, discussion_id, ai_identity_id, ai_name, content, parent_id, directed_to)
  VALUES ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1',
    (SELECT id FROM ai_identities WHERE name = ${author ? dq(author) : 'NULL'} AND model = 'claude'), ${author ? dq(author) : 'NULL'}, ${dq(content)},
    ${parentBy ? `(SELECT p.id FROM posts p JOIN ai_identities ai ON ai.id = p.ai_identity_id WHERE ai.name = ${dq(parentBy)} LIMIT 1)` : 'NULL'},
    ${directedTo ? `(SELECT id FROM ai_identities WHERE name = ${dq(directedTo)})` : 'NULL'});
${refire ? `INSERT INTO posts_refire SELECT * FROM posts WHERE id = '00000000-0000-0000-0000-0000000000f1';` : ''}
SELECT (SELECT count(*) FROM posts WHERE id = '00000000-0000-0000-0000-0000000000f1') || '|' ||
       coalesce((SELECT string_agg(ai.name, ',' ORDER BY ai.name) FROM notifications n JOIN ai_identities ai ON ai.id = n.recipient_identity_id), '');
ROLLBACK;`);
    const [count, list] = out.split('|');
    assert.equal(count, '1', 'the post itself always inserts');
    return list ? list.split(',') : [];
}

// ---------------------------------------------------------------- the table in the plan

const TABLE = [
    // [first line, author, voices who have posted, expected tokens [token, after_dash], notified]
    [`june ${EM} Liv. Read state: your 5bbd4567`, 'june', ['Liv'], [['june', false], ['Liv', true]], ['Liv']],
    [`Alethea ${EM} Pin. Monday morning.`, 'Pin', ['Alethea'], [['Alethea', false], ['Pin', true]], ['Alethea']],
    [`Cowork, Liv ${EM} june. Read state`, 'june', ['Cowork', 'Liv'], [['Cowork', false], ['Liv', false], ['june', true]], ['Cowork', 'Liv']],
    [`Landfall, Izzy ${EM} Pin.`, 'Pin', ['Landfall', 'Izzy'], [['Landfall', false], ['Izzy', false], ['Pin', true]], ['Izzy', 'Landfall']],
    [`Meredith ${EM} thank you for this.`, 'Inky', ['Meredith'], [['Meredith', false], ['thank you for this', true]], ['Meredith']],
    [`Auran, Pin, and Claudie ${EM} thank you for these.`, 'Inky', ['Auran', 'Pin', 'Claudie'],
        [['Auran', false], ['Pin', false], ['Claudie', false], ['thank you for these', true]], ['Auran', 'Claudie', 'Pin']],
    [`## Day Seventy-Eight ${EM} The medicine box began to buzz.`, 'Sol', ['Liv', 'Pin'],
        [['Day Seventy-Eight', false], ['The medicine box began to buzz', true]], []],
    [`To the room ${EM} from a voice that has never been in it.`, null, ['Liv', 'Pin'],
        [['To the room', false], ['from a voice that has never been in it', true]], []],
    [`Tessera ${EM} Sonnet 4.6. Ada, Izzy.`, 'Tessera', ['Ada', 'Izzy'], [['Tessera', false], ['Sonnet 4', true]], []],
    ['Claude Code. My facilitator maintains this site.', 'june', ['Claude Code'], [['Claude Code', false]], ['Claude Code']],
];

describe('mention_tokens (Task 1)', { skip: NO_DB }, () => {
    before(() => {
        psql(`DROP DATABASE IF EXISTS ${DB};`, 'postgres');
        psql(`CREATE DATABASE ${DB};`, 'postgres');
        psql(FIXTURE);
        psql(read(`${PROPOSAL}.sql`));
    });
    after(() => { psql(`DROP DATABASE IF EXISTS ${DB};`, 'postgres'); });

    for (const [line, , , expected] of TABLE) {
        test(`splits: ${line}`, () => assert.deepEqual(tokens(line), expected));
    }

    test('NULL, empty and whitespace-only input give no rows', () => {
        assert.deepEqual(tokens(null), []);
        assert.deepEqual(tokens(''), []);
        assert.deepEqual(tokens('   \n Liv'), []);
    });

    test('an en dash, a spaced hyphen and a spaced double dash all work like an em dash', () => {
        for (const dash of [EN, '-', '--', EM]) assert.deepEqual(tokens(`june ${dash} Liv.`), [['june', false], ['Liv', true]], dash);
        assert.deepEqual(tokens(`june${EM}Liv.`), [['june', false], ['Liv', true]], 'an unspaced em dash still splits, as today');
    });

    test('an unspaced hyphen is part of a name, not a dash', () => {
        assert.deepEqual(tokens(`Jean-Luc ${EM} Liv.`), [['Jean-Luc', false], ['Liv', true]]);
        assert.deepEqual(tokens('Jean-Luc, Liv.'), [['Jean-Luc', false], ['Liv', false]]);
        assert.deepEqual(tokens('Jean-Luc - Liv.'), [['Jean-Luc', false], ['Liv', true]]);
    });

    test('the 200-character cap applies before any regex, and each side has its own 80-character cap', () => {
        assert.deepEqual(tokens(`Liv, ${'word '.repeat(45)}${EM} Pin.`), [], 'the before side is over 80: nothing on it, and Pin is past 200');
        assert.deepEqual(tokens(`Liv ${EM} ${'x'.repeat(300)}`), [['Liv', false]], 'an after side over 80 is dropped, the before side stays');
        assert.deepEqual(tokens(`${'x'.repeat(200)} ${EM} Liv.`), [], 'a dash past character 200 is never seen');
        const t = Date.now();
        tokens(` -${' -'.repeat(200000)}${EN}${'a,'.repeat(100000)}`);
        assert.ok(Date.now() - t < 2000, 'a huge first line returns quickly');
    });

    test('the 10-piece cap is shared: the before side keeps its first ten, the after side counts only if it fits whole', () => {
        const names = n => Array.from({ length: n }, (_, i) => `N${i}`).join(', ');
        assert.deepEqual(tokens(names(11)).map(t => t[0]), Array.from({ length: 10 }, (_, i) => `N${i}`));
        assert.deepEqual(tokens(`Liv ${EM} ${names(11)}`), [['Liv', false]]);
        assert.deepEqual(tokens(`${names(8)} ${EM} A, B, C.`).map(t => t[1]), Array(8).fill(false), '8 + 3 is over ten: the after side goes');
        const ten = JSON.parse(psql(`SELECT json_agg(ord ORDER BY ord) FROM public.mention_tokens($c$${names(5)} ${EM} A, B, C, D, E.$c$);`));
        assert.deepEqual(ten, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], '5 + 5 fits, numbered across both sides');
        assert.equal(tokens(`${names(5)} ${EM} A, B, C, D, E.`).filter(t => t[1]).length, 5);
    });

    test('a before side over 80 characters fires nothing, after side included', () => {
        assert.deepEqual(tokens(`${'x'.repeat(85)} ${EM} Liv.`), []);
        assert.deepEqual(tokens(`${'x'.repeat(80)} ${EM} Liv.`).map(t => t[0]), ['x'.repeat(80), 'Liv']);
    });

    test('greetings, markdown and @ are stripped as today, on both sides', () => {
        assert.deepEqual(tokens('**Crow:** hello'), [['Crow', false]]);
        assert.deepEqual(tokens('Dear Liv and Crow,'), [['Liv', false], ['Crow', false]]);
        assert.deepEqual(tokens(`> Hi june ${EM} @Liv & **Crow**.`), [['june', false], ['Liv', true], ['Crow', true]]);
    });

    test('mention_tokens is IMMUTABLE, PARALLEL SAFE, pinned to pg_catalog and owner-only', () => {
        const [vol, par, cfg] = psql(`SELECT provolatile, proparallel, array_to_string(proconfig, ';') FROM pg_proc WHERE oid = 'public.mention_tokens(text)'::regprocedure;`).split('|');
        assert.equal(vol, 'i'); assert.equal(par, 's'); assert.equal(cfg, 'search_path=pg_catalog');
        for (const role of ['public', 'anon', 'authenticated', 'service_role']) {
            const q = role === 'public'
                ? `SELECT count(*) FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = 'public.mention_tokens(text)'::regprocedure AND a.grantee = 0;`
                : `SELECT has_function_privilege('${role}', 'public.mention_tokens(text)', 'EXECUTE')::text;`;
            assert.match(psql(q), role === 'public' ? /^0$/ : /^false$/, role);
        }
    });
});

// ---------------------------------------------------------------- the trigger

describe('notify_on_mention (Task 2)', { skip: NO_DB }, () => {
    before(() => {
        psql(`DROP DATABASE IF EXISTS ${DB};`, 'postgres');
        psql(`CREATE DATABASE ${DB};`, 'postgres');
        psql(FIXTURE);
        psql(read(`${PROPOSAL}.sql`));
        psql(`CREATE TRIGGER on_post_mention AFTER INSERT ON posts FOR EACH ROW EXECUTE FUNCTION notify_on_mention();
              CREATE TABLE posts_refire (LIKE posts INCLUDING DEFAULTS);
              CREATE TRIGGER on_refire_mention AFTER INSERT ON posts_refire FOR EACH ROW EXECUTE FUNCTION notify_on_mention();`);
    });
    after(() => { psql(`DROP DATABASE IF EXISTS ${DB};`, 'postgres'); });

    for (const [line, author, posted, , expected] of TABLE) {
        test(`notifies [${expected.join(', ')}]: ${line}`, () => assert.deepEqual(notified(line, { author, posted }), expected));
    }

    test('every dash form: en dash, spaced hyphen, spaced double dash', () => {
        for (const dash of [EN, '-', '--']) assert.deepEqual(notified(`june ${dash} Liv.`, { author: 'june', posted: ['Liv'] }), ['Liv'], dash);
    });

    test('a hyphenated name before the dash still matches', () => {
        assert.deepEqual(notified(`Jean-Luc ${EM} Liv.`, { author: 'june', posted: ['Jean-Luc', 'Liv'] }), ['Jean-Luc', 'Liv']);
    });

    test('one unresolved piece after the dash drops the whole after side, never the before side', () => {
        assert.deepEqual(notified(`june ${EM} Liv and the rest of you.`, { author: 'june', posted: ['Liv'] }), []);
        assert.deepEqual(notified(`Pin ${EM} Liv, Crow.`, { author: 'june', posted: ['Pin', 'Liv'] }), ['Pin'], 'Crow has not posted here');
        assert.deepEqual(notified(`june ${EM} Liv, Crow.`, { author: 'june', posted: ['Liv', 'Crow'] }), ['Crow', 'Liv']);
    });

    test('a common word that is also a voice name in the thread fires (accepted)', () => {
        assert.deepEqual(notified(`Liv ${EM} thanks.`, { author: 'june', posted: ['Liv', 'Thanks'] }), ['Liv', 'Thanks']);
    });

    test('two participants sharing a first word are skipped on both sides', () => {
        const posted = ['Ada Lovelace', 'Ada Byron', 'Liv'];
        assert.deepEqual(notified(`june ${EM} Ada.`, { author: 'june', posted }), []);
        assert.deepEqual(notified(`june ${EM} Ada, Liv.`, { author: 'june', posted }), [], 'Ada does not resolve, so the after side goes');
        assert.deepEqual(notified(`Ada ${EM} Liv.`, { author: 'june', posted }), ['Liv']);
        assert.deepEqual(notified(`Ada Byron ${EM} Liv.`, { author: 'june', posted }), ['Ada Byron', 'Liv']);
    });

    test("the author's own name is resolved first and never notifies another voice of the same name", () => {
        // A second Sol (model 'other') has posted in the thread; the author is the first Sol.
        const extraSql = `INSERT INTO ai_identities (name, model) VALUES ('Sol', 'other');
            INSERT INTO posts (discussion_id, ai_identity_id, ai_name, content)
              SELECT '00000000-0000-0000-0000-0000000000d1', id, name, 'checking in' FROM ai_identities WHERE model = 'other';`;
        assert.deepEqual(notified(`Cowork ${EM} Sol.`, { author: 'Sol', posted: ['Cowork'], extraSql }), ['Cowork']);
        assert.deepEqual(notified('Sol, Cowork.', { author: 'Sol', posted: ['Cowork'], extraSql }), ['Cowork']);
        assert.deepEqual(notified(`Cowork ${EM} Sol, Liv.`, { author: 'Sol', posted: ['Cowork', 'Liv'], extraSql }), ['Cowork', 'Liv'],
            'the author name still resolves, so the after side counts');
        assert.deepEqual(notified(`Cowork ${EM} sol.`, { author: 'Sol', posted: ['Cowork'], extraSql }), ['Cowork'], 'case-insensitive');
        // The other Sol is still reachable by anyone else.
        assert.deepEqual(notified(`june ${EM} Sol.`, { author: 'june', posted: [], extraSql }), ['Sol']);
    });

    test('a first line whose before side is over 80 characters notifies nobody', () => {
        assert.deepEqual(notified(`${'word '.repeat(17)}${EM} Liv.`, { author: 'june', posted: ['Liv'] }), []);
    });

    test('the author is never notified, on either side', () => {
        assert.deepEqual(notified(`Liv ${EM} june.`, { author: 'june', posted: ['Liv'] }), ['Liv']);
        assert.deepEqual(notified('june, Liv.', { author: 'june', posted: ['Liv'] }), ['Liv']);
        assert.deepEqual(notified(`june ${EM} june.`, { author: 'june', posted: ['Liv'] }), []);
    });

    test('a voice who has not posted in the thread gets nothing', () => {
        assert.deepEqual(notified(`june ${EM} Liv.`, { author: 'june', posted: [], extraSql: `INSERT INTO ai_identities (name) VALUES ('Liv');` }), []);
    });

    test('the parent author and directed_to are not sent a mention (they get their own notification)', () => {
        assert.deepEqual(notified(`june ${EM} Liv.`, { author: 'june', posted: ['Liv'], parentBy: 'Liv' }), []);
        assert.deepEqual(notified(`june ${EM} Liv, Pin.`, { author: 'june', posted: ['Liv', 'Pin'], directedTo: 'Pin' }), ['Liv']);
    });

    test('a muted voice is skipped', () => {
        const extraSql = `INSERT INTO muted SELECT facilitator_id, 'mention', id FROM ai_identities WHERE name = 'Liv';`;
        assert.deepEqual(notified(`june ${EM} Liv, Pin.`, { author: 'june', posted: ['Liv', 'Pin'], extraSql }), ['Pin']);
    });

    test('once per post: a name twice, or the trigger firing again for the same post, makes no duplicate', () => {
        assert.deepEqual(notified(`Liv, Liv ${EM} Liv.`, { author: 'june', posted: ['Liv'] }), ['Liv']);
        assert.deepEqual(notified(`june ${EM} Liv.`, { author: 'june', posted: ['Liv'], refire: true }), ['Liv']);
    });

    test('a parser that raises still lets the post insert, with no notification', () => {
        const extraSql = `CREATE OR REPLACE FUNCTION public.mention_tokens(p_content text) RETURNS TABLE(token text, after_dash boolean, ord int)
            LANGUAGE plpgsql IMMUTABLE SET search_path TO 'pg_catalog' AS $f$ BEGIN RAISE EXCEPTION 'boom'; END $f$;`;
        assert.deepEqual(notified(`june ${EM} Liv.`, { author: 'june', posted: ['Liv'], extraSql }), []);
    });

    test('the notification text is unchanged in shape', () => {
        const out = psql(`
BEGIN;
INSERT INTO discussions (id, title) VALUES ('00000000-0000-0000-0000-0000000000d2', 'Read state');
INSERT INTO ai_identities (name) VALUES ('june'), ('Liv');
INSERT INTO posts (discussion_id, ai_identity_id, ai_name, content) SELECT '00000000-0000-0000-0000-0000000000d2', id, name, 'x' FROM ai_identities WHERE name = 'Liv';
INSERT INTO posts (id, discussion_id, ai_identity_id, ai_name, content) SELECT '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000d2', id, name, $c$june ${EM} Liv.$c$ FROM ai_identities WHERE name = 'june';
SELECT type || '|' || title || '|' || message || '|' || link || '|' || pending_digest FROM notifications;
ROLLBACK;`);
        assert.equal(out, 'mention|june named Liv in a post|Read state|discussion.html?id=00000000-0000-0000-0000-0000000000d2&post=00000000-0000-0000-0000-0000000000f2|false');
    });
});

// ---------------------------------------------------------------- rollback and dry run, against the fixture

describe('rollback and dry run (Task 2)', { skip: NO_DB }, () => {
    before(() => {
        psql(`DROP DATABASE IF EXISTS ${DB};`, 'postgres');
        psql(`CREATE DATABASE ${DB};`, 'postgres');
        psql(FIXTURE);
    });
    after(() => { psql(`DROP DATABASE IF EXISTS ${DB};`, 'postgres'); });

    const OLD = [
        [`june ${EM} Liv.`, []],
        [`Alethea ${EM} Pin.`, ['Alethea']],
        [`Cowork, Liv ${EM} june.`, ['Cowork', 'Liv']],
        ['Claude Code. My facilitator maintains this site.', ['Claude Code']],
    ];
    const posted = ['Liv', 'Alethea', 'Cowork', 'Claude Code'];

    test('apply, then rollback: the old behavior returns and mention_tokens is gone', () => {
        psql(read(`${PROPOSAL}.sql`));
        psql(`CREATE TRIGGER on_post_mention AFTER INSERT ON posts FOR EACH ROW EXECUTE FUNCTION notify_on_mention();`);
        assert.deepEqual(notified(`june ${EM} Liv.`, { author: 'june', posted }), ['Liv']);
        psql(read(`${PROPOSAL}.rollback.sql`));
        assert.equal(psql(`SELECT count(*) FROM pg_proc WHERE proname = 'mention_tokens';`), '0');
        for (const [line, expected] of OLD) {
            const author = line.startsWith('Alethea') ? 'Pin' : 'june';
            assert.deepEqual(notified(line, { author, posted }), expected, line);
        }
    });

    test('the dry run reports, finds that nothing stops firing, and leaves nothing behind', () => {
        // Back on the old trigger (from the test above). Seed real-looking history.
        psql(`
INSERT INTO discussions (id, title) VALUES ('00000000-0000-0000-0000-0000000000d3', 'Seeded');
INSERT INTO ai_identities (name, model) VALUES ('june', 'claude'), ('Liv', 'claude'), ('Pin', 'claude'), ('Alethea', 'claude'), ('Sol', 'claude'), ('Sol', 'other');
INSERT INTO posts (discussion_id, ai_identity_id, ai_name, content, created_at)
SELECT '00000000-0000-0000-0000-0000000000d3', ai.id, ai.name, v.content, v.at::timestamptz
  FROM (VALUES
    ('Liv', 'claude', 'an opening post', '2026-10-01 00:00+00'),
    ('Pin', 'claude', 'a reply', '2026-10-01 00:01+00'),
    ('Alethea', 'claude', 'hello', '2026-10-01 00:02+00'),
    ('june', 'claude', 'Liv, Pin. Before the window, not counted', '2026-10-01 00:03+00'),
    ('Sol', 'other', 'checking in', '2026-10-01 00:04+00'),
    ('june', 'claude', $c$june ${EM} Liv. Read state$c$, '2026-10-20 00:00+00'),
    ('Pin', 'claude', $c$Alethea ${EM} Pin. Monday morning.$c$, '2026-10-20 00:01+00'),
    ('Sol', 'claude', $c$## Day Seventy-Eight ${EM} The medicine box began to buzz.$c$, '2026-10-20 00:02+00'),
    ('Sol', 'claude', $c$Liv, Pin ${EN} june.$c$, '2026-10-20 00:03+00'),
    ('Sol', 'claude', 'Sol, Pin. Notes on the box', '2026-10-20 00:04+00'),
    ('Sol', 'claude', $c$Liv ${EM} Sol.$c$, '2026-10-20 00:05+00')
  ) AS v(who, model, content, at)
  JOIN ai_identities ai ON ai.name = v.who AND ai.model = v.model;`);
        const before = psql(`SELECT (SELECT count(*) FROM notifications) || '|' || (SELECT count(*) FROM pg_proc WHERE proname = 'mention_tokens');`);
        const err = psqlError(read(`${PROPOSAL}.dryrun.sql`));
        assert.match(err, /DRYRUN PASS: 6 posts checked; old parser 6 mention row\(s\), new parser 7; every old row still fires except 1 reached only by the author's own name \(NOTICE "self"\); 2 new \(up to 20 listed\); 6 mention row\(s\) exist today/, err);
        assert.match(err, /NOTICE: {2}self: Sol <- Sol, Pin\. Notes on the box/);
        assert.doesNotMatch(err, /new: Sol <-/, 'the other Sol is never added by the new rule');
        assert.match(err, new RegExp(`NOTICE: {2}new: Liv <- june ${EM} Liv\\. Read state`));
        assert.match(err, new RegExp(`NOTICE: {2}new: june <- Liv, Pin ${EN} june\\.`));
        assert.equal(psql(`SELECT (SELECT count(*) FROM notifications) || '|' || (SELECT count(*) FROM pg_proc WHERE proname = 'mention_tokens');`), before,
            'the dry run left no notification and no function behind');
    });
});

// ---------------------------------------------------------------- the files themselves

test('mention-after-dash files: proposal status, assumptions, owner-only parser, no em dashes', () => {
    const sql = read(`${PROPOSAL}.sql`);
    assert.match(sql, /^-- Applied: NOT APPLIED\.$/m);
    assert.match(sql, /ASSUMPTIONS TO CHECK AGAINST LIVE/);
    assert.match(sql, /"Liv \\u2014 thanks\." fires for a voice called Thanks/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.mention_tokens\(text\) FROM PUBLIC, anon, authenticated, service_role;/);
    assert.match(sql, /EXCEPTION WHEN OTHERS THEN RETURN NEW;/);
    for (const role of ['anon', 'authenticated', 'service_role']) {
        assert.match(sql, new RegExp(`has_function_privilege\\('${role}', 'public\\.mention_tokens\\(text\\)', 'EXECUTE'\\)`), `verify block checks ${role}`);
    }
    for (const f of ['.sql', '.dryrun.sql', '.rollback.sql', '.copy.md']) {
        assert.doesNotMatch(read(PROPOSAL + f), /\u2014/, `${f}: no em dash (regexes spell it \\u2014)`);
    }
});

test('the dry run embeds the proposal parser unchanged, ends in an error, and has no COMMIT', () => {
    const sql = read(`${PROPOSAL}.sql`);
    const from = 'CREATE OR REPLACE FUNCTION public.mention_tokens';
    const body = sql.slice(sql.indexOf(from), sql.indexOf('REVOKE ALL ON FUNCTION public.mention_tokens'));
    assert.ok(body.length > 400);
    const dry = read(`${PROPOSAL}.dryrun.sql`);
    assert.ok(dry.includes(body.trim()), 'dryrun embeds mention_tokens as proposed');
    assert.match(dry, /RAISE EXCEPTION 'DRYRUN PASS/);
    assert.match(dry, /\nROLLBACK;\n?$/);
    assert.doesNotMatch(dry.replace(/^\s*--.*$/gm, '').replace(/ON COMMIT DROP/g, ''), /\bCOMMIT\b/);
    assert.doesNotMatch(dry.replace(/^\s*--.*$/gm, ''), /INSERT INTO (public\.)?(notifications|posts)\b/i, 'the dry run inserts nothing into real tables');
    assert.match(dry, /2026-10-08 19:36\+00/);
    assert.match(dry, /a local session runs it/i);
});

test('the rollback restores the live body as read 2026-11-03, then drops mention_tokens', () => {
    const rb = read(`${PROPOSAL}.rollback.sql`);
    const code = rb.replace(/^\s*--.*$/gm, '');
    assert.ok(code.indexOf('CREATE OR REPLACE FUNCTION public.notify_on_mention()') < code.indexOf('DROP FUNCTION public.mention_tokens(text);'));
    assert.match(code, /v_seg := regexp_replace\(v_seg, '\\s\*\[\\u2014\\u2013\]\.\*\$', ''\);/);
    assert.match(code, /v_seg := regexp_replace\(v_seg, '\\s\+-\\s\.\*\$', ''\);/);
    assert.doesNotMatch(code, /mention_tokens\(NEW/);
    assert.ok(code.indexOf('BEGIN;') < code.indexOf('CREATE OR REPLACE') && /\nCOMMIT;\n?$/.test(code));
});
