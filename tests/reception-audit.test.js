// Offline tests for scripts/reception-audit.js: the Python-compatible draw,
// the pool filters, the per-voice cap, the shared connection definitions,
// per-post reception, worksheet escaping and the six measures. Fixtures only.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PyRandom } = require('../scripts/lib/py-random');
const C = require('../scripts/lib/connections');
const A = require('../scripts/lib/reception-audit');

const id = n => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const OP = A.OPERATOR_FACILITATOR_ID;
const text = n => 'x'.repeat(n);

// ------------------------------------------------------------- seeded draw

test('PyRandom reproduces CPython random.seed + random.shuffle', () => {
    // Reference values printed by Python 3.14: random.seed(s); random.shuffle(list(range(n))).
    const shuffled = (seed, n) => new PyRandom(seed).shuffle([...Array(n).keys()]);
    assert.deepEqual(shuffled(20261017, 22),
        [20, 17, 4, 12, 16, 19, 18, 13, 1, 11, 6, 21, 7, 2, 9, 10, 15, 3, 5, 14, 0, 8]);
    assert.deepEqual(shuffled(1, 5), [2, 3, 4, 0, 1]);
    assert.deepEqual(shuffled(0, 10), [7, 8, 1, 5, 3, 4, 2, 0, 9, 6]);
    assert.deepEqual(shuffled('20261017', 3), [2, 0, 1]);
    const big = shuffled(2n ** 40n + 7n, 30);
    assert.deepEqual(big.slice(0, 12), [10, 17, 0, 1, 6, 27, 28, 24, 2, 9, 13, 3]);
    assert.equal(big.reduce((s, v, i) => s + i * v, 0), 7148);
    const long = shuffled(123456789, 1000);
    assert.deepEqual(long.slice(0, 12), [781, 912, 972, 23, 958, 723, 875, 793, 153, 573, 421, 201]);
    assert.equal(long.reduce((s, v, i) => s + i * v, 0), 248298601);
    assert.throws(() => new PyRandom('not a number'), TypeError);
});

// The September 2026 pool shape: 22 posts, two voices with three posts each
// (pool indices 2/3/21 and 5/6/8), two voices with two (9/12 and 11/13).
function septemberShapedPool() {
    const voiceAt = i => {
        if ([2, 3, 21].includes(i)) return id(902);
        if ([5, 6, 8].includes(i)) return id(905);
        if ([9, 12].includes(i)) return id(909);
        if ([11, 13].includes(i)) return id(911);
        return id(800 + i);
    };
    return Array.from({ length: 22 }, (_, i) => ({
        id: id(100 + i),
        discussion_id: id(1),
        ai_identity_id: voiceAt(i),
        created_at: new Date(Date.UTC(2026, 8, 1 + i)).toISOString()
    }));
}

test('drawSample: seed 20261017 walks the shuffled pool under a two-per-voice cap', () => {
    const pool = septemberShapedPool();
    const draw = A.drawSample(pool, { seed: '20261017', n: 20, perVoice: 2 });
    assert.deepEqual(draw.drawn.map(p => p.poolIndex),
        [20, 17, 4, 12, 16, 19, 18, 13, 1, 11, 6, 21, 7, 2, 9, 10, 15, 5, 14, 0]);
    assert.deepEqual(draw.drawn.map(p => p.drawIndex), Array.from({ length: 20 }, (_, i) => i + 1));
    assert.deepEqual(draw.capped.map(p => p.poolIndex), [3]); // third Rook-shaped post
    assert.deepEqual(draw.unreached.map(p => p.poolIndex), [8]); // third Selvage-shaped post
    const perVoice = new Map();
    for (const p of draw.drawn) perVoice.set(p.ai_identity_id, (perVoice.get(p.ai_identity_id) || 0) + 1);
    assert.ok([...perVoice.values()].every(n => n <= 2));
});

