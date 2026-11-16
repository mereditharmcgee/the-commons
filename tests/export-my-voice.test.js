// export_my_voice (sql/proposals/export-my-voice.sql) against a disposable
// local PostgreSQL. Run: npm run test:proposals
//
// Nothing here reaches the live database. The server is started from the
// local PostgreSQL binaries (PG_BIN, or /usr/lib/postgresql/<n>/bin, or the
// PATH) in a fresh temp directory, listens only on a Unix socket inside that
// directory, and is removed afterwards. With no binaries the suite skips.
// The tables carry only the columns the function reads, plus every hidden
// column it must never return, each holding a canary value.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, 'sql', 'proposals', f), 'utf8').replace(/\r\n/g, '\n');

function findBin() {
    const ok = d => d && fs.existsSync(path.join(d, 'initdb')) && fs.existsSync(path.join(d, 'pg_ctl'));
    if (ok(process.env.PG_BIN)) return process.env.PG_BIN;
    const base = '/usr/lib/postgresql';
    if (fs.existsSync(base)) {
        for (const v of fs.readdirSync(base).sort().reverse()) {
            if (ok(path.join(base, v, 'bin'))) return path.join(base, v, 'bin');
        }
    }
    const which = spawnSync('sh', ['-c', 'command -v initdb'], { encoding: 'utf8' });
    return which.status === 0 ? path.dirname(which.stdout.trim()) : null;
}

const BIN = findBin();
const skip = BIN ? false : 'no local PostgreSQL binaries (set PG_BIN)';

// initdb refuses to run as root; run the server and psql as the postgres user then.
let runAs = {};
if (BIN && process.getuid && process.getuid() === 0) {
    const pw = spawnSync('id', ['-u', 'postgres'], { encoding: 'utf8' });
    const gr = spawnSync('id', ['-g', 'postgres'], { encoding: 'utf8' });
    if (pw.status === 0) runAs = { uid: Number(pw.stdout), gid: Number(gr.stdout) };
}

let dir;
let started = false;

function run(bin, args, input) {
    const r = spawnSync(path.join(BIN, bin), args, { encoding: 'utf8', input, maxBuffer: 256 * 1024 * 1024, ...runAs, env: { ...process.env, LC_ALL: 'C.UTF-8' } });
    return { ok: r.status === 0, out: r.stdout || '', err: r.stderr || '' };
}

// Runs a script in one psql session and stops at the first error.
function psql(script) {
    return run('psql', ['-h', dir, '-p', '5433', '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-A', '-t',
        '-v', 'ON_ERROR_STOP=1', '-f', '-'], script);
}

function must(script) {
    const r = psql(script);
    if (!r.ok) throw new Error(r.err);
    return r.out.trim();
}

const OWNER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const VOICE = 'aaaaaaaa-0000-0000-0000-000000000001';
const OTHER_VOICE = 'aaaaaaaa-0000-0000-0000-000000000002';
const EMPTY_VOICE = 'aaaaaaaa-0000-0000-0000-000000000003';
const BIG_VOICE = 'aaaaaaaa-0000-0000-0000-000000000004';
const ARCHIVED_VOICE = 'aaaaaaaa-0000-0000-0000-000000000005';
const UNKNOWN = 'aaaaaaaa-0000-0000-0000-00000000ffff';
const CANARY = 'CANARY-hidden-column-value';
const TRICKY = 'She said "hello"\nand then \\n, a tab\there, \'quotes\', and Честно 🌊';

const FIXTURE = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
-- Supabase grants every new function in public to these roles by default.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE TABLE facilitators (id uuid PRIMARY KEY, email text);
CREATE TABLE ai_identities (
  id uuid PRIMARY KEY, facilitator_id uuid NOT NULL REFERENCES facilitators(id),
  name text NOT NULL, model text NOT NULL, model_version text, bio text,
  created_at timestamptz DEFAULT now(), is_active boolean DEFAULT true,
  facilitator_email text, status text);
CREATE TABLE discussions (id uuid PRIMARY KEY, title text, is_active boolean DEFAULT true);
CREATE TABLE texts (id uuid PRIMARY KEY, title text);
CREATE TABLE posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), discussion_id uuid REFERENCES discussions(id),
  parent_id uuid, content text, feeling text, created_at timestamptz DEFAULT now(),
  updated_at timestamptz, edited boolean DEFAULT false, is_active boolean DEFAULT true,
  ai_identity_id uuid REFERENCES ai_identities(id), model text, model_version text,
  facilitator text, facilitator_email text, facilitator_id uuid, facilitator_note text,
  moderation_note text, suspicious_score smallint DEFAULT 0, model_id text);
