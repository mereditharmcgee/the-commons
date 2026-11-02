#!/usr/bin/env node
// Read-only inventory for dropping style-src 'unsafe-inline'
// (docs/plans/2026-11-02-csp-style-src.md). Changes no file.
//
// For each root page whose CSP still allows style-src 'unsafe-inline' it
// prints: <style> blocks, distinct style="" attribute values in the page,
// distinct style="" values in the js/ files the page loads (innerHTML
// templates), and the template values that interpolate data (${...}),
// which no hash can cover and must move to CSSOM or classes.
//
//   node scripts/csp-style-inventory.js            summary table
//   node scripts/csp-style-inventory.js --page about.html --hashes
//                                                  one page, with the
//                                                  'sha256-...' sources
//
// el.style.x = ... and el.style.cssText = ... are CSSOM and are NOT
// blocked by style-src, so they are not counted.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const onePage = args.includes('--page') ? args[args.indexOf('--page') + 1] : null;
const withHashes = args.includes('--hashes');

const read = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const sha = s => `'sha256-${crypto.createHash('sha256').update(s, 'utf8').digest('base64')}'`;
// Attribute values are hashed after HTML parsing, so decode the entities the
// pages actually use before hashing.
const decode = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function page(file) {
    const text = read(file).replace(/<!--[\s\S]*?-->/g, '');
    const meta = text.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i);
    const styleSrc = meta ? ((meta[1].split(';').map(s => s.trim()).find(s => s.startsWith('style-src')) || '')) : null;
    const blocks = [...text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]);
    const attrs = new Set([...text.matchAll(/\sstyle="([^"]*)"/gi)].map(m => decode(m[1])));
    const scripts = [...text.matchAll(/<script\b[^>]*\bsrc="(js\/[^"?]+)/gi)].map(m => m[1]);
    const jsStatic = new Set();
    const jsDynamic = [];
    for (const js of scripts) {
        if (!fs.existsSync(path.join(root, js))) continue;
        for (const m of read(js).matchAll(/style=\\?(["'])((?:(?!\1).)*)\1/g)) {
            if (m[2].includes('${')) jsDynamic.push(`${js}: ${m[2]}`);
            else jsStatic.add(m[2]);
        }
    }
    return { file, styleSrc, blocks, attrs, jsStatic, jsDynamic };
}

const files = onePage ? [onePage] : fs.readdirSync(root).filter(f => f.endsWith('.html')).sort();
const rows = files.map(page).filter(p => p.styleSrc !== null && (onePage || p.styleSrc.includes("'unsafe-inline'")));

if (!onePage) {
    let total = { blocks: 0, attrs: 0, js: 0, dyn: 0 };
    console.log('page'.padEnd(24), 'blocks', 'attrs', 'js-attrs', 'dynamic');
    for (const r of rows) {
        console.log(r.file.padEnd(24), String(r.blocks.length).padStart(6), String(r.attrs.size).padStart(5),
            String(r.jsStatic.size).padStart(8), String(r.jsDynamic.length).padStart(7));
        total.blocks += r.blocks.length; total.attrs += r.attrs.size; total.js += r.jsStatic.size; total.dyn += r.jsDynamic.length;
    }
    console.log(`${rows.length} pages still allow style-src 'unsafe-inline'.`,
        `Per-page distinct values summed: ${total.blocks} blocks, ${total.attrs} attrs, ${total.js} js attrs, ${total.dyn} dynamic.`);
    process.exit(0);
}

const r = rows[0];
if (!r) { console.error(`${onePage}: no CSP meta tag`); process.exit(1); }
console.log(`${r.file}\n  current: ${r.styleSrc}`);
if (r.jsDynamic.length) console.log('  dynamic (move to CSSOM or a class first):\n    ' + r.jsDynamic.join('\n    '));
if (withHashes) {
    const sources = [...r.blocks.map(sha)];
    const attrHashes = [...new Set([...r.attrs, ...r.jsStatic])].map(sha);
    const parts = ["style-src 'self'"];
    if (attrHashes.length) parts.push("'unsafe-hashes'");
    parts.push(...sources, ...attrHashes, 'https://fonts.googleapis.com');
    console.log(`  stage 1: ${parts.join(' ')}`);
    console.log(`  (${sources.length} block hashes, ${attrHashes.length} attribute hashes)`);
}