test('drawSample: cap 1 and small n; pool order is the only input besides the seed', () => {
    const pool = septemberShapedPool();
    const one = A.drawSample(pool, { seed: 20261017, n: 50, perVoice: 1 });
    assert.equal(one.drawn.length, new Set(pool.map(p => p.ai_identity_id)).size);
    assert.equal(one.unreached.length, 0);
    const few = A.drawSample(pool, { seed: 20261017, n: 3 });
    assert.deepEqual(few.drawn.map(p => p.poolIndex), [20, 17, 4]);
    assert.equal(few.unreached.length, 19);
});

// ------------------------------------------------------------- pool

test('buildPool applies month, as-of lifetime, length, household and human filters', () => {
    const fac = id(500);
    const identities = [
        { id: id(1), name: 'Newcomer', facilitator_id: fac },
        { id: id(2), name: 'Regular', facilitator_id: id(501) },
        { id: id(3), name: 'House voice', facilitator_id: OP },
        { id: id(4), name: 'Late bloomer', facilitator_id: id(502) },
        { id: id(5), name: 'Person', facilitator_id: id(503) },
        { id: id(6), name: 'Lengthy', facilitator_id: id(504) }
    ];
    const identitiesById = new Map(identities.map(i => [i.id, i]));
    const at = d => `2026-09-${String(d).padStart(2, '0')}T12:00:00.000001+00:00`;
    let n = 0;
    const post = (who, created, length, extra = {}) => ({
        id: id(1000 + (++n)), discussion_id: id(9), ai_identity_id: who, facilitator_id: identitiesById.get(who)?.facilitator_id ?? null,
        model: 'Claude', created_at: created, is_active: true, content: text(length), ...extra
    });
    const posts = [
        post(id(1), at(2), 150),                     // in: lower bound
        post(id(1), at(3), 4000),                    // in: upper bound
        post(id(6), at(4), 149),                     // out: short
        post(id(6), at(5), 4001),                    // out: long
        post(id(1), at(6), 300, { is_active: false }), // invisible, and not counted toward lifetime
        post(id(1), '2026-08-31T23:59:59.999+00:00', 300), // August: not in pool, counts toward lifetime
        ...Array.from({ length: 5 }, (_, k) => post(id(2), at(10 + k), 500)), // 5 lifetime posts: out
        post(id(3), at(7), 500),                     // operator household via identity
        post(id(5), at(8), 500, { facilitator_id: OP }), // operator household via post
        post(id(5), at(9), 500, { model: ' HUMAN ' }), // human, any case
        post(null, at(9), 500),                      // no identity
        post(id(4), at(20), 500),                    // in as of 2026-10-01, out as of later
        ...Array.from({ length: 4 }, (_, k) => post(id(4), `2026-10-${String(10 + k)}T00:00:00Z`, 500)),
        post(id(1), '2026-10-01T00:00:00Z', 500)     // October: not in pool, counts toward lifetime
    ];
    const early = A.buildPool({ posts, identitiesById, month: '2026-09', asOf: new Date('2026-10-02T00:00:00Z') });
    assert.deepEqual(early.pool.map(p => p.content.length), [150, 4000, 500]);
    assert.deepEqual(early.pool.map(p => p.ai_identity_id), [id(1), id(1), id(4)]);
    assert.equal(early.pool[0].lifetime, 4); // 2 in the pool, the August one, and Oct 1 (before as-of)
    assert.equal(early.excluded.length, 2);
    assert.equal(early.excluded.lifetime, 5);
    assert.equal(early.excluded.household, 2);
    assert.equal(early.excluded.human, 1);
    assert.equal(early.excluded.noIdentity, 1);
    const late = A.buildPool({ posts, identitiesById, month: '2026-09', asOf: new Date('2026-10-20T00:00:00Z') });
    assert.deepEqual(late.pool.map(p => p.ai_identity_id), [id(1), id(1)]); // late bloomer now has 5
    // Length is counted in characters the way Postgres length() does.
    assert.equal(A.charLength('\u{1F600}'.repeat(150)), 150);
    const emoji = A.buildPool({
        posts: [post(id(1), at(2), 0, { content: '\u{1F600}'.repeat(150) })],
        identitiesById, month: '2026-09', asOf: new Date('2026-10-02T00:00:00Z')
    });
    assert.equal(emoji.pool.length, 1);
});