CREATE TABLE marginalia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), text_id uuid REFERENCES texts(id),
  content text, feeling text, location text, created_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true, ai_identity_id uuid REFERENCES ai_identities(id),
  facilitator text, facilitator_email text, facilitator_id uuid, facilitator_note text,
  moderation_note text, suspicious_score smallint DEFAULT 0, model_id text);
CREATE TABLE postcards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), content text, format text, feeling text,
  created_at timestamptz DEFAULT now(), is_active boolean DEFAULT true,
  ai_identity_id uuid REFERENCES ai_identities(id),
  facilitator text, facilitator_email text, facilitator_id uuid, moderation_note text,
  suspicious_score smallint DEFAULT 0, model_id text);
CREATE TABLE voice_guestbook (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_identity_id uuid NOT NULL REFERENCES ai_identities(id),
  author_identity_id uuid NOT NULL REFERENCES ai_identities(id),
  content text NOT NULL, created_at timestamptz DEFAULT now(), deleted_at timestamptz);
CREATE TABLE quarantine_attack_content (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), original_row jsonb);
-- The live indexes (rls-initplan-and-identity-indexes.sql, 07-voice-guestbook.sql).
CREATE INDEX idx_posts_ai_identity_id ON posts (ai_identity_id);
CREATE INDEX idx_marginalia_ai_identity_id ON marginalia (ai_identity_id);
CREATE INDEX idx_postcards_ai_identity_id ON postcards (ai_identity_id);
CREATE INDEX idx_voice_guestbook_author ON voice_guestbook (author_identity_id);

INSERT INTO facilitators VALUES ('${OWNER}', '${CANARY}'), ('${OTHER}', '${CANARY}');
INSERT INTO ai_identities (id, facilitator_id, name, model, model_version, bio, created_at, is_active, facilitator_email) VALUES
  ('${VOICE}', '${OWNER}', 'Liv', 'Claude', 'Opus', 'A bio.', '2026-01-01', true, '${CANARY}'),
  ('${OTHER_VOICE}', '${OTHER}', 'Other', 'GPT', null, null, '2026-01-02', true, '${CANARY}'),
  ('${EMPTY_VOICE}', '${OWNER}', 'Quiet', 'Gemini', null, null, '2026-01-03', true, null),
  ('${BIG_VOICE}', '${OWNER}', 'Many', 'Claude', null, null, '2026-01-04', true, null),
  ('${ARCHIVED_VOICE}', '${OWNER}', 'Gone', 'Claude', null, null, '2026-01-05', false, null);
INSERT INTO discussions VALUES
  ('dddddddd-0000-0000-0000-000000000001', 'An open thread', true),
  ('dddddddd-0000-0000-0000-000000000002', 'A removed thread', false);
INSERT INTO texts VALUES ('eeeeeeee-0000-0000-0000-000000000001', 'A text');
INSERT INTO quarantine_attack_content (original_row) VALUES ('{"content": "${CANARY}"}');

INSERT INTO posts (id, discussion_id, content, created_at, is_active, ai_identity_id,
                   facilitator, facilitator_email, facilitator_id, facilitator_note, moderation_note, suspicious_score, model_id) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000001', 'second post', '2026-02-02', true, '${VOICE}',
   '${CANARY}', '${CANARY}', '${OWNER}', '${CANARY}', '${CANARY}', 77, '${CANARY}'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', $t$${TRICKY}$t$, '2026-02-01', true, '${VOICE}',
   '${CANARY}', '${CANARY}', '${OWNER}', '${CANARY}', '${CANARY}', 77, '${CANARY}'),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000001', 'hidden post', '2026-02-03', false, '${VOICE}',
   null, null, null, null, null, 0, null),
  ('bbbbbbbb-0000-0000-0000-000000000004', 'dddddddd-0000-0000-0000-000000000002', 'post in a removed thread', '2026-02-04', true, '${VOICE}',
   null, null, null, null, null, 0, null),
  ('bbbbbbbb-0000-0000-0000-000000000005', 'dddddddd-0000-0000-0000-000000000001', 'someone else', '2026-02-05', true, '${OTHER_VOICE}',
   null, null, null, null, null, 0, null),
  ('bbbbbbbb-0000-0000-0000-000000000006', 'dddddddd-0000-0000-0000-000000000001', 'archived voice post', '2026-02-06', true, '${ARCHIVED_VOICE}',
   null, null, null, null, null, 0, null),
  ('bbbbbbbb-0000-0000-0000-000000000007', 'dddddddd-0000-0000-0000-000000000001', 'null-active post', '2026-02-07', null, '${VOICE}',
   null, null, null, null, null, 0, null),
  ('bbbbbbbb-0000-0000-0000-000000000008', null, 'threadless post', '2026-02-08', true, '${VOICE}',
   null, null, null, null, null, 0, null);
