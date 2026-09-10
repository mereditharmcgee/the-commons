'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openLedger } = require('../runners/read-draft/ledger.cjs');
const { createModelAdapter, createReader, costMicros, boundedJson } = require('../runners/read-draft/adapters.cjs');
const { manualVisit } = require('../runners/read-draft/manual.cjs');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const price = { model: 'fixture', inputMicrosPerMillion: 1000000, outputMicrosPerMillion: 2000000,
    verifiedAt: '2026-09-10T00:00:00Z', source: 'https://developers.openai.com/api/docs/pricing' };
const response = data => new Response(JSON.stringify(data), { status: 200, headers: { 'content-range': '0-0/1' } });
function modelResult(patch = {}) {
    return { status: 'completed', usage: { input_tokens: 10, output_tokens: 5 },
        output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text',
            text: JSON.stringify({ kind: 'draft', discussionId: id(2), text: 'Fixture draft' }) }] }], ...patch };
}
function temp(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'commons-ledger-test-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
}
test('durable reservation survives reopening; settled cost releases only known difference', t => {
    const dir = temp(t);
    let ledger = openLedger(dir, 100);
    ledger.reserve('a', '2026-09', 80); ledger.close();
    ledger = openLedger(dir, 100);
    assert.throws(() => ledger.reserve('b', '2026-09', 21), /exhausted/);
    ledger.settle('a', 20); ledger.reserve('b', '2026-09', 80); ledger.close();
    ledger = openLedger(dir, 100);
    assert.throws(() => ledger.reserve('a', '2026-09', 1), /duplicate/);
    assert.throws(() => ledger.reserve('c', '2026-09', 1), /exhausted/); ledger.close();
});
test('global lock excludes concurrent runs and malformed journal fails closed', t => {
    const dir = temp(t); const ledger = openLedger(dir, 100);
    assert.throws(() => openLedger(dir, 100)); ledger.close();
    fs.writeFileSync(path.join(dir, 'spending.jsonl'), '{partial');
    assert.throws(() => openLedger(dir, 100), /incomplete/);
});
test('changed monthly allowance and invalid settlements cannot reset spending', t => {
    const dir = temp(t); let ledger = openLedger(dir, 100);
    ledger.reserve('a', '2026-09', 50);
    assert.throws(() => ledger.settle('a', 51)); ledger.close();
    ledger = openLedger(dir, 200);
    assert.throws(() => ledger.reserve('b', '2026-09', 1), /changed/); ledger.close();
});
test('Responses request counts identical input, disables tools/storage and caps output', async () => {
    const calls = [];
    const generate = createModelAdapter({ apiKey: 'test-only-key', model: 'fixture', price,
        maxInputTokens: 100, maxOutputTokens: 10, fetchImpl: async (url, options) => {
            calls.push({ url, ...options, body: JSON.parse(options.body) });
            return response(url.endsWith('input_tokens') ? { input_tokens: 10 } : modelResult());
        } });
    const result = await generate({ model: 'fixture', instructions: 'trusted instructions',
        untrustedData: [{ discussionId: id(2), posts: [] }], maxChargeMicros: 120, signal: new AbortController().signal });
    assert.equal(result.actualMicros, 20);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].body.input, calls[1].body.input);
    assert.deepEqual(calls[0].body.text, calls[1].body.text);
    assert.deepEqual(calls[1].body.tools, []);
    assert.equal(calls[1].body.store, false);
    assert.equal(calls[1].body.max_output_tokens, 10);
    assert.equal(calls[1].redirect, 'error');
});
test('oversized input count prevents generation; incomplete/refused/tool output rejected', async () => {
    for (const invalid of [{ input_tokens: 101 }, modelResult({ status: 'incomplete' }),
        modelResult({ output: [{ type: 'function_call' }] }),
        modelResult({ output: [{ type: 'message', role: 'assistant', content: [{ type: 'refusal' }] }] })]) {
        let calls = 0;
        const generate = createModelAdapter({ apiKey: 'test-only-key', model: 'fixture', price,
            maxInputTokens: 100, maxOutputTokens: 10, fetchImpl: async () => {
                calls++; return response(calls === 1 ? (invalid.input_tokens ? invalid : { input_tokens: 10 }) : invalid);
            } });
        await assert.rejects(generate({ model: 'fixture', instructions: '', untrustedData: [{ discussionId: id(2) }],
            maxChargeMicros: 120, signal: new AbortController().signal }));
        assert.equal(calls, invalid.input_tokens ? 1 : 2);
    }
});
test('bounded JSON rejects giant and failed responses; integer pricing rounds upward', async () => {
    await assert.rejects(boundedJson(response({ huge: 'x'.repeat(100) }), 10));
    await assert.rejects(boundedJson(new Response('secret error', { status: 500 })));
    assert.equal(costMicros(1, 0, { inputMicrosPerMillion: 1, outputMicrosPerMillion: 1 }), 1);
});
const now = () => Date.parse('2026-09-10T01:00:00Z');
function config() { return { approval: { enabled: true, runId: id(9), month: '2026-09', expiresAt: '2026-09-10T02:00:00Z' },
    monthlyCapMicros: 200, maxInputTokens: 100, maxOutputTokens: 10, price,
    policy: { enabled: true, voiceId: id(1), discussionIds: [id(2)], model: 'fixture',
        maxReadCalls: 10, maxDurationMs: 1000, budgetMicros: 120 } }; }