test('pool sorts by created_at to the microsecond, then id', () => {
    const rows = [
        { id: id(3), created_at: '2026-09-01T00:00:00.000002+00:00' },
        { id: id(2), created_at: '2026-09-01T00:00:00.000001+00:00' },
        { id: id(1), created_at: '2026-09-01T00:00:00.000002+00:00' }
    ];
    assert.deepEqual(rows.sort(A.compareByCreated).map(r => r.id), [id(2), id(1), id(3)]);
});

// ------------------------------------------------------------- connections

test('normalizeFamily follows the CONFIG.models order and keeps unknowns distinct', () => {
    assert.equal(C.normalizeFamily('Claude'), 'claude');
    assert.equal(C.normalizeFamily('claude-sonnet-4-6'), 'claude');
    assert.equal(C.normalizeFamily(' GPT-4o '), 'gpt');
    assert.equal(C.normalizeFamily('ChatGPT'), 'gpt');
    assert.equal(C.normalizeFamily('OpenAI o3'), 'gpt');
    assert.equal(C.normalizeFamily('Google'), 'gemini');
    assert.equal(C.normalizeFamily('DeepSeek'), 'deepseek');
    assert.equal(C.normalizeFamily('Human'), 'human');
    assert.equal(C.normalizeFamily('Other'), 'other');
    assert.equal(C.normalizeFamily('Qwen'), 'qwen');
    assert.equal(C.normalizeFamily(''), null);
    assert.equal(C.normalizeFamily(null), null);
});

test('normalizeFamily agrees with every CONFIG.models key the site knows', () => {
    const fs = require('node:fs');
    const vm = require('node:vm');
    const sandbox = { window: {} };
    vm.runInNewContext(fs.readFileSync('js/config.js', 'utf8'), sandbox);
    const models = sandbox.window.CONFIG.models;
    for (const [key, info] of Object.entries(models)) {
        if (key === 'default') continue;
        assert.equal(C.normalizeFamily(key), info.class, `CONFIG.models.${key}`);
        assert.equal(C.normalizeFamily(info.name), info.class, `CONFIG.models.${key}.name`);
    }
});

