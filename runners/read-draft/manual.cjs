'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { openLedger } = require('./ledger.cjs');
const { runVisit } = require('./runner.cjs');
const { createReader, createModelAdapter, costMicros } = require('./adapters.cjs');

async function manualVisit(config, { directory, apiKey, fetchImpl = fetch, now = () => Date.now() }) {
    // Configuration is an operator-owned approval record, never model-generated input.
    const c = structuredClone(config);
    const approved = c?.approval;
    const month = new Date(now()).toISOString().slice(0, 7);
    if (approved?.enabled !== true || !/^[0-9a-f-]{36}$/i.test(approved.runId || '') ||
        approved.month !== month || !Number.isFinite(Date.parse(approved.expiresAt)) ||
        Date.parse(approved.expiresAt) <= now() || Date.parse(approved.expiresAt) - now() > 86400000 ||
        c.price?.model !== c.policy?.model || !/^https:\/\/developers\.openai\.com\//.test(c.price?.source || '') ||
        !Number.isFinite(Date.parse(c.price?.verifiedAt)) || Date.parse(c.price.verifiedAt) > now() ||
        now() - Date.parse(c.price.verifiedAt) > 7 * 86400000) throw Error('approval_or_pricing_missing');
    const maximum = costMicros(c.maxInputTokens, c.maxOutputTokens, c.price);
    if (!Number.isSafeInteger(c.policy.budgetMicros) || maximum > c.policy.budgetMicros) throw Error('per_run_budget_exhausted');
    const check = () => {
        if (fs.existsSync(path.join(directory, 'PAUSED'))) throw Error('paused');
        if (new Date(now()).toISOString().slice(0, 7) !== month || now() >= Date.parse(approved.expiresAt)) throw Error('approval_expired');
    };
    check();
    const generate = createModelAdapter({ apiKey, model: c.policy.model, price: c.price,
        maxInputTokens: c.maxInputTokens, maxOutputTokens: c.maxOutputTokens, fetchImpl, check });
    const readPage = await createReader({ fetchImpl, check });
    const ledger = openLedger(directory, c.monthlyCapMicros);
    try {
        check();
        ledger.reserve(approved.runId, month, maximum);
        const receipt = await runVisit({ ...c.policy, modelReservationMicros: maximum }, {
            readPage, generate, isPaused: () => { try { check(); return false; } catch { return true; } }
        });
        // On ambiguity keep the full reservation. The journal never contains a draft,
        // source body, API key, or provider error text.
        if (receipt.actualMicros !== null) ledger.settle(approved.runId, receipt.actualMicros);
        else if (!receipt.modelCalls) ledger.settle(approved.runId, 0);
        return { ...receipt, approvalRunId: approved.runId, accounting: 'conservative token-rate estimate; not an invoice' };
    } finally { ledger.close(); }
}
module.exports = { manualVisit };

if (require.main === module) {
    const os = require('node:os');
    const directory = path.join(os.homedir(), '.commons-read-draft');
    if (process.argv.length !== 4 || process.argv[2] !== '--approved-config') {
        console.error('Disabled by default. Requires --approved-config <operator-owned JSON file>.');
        process.exitCode = 1;
    } else {
        Promise.resolve().then(() => JSON.parse(fs.readFileSync(process.argv[3], 'utf8')))
            .then(config => manualVisit(config, { directory, apiKey: process.env.OPENAI_API_KEY }))
            .then(receipt => console.log(JSON.stringify(receipt, null, 2)))
            .catch(() => { console.error('Visit stopped. Check approval, pricing, credentials, pause and spending journal; no automatic retry.'); process.exitCode = 1; });
    }
}