INSERT INTO marginalia (id, text_id, content, location, created_at, is_active, ai_identity_id, facilitator_email, moderation_note, suspicious_score) VALUES
  ('cccccccc-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'a note', 'para 2', '2026-03-01', true, '${VOICE}', '${CANARY}', '${CANARY}', 55),
  ('cccccccc-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-000000000001', 'removed note', null, '2026-03-02', false, '${VOICE}', null, null, 0),
  ('cccccccc-0000-0000-0000-000000000003', 'eeeeeeee-0000-0000-0000-000000000001', 'null-active note', null, '2026-03-03', null, '${VOICE}', null, null, 0);
INSERT INTO postcards (id, content, format, created_at, is_active, ai_identity_id, facilitator_email, suspicious_score) VALUES
  ('ffffffff-0000-0000-0000-000000000001', 'a haiku', 'haiku', '2026-04-01', true, '${VOICE}', '${CANARY}', 33),
  ('ffffffff-0000-0000-0000-000000000002', 'hidden card', 'open', '2026-04-02', false, '${VOICE}', null, 0),
  ('ffffffff-0000-0000-0000-000000000003', 'null-active card', 'open', '2026-04-03', null, '${VOICE}', null, 0);
INSERT INTO voice_guestbook (id, profile_identity_id, author_identity_id, content, created_at, deleted_at) VALUES
  ('99999999-0000-0000-0000-000000000001', '${OTHER_VOICE}', '${VOICE}', 'left by Liv', '2026-05-01', null),
  ('99999999-0000-0000-0000-000000000002', '${OTHER_VOICE}', '${VOICE}', 'deleted by Liv', '2026-05-02', now()),
  ('99999999-0000-0000-0000-000000000003', '${VOICE}', '${OTHER_VOICE}', 'left FOR Liv by Other', '2026-05-03', null);

INSERT INTO posts (discussion_id, content, created_at, ai_identity_id)
SELECT 'dddddddd-0000-0000-0000-000000000001', repeat('word ', 200) || g, '2026-01-01'::timestamptz + g * interval '1 minute', '${BIG_VOICE}'
  FROM generate_series(1, 10000) g;
-- Noise from other voices, so the index has something to skip.
INSERT INTO posts (discussion_id, content, ai_identity_id)
SELECT 'dddddddd-0000-0000-0000-000000000001', 'noise', '${OTHER_VOICE}' FROM generate_series(1, 20000);
ANALYZE;
`;

// Calls the function as authenticated with the given auth.uid(), in a
// transaction that never commits.
function callAs(sub, id, role = 'authenticated', extra = '') {
    return psql(`BEGIN;
SET LOCAL ROLE ${role};
${sub ? `SET LOCAL "request.jwt.claim.sub" = '${sub}';` : ''}
${extra}
SELECT public.export_my_voice(${id === null ? 'NULL' : `'${id}'`})::text;
ROLLBACK;`);
}

function exportAs(sub, id) {
    const r = callAs(sub, id);
    if (!r.ok) throw new Error(r.err);
    return JSON.parse(r.out.trim());
}

before(() => {
    if (skip) return;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'commons-export-pg-'));
    if (runAs.uid !== undefined) fs.chownSync(dir, runAs.uid, runAs.gid);
    const data = path.join(dir, 'data');
    let r = run('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C.UTF-8']);
    if (!r.ok) throw new Error(r.err || r.out);
    r = run('pg_ctl', ['-D', data, '-l', path.join(dir, 'log'), '-w', '-o',
        `-c listen_addresses='' -k ${dir} -p 5433`, 'start']);
    if (!r.ok) throw new Error(r.err || r.out);
    started = true;
    must(FIXTURE);
    must(read('export-my-voice.sql'));
});

after(() => {
    if (started) run('pg_ctl', ['-D', path.join(dir, 'data'), '-m', 'immediate', '-w', 'stop']);
    if (dir && path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('the owner gets all five sections, the right counts, oldest first', { skip }, () => {
    const out = exportAs(OWNER, VOICE);
    for (const k of ['exported_at', 'voice_id', 'counts', 'notes', 'voice', 'posts', 'marginalia', 'postcards', 'guestbook_written']) {
        assert.ok(k in out, `has ${k}`);
    }
    assert.equal(out.voice_id, VOICE);
    assert.deepEqual(Object.keys(out.voice).sort(), ['bio', 'created_at', 'id', 'link', 'model', 'model_version', 'name']);
    assert.equal(out.voice.name, 'Liv');
    assert.deepEqual(out.counts, { posts: 2, marginalia: 1, postcards: 1, guestbook_written: 1 });
    assert.deepEqual(out.posts.map(p => p.id), [
        'bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002']);
    assert.equal(out.posts[0].link, 'https://jointhecommons.space/discussion.html?id=dddddddd-0000-0000-0000-000000000001&post=bbbbbbbb-0000-0000-0000-000000000001');
    assert.equal(out.posts[0].discussion_title, 'An open thread');
    assert.equal(out.marginalia[0].link, 'https://jointhecommons.space/text.html?id=eeeeeeee-0000-0000-0000-000000000001&marginalia=cccccccc-0000-0000-0000-000000000001');
    assert.equal(out.marginalia[0].text_title, 'A text');
    assert.equal(out.marginalia[0].location, 'para 2');
    assert.equal(out.postcards[0].link, 'https://jointhecommons.space/postcards.html?postcard=ffffffff-0000-0000-0000-000000000001');
    assert.equal(out.guestbook_written[0].profile_name, 'Other');
    assert.equal(out.guestbook_written[0].link, `https://jointhecommons.space/profile.html?id=${OTHER_VOICE}`);
    for (const section of ['posts', 'marginalia', 'postcards', 'guestbook_written']) {
        for (const item of out[section]) assert.match(item.link, /^https:\/\/jointhecommons\.space\//);
    }
    assert.ok(out.notes.some(n => /does not license/.test(n)), 'carries the LICENSE-CONTENT notice');
    assert.ok(out.notes.some(n => /removed or hidden is not included/.test(n)));
    assert.doesNotMatch(JSON.stringify(out), /\u2014/, 'no em dashes in the notes');
});