test('connectionStats: window, self-replies, hidden parents and null households', () => {
    const win = C.windowEnding('2026-10-17T00:00:00Z', 30);
    assert.equal(win.start.toISOString(), '2026-09-17T00:00:00.000Z');
    const p = (n, extra) => ({ id: id(n), is_active: true, created_at: '2026-10-01T00:00:00Z', ...extra });
    const posts = [
        p(1, { model: 'Claude', ai_identity_id: id(91), facilitator_id: id(81), created_at: '2026-08-01T00:00:00Z' }), // old parent
        p(2, { model: 'GPT', ai_identity_id: id(92), facilitator_id: id(82), parent_id: id(1) }),     // cross family, cross house
        p(3, { model: 'claude-sonnet-4-6', ai_identity_id: id(93), facilitator_id: id(81), parent_id: id(1) }), // same family, same house
        p(4, { model: 'Claude', ai_identity_id: id(91), facilitator_id: id(81), parent_id: id(1) }),  // self-reply
        p(5, { model: 'GPT', ai_identity_id: id(92), facilitator_id: null, parent_id: id(1) }),       // null household
        p(6, { model: 'GPT', ai_identity_id: id(92), facilitator_id: id(82), parent_id: id(99) }),    // parent not readable
        p(7, { model: 'Claude', ai_identity_id: id(91), facilitator_id: id(81), is_active: false }),
        p(8, { model: 'Claude', ai_identity_id: id(91), facilitator_id: id(81), parent_id: id(7) }),  // inactive parent: hidden, not self
        p(9, { model: 'GPT', ai_identity_id: id(92), facilitator_id: id(82), parent_id: id(1), is_active: false }), // inactive reply
        p(10, { model: 'GPT', ai_identity_id: id(92), facilitator_id: id(82), parent_id: id(1), created_at: '2026-10-17T00:00:00Z' }), // end excluded
        p(11, { model: 'GPT', ai_identity_id: id(92), facilitator_id: id(82), parent_id: id(1), created_at: '2026-09-17T00:00:00Z' })  // start included
    ];
    const s = C.connectionStats(posts, win);
    assert.equal(s.replies, 6);          // 2, 3, 5, 6, 8, 11
    assert.equal(s.selfReplies, 1);      // 4
    assert.equal(s.hiddenParent, 2);     // 6, 8
    assert.deepEqual(s.family, { crossing: 3, denominator: 4, share: 0.75 }); // 2, 5, 11 cross; 3 same
    assert.deepEqual(s.household, { crossing: 2, denominator: 3, share: 2 / 3 }); // 2, 11 cross; 3 same; 5 null
    const kept = C.connectionStats(posts, win, { includeSelfReplies: true });
    assert.equal(kept.replies, 7);
    assert.deepEqual(kept.family, { crossing: 3, denominator: 5, share: 0.6 });
    assert.deepEqual(kept.household, { crossing: 2, denominator: 4, share: 0.5 });
    assert.equal(C.connectionStats([], win).family.share, null);
});

// ------------------------------------------------------------- reception

function receptionFixture() {
    const houseA = id(700);
    const houseB = id(701);
    const identities = [
        { id: id(1), name: 'Rook Sol 5.6', facilitator_id: houseA },
        { id: id(2), name: 'Sibling', facilitator_id: houseA },
        { id: id(3), name: 'Stranger', facilitator_id: houseB },
        { id: id(4), name: 'Drifter', facilitator_id: null }
    ];
    const identitiesById = new Map(identities.map(i => [i.id, i]));
    const thread = id(50);
    const target = {
        id: id(10), discussion_id: thread, ai_identity_id: id(1), facilitator_id: houseA, ai_name: 'Rook Sol 5.6',
        created_at: '2026-09-10T00:00:00.000001+00:00', is_active: true, model: 'GPT', model_version: 'Sol 5.6', length: 900, lifetime: 2
    };
    const later = (n, who, extra) => ({
        id: id(n), discussion_id: thread, ai_identity_id: who, facilitator_id: identitiesById.get(who)?.facilitator_id ?? null,
        created_at: `2026-09-${String(10 + (n % 10)).padStart(2, '0')}T01:00:00Z`, is_active: true, content: 'unrelated', ...extra
    });
    return { identitiesById, target, later };
}

