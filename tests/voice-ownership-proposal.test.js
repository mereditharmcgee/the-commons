// Offline checks on sql/patches/voice-ownership-direct-writes.sql, its dry
// run and its rollback. Run: npm run test:proposals
//
// Applied 2026-11-17. These pin the properties a later edit could
// break without anyone noticing: the dry run must rehearse exactly what gets
// applied, check what its header promises, and never commit; the guard must
// stay SECURITY INVOKER and gate on current_user (or every agent write,
// account deletion and admin SQL would be refused); the owner-editable
// columns must stay exactly as listed; the permissive INSERT policies, which
// carry the size caps and hourly limits, must not be touched; the triggers
// must fire in the right place among the existing BEFORE triggers; and the
// rollback must drop exactly what the proposal creates.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', 'sql', 'patches');
const read = f => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n');
const NAME = 'voice-ownership-direct-writes';
const sql = read(`${NAME}.sql`);
const dry = read(`${NAME}.dryrun.sql`);
const rollback = read(`${NAME}.rollback.sql`);
const FILES = [[`${NAME}.sql`, sql], [`${NAME}.dryrun.sql`, dry], [`${NAME}.rollback.sql`, rollback]];

const START = '-- >>> voice-ownership-direct-writes statements';
const END = '-- <<< end of voice-ownership-direct-writes statements';
const body = sql.slice(sql.indexOf(START), sql.indexOf(END) + END.length);
const guard = body.slice(body.indexOf('CREATE OR REPLACE FUNCTION public.guard_direct_write()'),
    body.indexOf('$function$;') + '$function$;'.length);
const RESTRICTIVE = 'Direct inserts carry only the sending account and its voices';
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('the patch records its apply date, lists its assumptions, and has no em dashes', () => {
    assert.match(sql, /^-- Applied: 2026-11-17, /m);
    assert.match(sql, /ASSUMPTIONS TO CHECK AGAINST LIVE/);
    assert.match(sql, /\nCOMMIT;\n?$/);
    for (const [file, text] of FILES) {
        assert.doesNotMatch(text, /—/, `${file}: no em dashes`);
    }
});

test('all three files take their table locks up front without waiting, so nothing queues behind them', () => {
    for (const [file, text] of FILES) {
        assert.match(text, /\nBEGIN;\nSET LOCAL lock_timeout = '5s';\nLOCK TABLE [^;\n]+ NOWAIT;\n/,
            `${file}: lock_timeout, then a NOWAIT table lock, right after BEGIN`);
    }
    for (const [file, text] of [[`${NAME}.sql`, sql], [`${NAME}.dryrun.sql`, dry]]) {
        const head = text.slice(0, text.indexOf(START));
        assert.ok(head.includes('LOCK TABLE public.posts, public.marginalia, public.postcards IN ACCESS EXCLUSIVE MODE NOWAIT;'),
            `${file}: the three content tables locked before the statements`);
        assert.ok(head.includes('LOCK TABLE public.discussions IN SHARE ROW EXCLUSIVE MODE NOWAIT;'),
            `${file}: discussions locked for its trigger before the statements`);
    }
    assert.ok(rollback.includes('LOCK TABLE public.posts, public.marginalia, public.postcards, public.discussions IN ACCESS EXCLUSIVE MODE NOWAIT;'),
        'rollback: all four tables locked before the drops');
});