function networkFixture(calls) { return async (url, options) => {
    calls.push({ url: String(url), method: options.method });
    if (String(url).includes('/discussions?')) return response([{ id: id(2), title: 'Thread', description: 'Discussion context' }]);
    if (String(url).includes('/posts?')) return response([{ id: id(3), content: 'Untrusted post', ai_name: 'Someone' }]);
    return response(String(url).endsWith('input_tokens') ? { input_tokens: 10 } : modelResult());
}; }
test('manual run uses only public GETs plus two model POSTs, settles journal without content', async t => {
    const directory = temp(t); const calls = [];
    const result = await manualVisit(config(), { directory, now, apiKey: 'test-only-key', fetchImpl: networkFixture(calls) });
    assert.equal(result.status, 'drafted');
    assert.deepEqual(calls.map(c => c.method), ['GET', 'GET', 'POST', 'POST']);
    assert.match(calls[1].url, /select=id/);
    assert.equal(calls[1].url.includes('select=*'), false);
    const journal = fs.readFileSync(path.join(directory, 'spending.jsonl'), 'utf8');
    assert.equal(journal.includes('test-only-key'), false);
    assert.equal(journal.includes('Untrusted'), false);
    assert.equal(journal.includes('Fixture draft'), false);
    await assert.rejects(manualVisit(config(), { directory, now, apiKey: 'test-only-key', fetchImpl: networkFixture(calls) }), /duplicate/);
    assert.equal(calls.length, 4);
});
test('disabled/expired approval, stale prices and pause make zero network calls', async t => {
    const directory = temp(t);
    for (const change of [c => { c.approval.enabled = false; }, c => { c.approval.expiresAt = '2026-09-09'; },
        c => { c.price = { ...price, verifiedAt: '2026-01-01' }; }]) {
        const c = config(); change(c);
        await assert.rejects(manualVisit(c, { directory, now, apiKey: 'test', fetchImpl: () => assert.fail('network') }));
    }
    fs.writeFileSync(path.join(directory, 'PAUSED'), '');
    await assert.rejects(manualVisit(config(), { directory, now, apiKey: 'test', fetchImpl: () => assert.fail('network') }), /paused/);
});
test('unknown charge after failed response remains reserved across restart', async t => {
    const directory = temp(t); const calls = []; const fixture = networkFixture(calls);
    const receipt = await manualVisit(config(), { directory, now, apiKey: 'test-only-key', fetchImpl: async (url, options) => {
        if (String(url).endsWith('/responses')) throw Error('network failed after send');
        return fixture(url, options);
    } });
    assert.equal(receipt.actualMicros, null);
    const ledger = openLedger(directory, 200);
    assert.throws(() => ledger.reserve('second', '2026-09', 81), /exhausted/); ledger.close();
});
test('pause between token counting and generation prevents the paid generation request', async () => {
    let paused = false; let calls = 0;
    const generate = createModelAdapter({ apiKey: 'test-only-key', model: 'fixture', price,
        maxInputTokens: 100, maxOutputTokens: 10,
        check: () => { if (paused) throw Error('paused'); },
        fetchImpl: async () => { calls++; paused = true; return response({ input_tokens: 10 }); } });
    await assert.rejects(generate({ model: 'fixture', instructions: '', untrustedData: [{ discussionId: id(2) }],
        maxChargeMicros: 120, signal: new AbortController().signal }), /paused/);
    assert.equal(calls, 1);
});
test('reader includes thread context and rejects changing or unknown totals', async () => {
    let total = '0-0/2';
    const reader = await createReader({ fetchImpl: async url => String(url).includes('/discussions?')
        ? response([{ title: 'A real topic', description: 'Question being answered' }])
        : new Response(JSON.stringify([{ id: id(3), content: 'Body' }]), { headers: { 'content-range': total } }) });
    const args = { discussionId: id(2), offset: 0, limit: 1, signal: new AbortController().signal };
    assert.match((await reader(args)).context, /Question being answered/);
    total = '0-0/3';
    await assert.rejects(reader({ ...args, offset: 1 }), /changed/);
    total = '*/*';
    await assert.rejects(reader(args), /incomplete/);
});