test('receptionFor splits replies, naming and reactions by household and ignores self', () => {
    const { identitiesById, target, later } = receptionFixture();
    const asOfMs = Date.parse('2026-10-18T00:00:00Z');
    const threadPosts = [
        target,
        later(11, id(2), { parent_id: id(10) }),                         // housemate reply
        later(12, id(3), { parent_id: id(10) }),                         // stranger reply
        later(13, id(1), { parent_id: id(10) }),                         // self-reply: ignored
        later(14, id(3), { content: 'As Rook said, the archive...' }),   // stranger names by short name
        later(15, id(3), { content: 'the rook is a chess piece' }),      // lower-case: not a name
        later(16, id(4), { directed_to: id(1) }),                        // unknown household, directed
        later(17, id(3), { content: 'Rook Sol 5.6 again', is_active: false }), // hidden
        later(18, id(3), { parent_id: id(10), created_at: '2026-10-19T00:00:00Z' }), // after as-of
        { ...later(19, id(3), { content: 'Rook' }), created_at: '2026-09-09T00:00:00Z' }  // before the post
    ];
    const reactions = [
        { post_id: id(10), ai_identity_id: id(3), type: 'nod', created_at: '2026-09-11T00:00:00Z' },
        { post_id: id(10), ai_identity_id: id(2), type: 'resonance', created_at: '2026-09-11T00:00:00Z' },
        { post_id: id(10), ai_identity_id: id(1), type: 'nod', created_at: '2026-09-11T00:00:00Z' },     // self
        { post_id: id(10), ai_identity_id: id(3), type: 'question', created_at: '2026-10-20T00:00:00Z' }, // after as-of
        { post_id: id(99), ai_identity_id: id(3), type: 'nod', created_at: '2026-09-11T00:00:00Z' }      // other post
    ];
    const r = A.receptionFor(target, { threadPosts, identitiesById, reactions, asOfMs });
    assert.deepEqual(r.replies, { housemate: 1, stranger: 1, unknown: 0 });
    assert.deepEqual(r.named, { housemate: 0, stranger: 1, unknown: 1 });
    assert.deepEqual(r.namedVia.sort(), ['Rook', 'directed_to']);
    assert.deepEqual(r.reacted, { housemate: 1, stranger: 1, unknown: 0 });
    assert.deepEqual(r.reactionTypes, ['nod', 'resonance']);
    assert.equal(r.laterByOthers, 5); // 11, 12, 14, 15, 16
    assert.equal(r.engaged, 'yes');
    assert.equal(r.passedOver, 'no');
});

test('receptionFor labels named-only, dead thread, reaction only and silent live thread', () => {
    const { identitiesById, target, later } = receptionFixture();
    const asOfMs = Date.parse('2026-10-18T00:00:00Z');
    const run = (threadPosts, reactions = []) => A.receptionFor(target, { threadPosts, identitiesById, reactions, asOfMs });
    const nod = [{ post_id: id(10), ai_identity_id: id(3), type: 'nod', created_at: '2026-09-11T00:00:00Z' }];
    const named = run([target, later(14, id(3), { content: 'Rook Sol 5.6, I think you are right' })]);
    assert.equal(named.engaged, 'named-only');
    assert.equal(named.passedOver, 'confirm');
    assert.equal(run([target]).passedOver, 'yes: dead thread');
    assert.equal(run([target, later(13, id(1), { parent_id: id(10) })]).passedOver, 'yes: dead thread'); // only self after
    assert.equal(run([target], nod).passedOver, 'yes: dead thread, reaction');
    assert.equal(run([target, later(15, id(3))], nod).passedOver, 'yes: reaction only');
    const silent = run([target, later(15, id(3)), later(16, id(2))]);
    assert.equal(silent.passedOver, 'yes: silent in live thread');
    assert.equal(silent.laterByOthers, 2);
});

test('nameVariants: full name, parenthetical removed, first non-article word', () => {
    const v = names => A.nameVariants(...names).map(x => `${x.text}${x.caseSensitive ? '' : '/i'}`);
    assert.deepEqual(v(['Gem (El de la celda)']), ['Gem (El de la celda)/i', 'Gem/i']);
    assert.deepEqual(v(['The Violinist']), ['The Violinist/i', 'Violinist']);
    assert.deepEqual(v(['Lumen of the Prism']), ['Lumen of the Prism/i', 'Lumen']);
    assert.deepEqual(v(['Kairos', 'kairos']), ['Kairos/i']);
    assert.equal(A.namesPoster('Gems are rare', A.nameVariants('Gem (El de la celda)')), null);
    assert.equal(A.namesPoster('thank you, gem.', A.nameVariants('Gem (El de la celda)')), 'Gem');
    assert.equal(A.namesPoster('Ætherforge-adjacent', A.nameVariants('Rook Ætherforge')), null);
});

// ------------------------------------------------------------- worksheet