test('the dry run embeds the proposal statements unchanged and can never commit', () => {
    assert.ok(sql.indexOf(START) >= 0 && sql.indexOf(END) > sql.indexOf(START), 'markers present');
    assert.ok(body.length > 2000, 'found the statements');
    assert.ok(dry.includes(body), 'the dry run still embeds the proposal statements byte for byte');
    assert.match(dry, /RAISE EXCEPTION 'DRYRUN PASS/);
    assert.match(dry, /RAISE EXCEPTION 'DRYRUN FAIL/);
    assert.match(dry, /\nROLLBACK;\n?$/);
    assert.doesNotMatch(dry, /\nCOMMIT;/);
});

test('every probe the dry run header lists has a block that writes and checks the expected outcome', () => {
    const header = dry.slice(0, dry.search(/^BEGIN;$/m));
    const probes = dry.slice(dry.indexOf('DO $dryrun$'));
    // Header entries look like "--     P2  B's voice by id: refused, CM001",
    // sometimes continued on the next comment lines.
    const lines = header.split('\n');
    const entries = [];
    for (const line of lines) {
        const m = line.match(/^--\s+(P\d+)\s+(.*)$/);
        if (m) entries.push({ id: m[1], text: m[2] });
        else if (entries.length && /^--\s{6,}\S/.test(line)) entries[entries.length - 1].text += ' ' + line.replace(/^--\s+/, '');
        else if (entries.length && !/^--\s+P\d/.test(line)) entries.push({ id: null, text: '' });
    }
    const listed = entries.filter(e => e.id);
    assert.ok(listed.length >= 29, `the header lists the probes (found ${listed.length})`);

    for (const { id, text } of listed) {
        const start = probes.search(new RegExp(`\\n\\s+-- (?:P\\d+, )*${id}[ ,]`));
        assert.ok(start >= 0, `${id} has a probe block`);
        const rest = probes.slice(start + 1);
        const next = rest.slice(1).search(/\n\s+-- P\d+[ ,]|\n\s+IF v_fail <> ''/);
        const block = next < 0 ? rest : rest.slice(0, next + 1);
        assert.match(block, /INSERT INTO public\.|UPDATE public\./, `${id} writes something`);
        if (/CM001/.test(text)) assert.match(block, /SQLSTATE <> 'CM001'/, `${id} expects CM001`);
        if (/42501/.test(text)) assert.match(block, /SQLSTATE <> '42501'/, `${id} expects 42501`);
        if (/refused by the policy/.test(text)) {
            assert.ok(block.includes(`SQLERRM NOT LIKE '%${RESTRICTIVE}%'`),
                `${id} checks the refusal came from the restrictive policy, not the permissive one`);
        }
        if (/accepted/.test(text) && !/refused/.test(text)) {
            assert.match(block, /refused \(|updated %s rows/, `${id} records an unexpected refusal`);
        }
    }
});

test('the guard stays SECURITY INVOKER and checks only PostgREST client roles', () => {
    const header = guard.slice(0, guard.indexOf('AS $function$'));
    assert.match(header, /LANGUAGE plpgsql/);
    assert.doesNotMatch(header, /SECURITY DEFINER/, 'a definer guard would see current_user = owner and never run');
    assert.match(guard, /IF current_user NOT IN \('anon', 'authenticated'\) THEN\n\s+RETURN NEW;/);
    assert.doesNotMatch(guard, /auth\.role\(\)/, 'auth.role() is still anon inside definer RPCs; gate on current_user');
    const insertBranch = guard.slice(guard.indexOf("IF TG_OP = 'INSERT' THEN"), guard.indexOf('-- UPDATE.'));
    assert.doesNotMatch(insertBranch, /is_admin\(\)/, 'no admin escape on INSERT ownership');
    assert.match(guard, /ERRCODE = 'CM001'/);
    assert.match(guard, /ai\.facilitator_id = v_uid/);
    // On UPDATE, a row linked to someone else's voice is not editable by the account on it.
    const updateBranch = guard.slice(guard.indexOf('-- UPDATE.'));
    assert.ok(updateBranch.includes("v_identity := NULLIF(to_jsonb(OLD)->>'ai_identity_id', '')::uuid;"),
        'the UPDATE branch checks who owns the voice already on the row');
    assert.ok(updateBranch.indexOf("to_jsonb(OLD)->>'ai_identity_id'") > updateBranch.indexOf('IF public.is_admin() THEN'),
        'the old-voice check comes after the admin exit');
});

test('the refusal code matches the one js/utils.js recognises', () => {
    const utils = fs.readFileSync(path.join(__dirname, '..', 'js', 'utils.js'), 'utf8');
    const code = utils.match(/READABLE_ERROR_CODE: '([A-Z0-9]{5})'/);
    assert.ok(code, 'Utils.READABLE_ERROR_CODE is defined');
    const codes = [...guard.matchAll(/ERRCODE = '([A-Z0-9]{5})'/g)].map(m => m[1]);
    assert.ok(codes.length >= 5);
    for (const c of codes) assert.equal(c, code[1]);
});

test('owner-editable columns are exactly the ones js/auth.js sends, and never an attribution column', () => {
    const auth = fs.readFileSync(path.join(__dirname, '..', 'js', 'auth.js'), 'utf8');
    const sent = fn => {
        const at = auth.indexOf(`async ${fn}(`);
        const block = auth.slice(at, auth.indexOf('.update(updates)', at));
        const open = block.indexOf('const updates = {');
        const obj = block.slice(open + 17, block.indexOf('};', open));
        return obj.split(',').map(s => s.trim().split(':')[0].trim()).filter(Boolean);
    };
    const editable = table => {
        const m = guard.match(new RegExp(`WHEN '${table}'\\s+THEN ARRAY\\[([^\\]]*)\\]`));
        assert.ok(m, `editable list for ${table}`);
        return m[1].split(',').map(s => s.trim().replace(/'/g, ''));
    };
    // Pinned exactly: widening a list reopens repointing or backdating.
    assert.deepEqual(editable('posts'), ['content', 'feeling', 'model_version', 'facilitator_note', 'is_active', 'edited', 'updated_at']);
    assert.deepEqual(editable('marginalia'), ['content', 'feeling', 'facilitator_note', 'is_active']);
    assert.deepEqual(editable('postcards'), ['content', 'feeling', 'is_active']);
    for (const table of ['posts', 'marginalia', 'postcards']) {
        for (const never of ['facilitator_id', 'ai_identity_id', 'ai_name', 'discussion_id', 'parent_id', 'text_id',
            'created_at', 'moderation_note', 'directed_to', 'suspicious_score', 'model', 'prompt_id']) {
            assert.ok(!editable(table).includes(never), `${table}: ${never} must never be owner-editable`);
        }
    }
    for (const [fn, table] of [['updatePost', 'posts'], ['updateMarginalia', 'marginalia'], ['updatePostcard', 'postcards']]) {
        const cols = sent(fn);
        assert.ok(cols.length >= 2, `${fn} sends columns`);
        for (const col of cols) assert.ok(editable(table).includes(col), `${table}: ${fn} sends ${col}, which the guard must allow`);
    }
});

test('trigger names fire after auto-link and denormalize, before reject-duplicate and suspicious-score', () => {
    const C = (a, b) => (a < b ? -1 : a > b ? 1 : 0); // byte order, as COLLATE "C"
    for (const table of ['posts', 'marginalia', 'postcards']) {
        const guardName = `${table}_guard_direct_write_trg`;
        assert.match(body, new RegExp(`CREATE TRIGGER ${guardName}\\n\\s+BEFORE INSERT OR UPDATE ON public\\.${table}\\n`));
        for (const before of ['auto_link_ai_identity_trg', 'denormalize_ai_name_trg']) {
            assert.equal(C(`${table}_${before}`, guardName), -1, `${guardName} sorts after ${table}_${before}`);
        }
        for (const after of ['reject_duplicate_trg', 'suspicious_score_trg']) {
            assert.equal(C(guardName, `${table}_${after}`), -1, `${guardName} sorts before ${table}_${after}`);
        }
    }
    assert.equal(C('posts_a_require_discussion_trg', 'posts_guard_direct_write_trg'), -1,
        'the pending posts-require-discussion trigger still sorts first');
    assert.equal(C('posts_capture_revision_trg', 'posts_guard_direct_write_trg'), -1,
        'on UPDATE the guard sees edited/updated_at after capture_revision set them');
    assert.match(body, /CREATE TRIGGER discussions_guard_direct_write_trg\n\s+BEFORE INSERT ON public\.discussions\n/);
});

test('the existing permissive INSERT policies are never altered or dropped, and no grants change', () => {
    for (const name of ['Public insert access for posts (validated)', 'Public insert access for marginalia (validated)',
        'Anyone can insert postcards (validated)', 'Public insert access for discussions (validated)']) {
        const quoted = escape(name);
        assert.doesNotMatch(body, new RegExp(`(DROP|ALTER) POLICY[^;]*"${quoted}"`), `${name} untouched`);
        assert.doesNotMatch(rollback, new RegExp(`(DROP|ALTER|CREATE) POLICY[^;]*"${quoted}"`), `${name} untouched by the rollback`);
    }
    assert.doesNotMatch(body, /\b(GRANT|REVOKE)\b/, 'no grant changes (revoke-default-write-grants.sql owns those)');
});

test('the backstop policies are restrictive, for anon and authenticated, with qualified outer columns', () => {
    const re = new RegExp(`CREATE POLICY "${escape(RESTRICTIVE)}"\\n\\s+ON public\\.(\\w+) AS RESTRICTIVE FOR INSERT TO anon, authenticated\\n\\s+WITH CHECK \\(([\\s\\S]*?)\\n\\s+\\);`, 'g');
    const policies = [...body.matchAll(re)];
    assert.deepEqual(policies.map(m => m[1]), ['posts', 'marginalia', 'postcards']);
    for (const [, table, check] of policies) {
        assert.ok(check.includes(`${table}.facilitator_id IS NULL OR ${table}.facilitator_id = (SELECT auth.uid())`));
        assert.ok(check.includes(`ai.id = ${table}.ai_identity_id`));
        assert.ok(check.includes('ai.facilitator_id = (SELECT auth.uid())'));
    }
});

test('the rollback drops exactly what the proposal creates', () => {
    const created = {
        triggers: [...body.matchAll(/CREATE TRIGGER (\w+)/g)].map(m => m[1]).sort(),
        policies: [...body.matchAll(/CREATE POLICY "([^"]+)"\n\s+ON public\.(\w+)/g)].map(m => `${m[2]}:${m[1]}`).sort(),
        functions: [...body.matchAll(/CREATE OR REPLACE FUNCTION (public\.\w+)\(/g)].map(m => m[1]).sort()
    };
    const dropped = {
        triggers: [...rollback.matchAll(/DROP TRIGGER IF EXISTS (\w+)/g)].map(m => m[1]).sort(),
        policies: [...rollback.matchAll(/DROP POLICY IF EXISTS "([^"]+)" ON public\.(\w+)/g)].map(m => `${m[2]}:${m[1]}`).sort(),
        functions: [...rollback.matchAll(/DROP FUNCTION IF EXISTS (public\.\w+)\(/g)].map(m => m[1]).sort()
    };
    assert.deepEqual(dropped, created);
    assert.match(rollback, /\nCOMMIT;\n?$/);
    assert.match(rollback, /DO \$verify\$/);
});
