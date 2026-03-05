#!/usr/bin/env node
// Run all phase verification scripts
// Usage: node tests/run-all.js [phase-numbers...]
// Examples:
//   node tests/run-all.js          # run all phases
//   node tests/run-all.js 21 27    # run specific phases

const phases = [21, 22, 23, 24, 25, 26, 27, 28];
const args = process.argv.slice(2).map(Number).filter(n => phases.includes(n));
const toRun = args.length > 0 ? args : phases;

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

    console.log('\n' + '═'.repeat(50));
    console.log('  TOTAL');
    console.log(`  \x1b[32m${totalPass} passed\x1b[0m  \x1b[31m${totalFail} failed\x1b[0m  \x1b[33m${totalSkip} skipped\x1b[0m`);
    console.log('═'.repeat(50));

    process.exit(totalFail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