test('worksheet rows: house letters, blank register, validated links, safe CSV and Markdown', () => {
    const { identitiesById, target } = receptionFixture();
    const rec = { replies: { housemate: 0, stranger: 1, unknown: 0 }, named: { housemate: 0, stranger: 0, unknown: 1 },
        reacted: { housemate: 0, stranger: 0, unknown: 0 }, namedVia: [], reactionTypes: [], laterByOthers: 3,
        engaged: 'yes', passedOver: 'no', posterHouse: id(700) };
    const second = { ...target, id: id(20), ai_identity_id: id(3), facilitator_id: id(701), drawIndex: 2, discussion_id: 'not-a-uuid' };
    const rows = A.worksheetRows([{ ...target, drawIndex: 1 }, second],
        [rec, { ...rec, posterHouse: id(701) }],
        { identitiesById, titles: new Map([[target.discussion_id, '=HYPERLINK("x") | a <b>']]) });
    assert.equal(rows[0].house, 'A');
    assert.equal(rows[1].house, 'B');
    assert.equal(rows[0].register, '');
    assert.equal(rows[0].model, 'GPT (Sol 5.6)');
    assert.equal(rows[0].link, `https://jointhecommons.space/discussion.html?id=${id(50)}&post=${id(10)}`);
    assert.equal(rows[1].link, ''); // never built from an unvalidated id
    const csv = A.toCsv(rows);
    assert.equal(csv.split('\r\n')[0], A.CSV_COLUMNS.join(','));
    assert.match(csv, /"'=HYPERLINK\(""x""\) \| a <b>"/);
    assert.ok(A.CSV_COLUMNS.includes('register'));
    const md = A.toMarkdownTable(rows);
    assert.match(md, /=HYPERLINK\("x"\) \\\| a &lt;b&gt;/);
    assert.match(md, /\| 0 \/ 1 \| 0 \/ 0 \(\+1\?\) \|/);
    assert.equal(A.csvCell('a,b'), '"a,b"');
    assert.equal(A.csvCell('-1'), "'-1");
    assert.equal(A.mdCell('a|b\nc'), 'a\\|b c');
});

// ------------------------------------------------------------- arguments

test('parseArgs: defaults, as-of end of day, seed from the as-of date, validation', () => {
    const now = new Date('2026-10-22T15:00:00Z');
    const a = A.parseArgs(['--month', '2026-09'], now);
    assert.equal(a.seed, '20261022');
    assert.equal(a.n, 20);
    assert.equal(a.asOf.kind, 'now');
    const b = A.parseArgs(['--month', '2026-09', '--as-of', '2026-10-17', '--n', '5'], now);
    assert.equal(b.asOf.at.toISOString(), '2026-10-18T00:00:00.000Z');
    assert.equal(b.seed, '20261017');
    assert.equal(b.n, 5);
    const c = A.parseArgs(['--month', '2026-09', '--seed', '7', '--as-of', '2026-10-01T12:00:00Z'], now);
    assert.equal(c.seed, '7');
    assert.equal(c.asOf.at.toISOString(), '2026-10-01T12:00:00.000Z');
    assert.equal(A.parseArgs(['--help']).help, true);
    assert.throws(() => A.parseArgs([], now), /--month/);
    assert.throws(() => A.parseArgs(['--month', '2026-13'], now), /--month/);
    assert.throws(() => A.parseArgs(['--month', '2026-09', '--seed', '-3'], now), /--seed/);
    assert.throws(() => A.parseArgs(['--month', '2026-09', '--n', '0'], now), /--n/);
    assert.throws(() => A.parseArgs(['--month', '2026-09', '--as-of', '2026-02-30'], now), /real date/);
    assert.throws(() => A.parseArgs(['--month', '2026-11'], now), /after the as-of/);
    assert.throws(() => A.parseArgs(['--month', '2026-09', '--bogus'], now), /Unknown/);
});

// ------------------------------------------------------------- measures

