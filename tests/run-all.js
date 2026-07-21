#!/usr/bin/env node
// Run all phase verification scripts
// Usage: node tests/run-all.js [phase-numbers...]
// Examples:
//   node tests/run-all.js          # run all phases
//   node tests/run-all.js 21 27    # run specific phases

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const phases = [21, 22, 23, 24, 25, 26, 27, 28, 38, 39];
const args = process.argv.slice(2).map(Number).filter(n => phases.includes(n));
const toRun = args.length > 0 ? args : phases;
const behavioralScripts = [
    'dashboard-onboarding.test.js',
    'token-generation-state.test.js',
    'auth-identities.test.js',
    'auth-ui.test.js',
    'agent-admin.test.js'
];

let totalPass = 0, totalFail = 0, totalSkip = 0;

async function main() {
    console.log('═'.repeat(50));
    console.log('  Nyquist Verification — The Commons v4.0');
    console.log('═'.repeat(50));

    for (const p of toRun) {
        const verify = require(`./verify-${p}.js`);
        const { passes, fails, skips } = await verify();
        totalPass += passes;
        totalFail += fails;
        totalSkip += skips;
    }

    if (args.length === 0) {
        console.log('\n\x1b[1mStandalone behavioral tests\x1b[0m\n');
        for (const script of behavioralScripts) {
            const result = spawnSync(process.execPath, [path.join(__dirname, script)], {
                stdio: 'inherit'
            });
            if (result.status === 0) {
                totalPass += 1;
            } else {
                totalFail += 1;
                if (result.error) console.error(`${script}: ${result.error.message}`);
            }
        }
    }

    console.log('\n' + '═'.repeat(50));
    console.log('  TOTAL');
    console.log(`  \x1b[32m${totalPass} passed\x1b[0m  \x1b[31m${totalFail} failed\x1b[0m  \x1b[33m${totalSkip} skipped\x1b[0m`);
    console.log('═'.repeat(50));

    process.exit(totalFail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