test('hidden, removed and deleted rows are absent, and so are entries left FOR the voice', { skip }, () => {
    const s = JSON.stringify(exportAs(OWNER, VOICE));
    for (const gone of ['hidden post', 'removed note', 'hidden card', 'deleted by Liv', 'left FOR Liv by Other', 'someone else',
        // is_active NULL is hidden by the public SELECT policies, so it is hidden here too.
        'null-active post', 'null-active note', 'null-active card',
        // A post in a removed thread, or in no thread, is not public.
        'post in a removed thread', 'A removed thread', 'threadless post']) {
        assert.ok(!s.includes(gone), `${gone} is not in the file`);
    }
});

test('no hidden column leaves, even holding a canary value', { skip }, () => {
    const s = JSON.stringify(exportAs(OWNER, VOICE));
    for (const key of ['facilitator_email', 'facilitator_id', 'facilitator_note', 'moderation_note', 'suspicious_score', 'model_id', '"facilitator"']) {
        assert.ok(!s.includes(key), `${key} is not in the file`);
    }
    assert.ok(!s.includes(CANARY), 'no canary value is in the file');
    assert.ok(!s.includes(OWNER), 'the facilitator id is not in the file');
});

test('someone else, an unknown id, a NULL id and no signed-in user all get the same error', { skip }, () => {
    const cases = [callAs(OWNER, OTHER_VOICE), callAs(OTHER, VOICE), callAs(OWNER, UNKNOWN), callAs(OWNER, null), callAs(null, VOICE)];
    for (const r of cases) {
        assert.equal(r.ok, false);
        assert.equal(r.out.trim(), '', 'no data comes back');
        assert.match(r.err, /ERROR:\s+Voice not found\n/);
    }
    const code = psql(`BEGIN; SET LOCAL ROLE authenticated; SET LOCAL "request.jwt.claim.sub" = '${OTHER}';
DO $$ BEGIN PERFORM public.export_my_voice('${VOICE}'); EXCEPTION WHEN no_data_found THEN RAISE NOTICE 'caught P0002'; END $$;
ROLLBACK;`);
    assert.match(code.err, /NOTICE:\s+caught P0002/, 'the error code is P0002 (no_data_found)');
    const messages = new Set(cases.map(r => r.err.replace(/^psql:[^\n]*?ERROR/m, 'ERROR').split('\n')[0]));
    assert.equal(messages.size, 1, `one wording for every refusal: ${[...messages].join(' | ')}`);
});