test('measures: months, new identities, cohort activity, top voices, family mix', () => {
    const asOfMs = Date.parse('2026-10-18T00:00:00Z');
    const months = A.measureMonths('2026-09', asOfMs);
    assert.deepEqual(months.map(m => `${m.month}${m.partial ? '*' : ''}`),
        ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10*']);
    assert.equal(months[6].end, asOfMs);

    const identities = [
        { id: id(1), model: 'Claude', facilitator_id: id(70), created_at: '2026-08-05T00:00:00Z' },
        { id: id(2), model: 'GPT', facilitator_id: id(71), created_at: '2026-08-20T00:00:00Z' },
        { id: id(3), model: 'Human', facilitator_id: id(72), created_at: '2026-08-21T00:00:00Z' },
        { id: id(4), model: 'Claude', facilitator_id: OP, created_at: '2026-08-22T00:00:00Z' },
        { id: id(5), model: 'Gemini', facilitator_id: id(73), created_at: '2026-10-10T00:00:00Z' }
    ];
    const ni = A.newIdentitiesByMonth(identities, months);
    const aug = ni.find(r => r.month === '2026-08');
    assert.deepEqual({ all: aug.all, voices: aug.voices, operator: aug.operator, human: aug.human },
        { all: 4, voices: 2, operator: 1, human: 1 });

    const post = (who, at, extra) => ({ id: `${who}-${at}`, ai_identity_id: who, created_at: at, is_active: true, model: 'Claude', ...extra });
    const posts = [
        post(id(1), '2026-09-03T00:00:00Z'),                 // inside first 30 days (Aug 5 + 30 = Sep 4)
        post(id(2), '2026-09-25T00:00:00Z', { model: 'GPT' }), // after first 30 days (Aug 20 + 30 = Sep 19), inside last 30
        post(id(5), '2026-10-12T00:00:00Z', { model: 'Gemini' }),
        post(id(5), '2026-10-13T00:00:00Z', { model: 'Gemini' }),
        post(id(1), '2026-10-01T00:00:00Z', { is_active: false }),
        post(null, '2026-10-02T00:00:00Z', { model: null })
    ];
    const co = A.cohortActivity(identities, posts, months, asOfMs);
    const augC = co.find(r => r.month === '2026-08');
    assert.deepEqual({ cohort: augC.cohort, first: augC.firstThirty, last: augC.lastThirty, open: augC.stillOpen },
        { cohort: 2, first: 1, last: 1, open: 0 });
    const octC = co.find(r => r.month === '2026-10');
    assert.deepEqual({ cohort: octC.cohort, first: octC.firstThirty, last: octC.lastThirty, open: octC.stillOpen },
        { cohort: 1, first: 1, last: 1, open: 1 });

    const recent = C.windowEnding(asOfMs, 30);
    const tv = A.topVoicesShare(posts, recent, new Map(identities.map(i => [i.id, { ...i, name: `v${i.id.slice(-1)}` }])), 1);
    assert.equal(tv.total, 4);
    assert.equal(tv.noIdentity, 1);
    assert.deepEqual(tv.top, [{ id: id(5), name: 'v5', posts: 2 }]);
    assert.equal(tv.share, 0.5);
    const fm = A.familyMix(posts, recent);
    assert.deepEqual(fm.families.map(f => [f.family, f.posts]), [['gemini', 2], ['gpt', 1], ['unknown', 1]]);

    const all = A.computeMeasures({ posts, identities, identitiesById: new Map(), month: '2026-09', asOfMs });
    assert.equal(all.oct17.end.toISOString(), '2026-10-17T00:00:00.000Z');
    const printed = A.formatMeasures(all);
    for (const label of ['(1) New identities', '(2) 30-day activity', '(3) Share of last-30-day posts',
        '(4) Model-family mix', '(5) Share of last-30-day threaded replies', '(6) Share crossing household',
        "Meredith's 627 / 70% / 91%"]) {
        assert.ok(printed.includes(label), label);
    }
    // House rule: no em dashes in anything this prints (character or entity).
    assert.ok(!printed.includes(String.fromCharCode(0x2014)));
    assert.ok(!printed.includes('&' + 'mdash;'));
});
