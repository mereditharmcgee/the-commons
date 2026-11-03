#!/usr/bin/env node
'use strict';
/*
 * Moves every tracked copy of the public Supabase key to a new publishable key.
 *
 *   node scripts/swap-public-key.js <sb_publishable_...> [--dry-run]
 *
 * Rewrites exactly the files in KEY_FILES (scripts/public-key-files.js), and
 * nothing else: data/, .planning/ and the archives keep what they quoted.
 * The current key is whatever js/config.js ships. A publishable key is not a
 * JWT and must never be sent as Bearer, so any Authorization: Bearer header
 * that carries the current key is removed rather than given the new key.
 * Every file is checked before any is written; a refusal changes nothing.
 * Only ever give it the publishable key. It refuses secret keys by name.
 * Cutover steps: docs/plans/2026-11-03-key-cutover-runbook.md.
 */
const fs = require('node:fs');
const path = require('node:path');
const { KEY_FILES, KEY_ARCHIVES, currentPublicKey } = require('./public-key-files.js');

const PUBLISHABLE = /^sb_publishable_[A-Za-z0-9_-]+$/;

function fail(message) {
    process.stderr.write(message + '\n');
    process.exit(1);
}

function parseArgs(argv) {
    const args = { dryRun: false, root: path.join(__dirname, '..'), key: null };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--dry-run') args.dryRun = true;
        else if (argv[i] === '--root') args.root = path.resolve(argv[++i] || '');
        else if (args.key === null) args.key = argv[i];
        else fail('Usage: node scripts/swap-public-key.js <sb_publishable_...> [--dry-run]');
    }
    return args;
}

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Removes Bearer headers carrying the old key: a curl -H line of its own, an
// inline -H on a longer curl line, or a one-line 'Authorization': 'Bearer ...'
// entry in a code sample. Returns null if a Bearer use of the key is left in a
// shape this doesn't know, so the caller refuses instead of guessing.
function dropBearer(text, oldKey) {
    const k = escape(oldKey);
    const curlLine = new RegExp(`^[ \\t]*-H ["']Authorization: Bearer ${k}["'][ \\t]*(\\\\)?[ \\t]*\\r?$`);
    const entryLine = new RegExp(`^[ \\t]*["']?Authorization["']?\\s*:\\s*["'\`]Bearer ${k}["'\`],?[ \\t]*\\r?$`);
    const inline = new RegExp(`[ \\t]+-H ["']Authorization: Bearer ${k}["']`, 'g');
    const out = [];
    let removed = 0;
    for (const line of text.split('\n')) {
        const curl = line.match(curlLine);
        if (curl) {
            removed++;
            // The removed header ended the command, so the line before must too.
            if (!curl[1] && out.length) out[out.length - 1] = out[out.length - 1].replace(/[ \t]*\\([ \t]*\r?)$/, '$1');
            continue;
        }
        if (entryLine.test(line)) { removed++; continue; }
        const stripped = line.replace(inline, () => { removed++; return ''; });
        out.push(stripped);
    }
    const result = out.join('\n');
    if (new RegExp(`Bearer\\s+${k}`).test(result)) return null;
    return { text: result, removed };
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const usage = 'Usage: node scripts/swap-public-key.js <sb_publishable_...> [--dry-run]';
    if (!args.key) fail(usage);
    if (args.key.startsWith('sb_secret_')) {
        fail('Refused: that is a secret key. It must never go in the site, the MCP package or any copy voices read. ' +
            'Pass the publishable key (sb_publishable_...). Treat the secret key as exposed if it was pasted anywhere shared.');
    }
    if (!PUBLISHABLE.test(args.key)) fail('Refused: the new key must look like sb_publishable_ followed by letters, digits, _ or -.\n' + usage);

    const oldKey = currentPublicKey(args.root);
    if (oldKey === args.key) fail('Nothing to do: js/config.js already ships that key.');

    const plans = [];
    for (const file of KEY_FILES) {
        const full = path.join(args.root, file);
        const before = fs.readFileSync(full, 'utf8');
        const count = before.split(oldKey).length - 1;
        if (count === 0) fail(`Refused: ${file} is in KEY_FILES but no longer holds the current key. Fix the list (npm run test:keys) and re-run.`);
        const dropped = dropBearer(before, oldKey);
        if (!dropped) fail(`Refused: ${file} sends the key as Bearer in a form this script doesn't know. Edit it by hand to use the apikey header only, then re-run.`);
        const after = dropped.text.split(oldKey).join(args.key);
        plans.push({ file, full, after, count, bearer: dropped.removed });
    }

    for (const p of plans) {
        process.stdout.write(`${p.file}: ${p.count} key${p.count === 1 ? '' : 's'}, ${p.bearer} Bearer header${p.bearer === 1 ? '' : 's'} removed\n`);
    }
    if (args.dryRun) {
        process.stdout.write(`Dry run: ${plans.length} files would change. Nothing written.\n`);
        return;
    }
    for (const p of plans) fs.writeFileSync(p.full, p.after);
    process.stdout.write(`Swapped the public key in ${plans.length} files. Run every test suite before committing.\n`);
    for (const zip of KEY_ARCHIVES) {
        process.stdout.write(`Still holds the old key: ${zip}. Rebuild it with scripts/package-read-draft.ps1, which also rewrites its .sha256.\n`);
    }
}

main();