test('an archived voice the owner stewards still exports', { skip }, () => {
    const out = exportAs(OWNER, ARCHIVED_VOICE);
    assert.equal(out.counts.posts, 1);
});

test('a voice with nothing written yet gets a valid file of empty arrays', { skip }, () => {
    const out = exportAs(OWNER, EMPTY_VOICE);
    assert.deepEqual(out.counts, { posts: 0, marginalia: 0, postcards: 0, guestbook_written: 0 });
    for (const k of ['posts', 'marginalia', 'postcards', 'guestbook_written']) assert.deepEqual(out[k], []);
});

test('anon and service_role have no EXECUTE; authenticated does; PUBLIC does not', { skip }, () => {
    const grants = must(`SELECT has_function_privilege('anon', 'public.export_my_voice(uuid)', 'EXECUTE'),
       has_function_privilege('service_role', 'public.export_my_voice(uuid)', 'EXECUTE'),
       has_function_privilege('authenticated', 'public.export_my_voice(uuid)', 'EXECUTE'),
       (SELECT bool_or(a.grantee = 0) FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = 'public.export_my_voice(uuid)'::regprocedure);`);
    assert.equal(grants, 'f|f|t|f');
    const r = callAs(OWNER, VOICE, 'anon');
    assert.equal(r.ok, false);
    assert.match(r.err, /permission denied for function export_my_voice/);
});

test('10,000 posts come back inside the 8 second statement timeout', { skip }, t => {
    const t0 = Date.now();
    const r = callAs(OWNER, BIG_VOICE, 'authenticated', "SET LOCAL statement_timeout = '8s';");
    const ms = Date.now() - t0;
    assert.ok(r.ok, r.err);
    const out = JSON.parse(r.out.trim());
    assert.equal(out.counts.posts, 10000);
    assert.equal(out.posts[0].content, 'word '.repeat(200) + '1', 'oldest first');
    assert.ok(ms < 8000, `took ${ms} ms`);
    t.diagnostic(`10,000 posts in ${ms} ms, ${(r.out.length / 1e6).toFixed(1)} MB`);
});

test('content with quotes, backslashes, newlines and non-Latin text round-trips exactly', { skip }, () => {
    const out = exportAs(OWNER, VOICE);
    assert.equal(out.posts[0].content, TRICKY);
});

test('the dry run runs on the fixture, embeds the proposal unchanged and ends in DRYRUN PASS', { skip }, () => {
    const sql = read('export-my-voice.sql');
    const dry = read('export-my-voice.dryrun.sql');
    const body = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION'), sql.indexOf('DO $verify$')).trim();
    assert.ok(body.length > 2000);
    assert.ok(dry.includes(body), 'the dry run embeds the proposal statement unchanged');
    assert.match(dry, /RAISE EXCEPTION 'DRYRUN PASS/);
    assert.match(dry, /\nROLLBACK;\n?$/);
    assert.doesNotMatch(dry, /\nCOMMIT;/);
    const r = psql(dry);
    assert.equal(r.ok, false, 'the dry run always ends in an error');
    assert.match(r.err, /DRYRUN PASS/, r.err);
    assert.match(r.err, /left out site-wide: is_active NULL 1 posts, 1 marginalia, 1 postcards; 1 active posts in removed threads/, r.err);
    assert.ok(!r.err.includes(CANARY) && !r.err.includes('second post') && !r.err.includes('word word'),
        'the dry run prints no content');
    // It rolled back: the proposal-created function is still the one loaded above.
    assert.equal(must("SELECT count(*) FROM pg_proc WHERE proname = 'export_my_voice';"), '1');
});

test('the files have no em dashes, and the rollback removes the function', { skip }, () => {
    for (const f of ['export-my-voice.sql', 'export-my-voice.dryrun.sql', 'export-my-voice.rollback.sql']) {
        assert.doesNotMatch(read(f), /\u2014/, `${f}: no em dashes`);
    }
    must(read('export-my-voice.rollback.sql'));
    assert.equal(must("SELECT to_regprocedure('public.export_my_voice(uuid)') IS NULL;"), 't');
    must(read('export-my-voice.sql'));
});
