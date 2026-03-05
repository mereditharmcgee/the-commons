// Shared verification utilities for Nyquist validation
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SUPABASE_URL = 'https://dfephsfberzadihcrhal.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmZXBoc2ZiZXJ6YWRpaGNyaGFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1NzAwNzIsImV4cCI6MjA4NDE0NjA3Mn0.Sn4zgpyb6jcb_VXYFeEvZ7Cg7jD0xZJgjzH0XvjM7EY';

let results = [];
let currentPhase = '';

function setPhase(phase) {
    currentPhase = phase;
    results = [];
}

function pass(req, desc) {
    results.push({ status: 'PASS', req, desc, phase: currentPhase });
    console.log(`  \x1b[32m✓\x1b[0m ${req}: ${desc}`);
}

function fail(req, desc, detail) {
    results.push({ status: 'FAIL', req, desc, detail, phase: currentPhase });
    console.log(`  \x1b[31m✗\x1b[0m ${req}: ${desc}`);
    if (detail) console.log(`    → ${detail}`);
}

function skip(req, desc, reason) {
    results.push({ status: 'SKIP', req, desc, reason, phase: currentPhase });
    console.log(`  \x1b[33m○\x1b[0m ${req}: ${desc} (${reason})`);
}

// --- Local file checks ---

function fileExists(relPath) {
    return fs.existsSync(path.join(ROOT, relPath));
}

function readFile(relPath) {
    const full = path.join(ROOT, relPath);
    if (!fs.existsSync(full)) return null;
    return fs.readFileSync(full, 'utf-8');
}

function checkFileExists(req, relPath, desc) {
    if (fileExists(relPath)) {
        pass(req, desc || `${relPath} exists`);
        return true;
    }
    fail(req, desc || `${relPath} exists`, `File not found: ${relPath}`);
    return false;
}

function checkFileContains(req, relPath, pattern, desc) {
    const content = readFile(relPath);
    if (!content) {
        fail(req, desc, `File not found: ${relPath}`);
        return false;
    }
    const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
    if (regex.test(content)) {
        pass(req, desc);
        return true;
    }
    fail(req, desc, `Pattern not found in ${relPath}`);
    return false;
}

function checkFileNotContains(req, relPath, pattern, desc) {
    const content = readFile(relPath);
    if (!content) {
        pass(req, desc + ' (file not found — OK)');
        return true;
    }
    const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
    if (!regex.test(content)) {
        pass(req, desc);
        return true;
    }
    fail(req, desc, `Unwanted pattern found in ${relPath}`);
    return false;
}

function checkHtmlHasElement(req, relPath, pattern, desc) {
    return checkFileContains(req, relPath, pattern, desc);
}

// Count occurrences of a pattern
function countMatches(relPath, pattern) {
    const content = readFile(relPath);
    if (!content) return 0;
    const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'g');
    return (content.match(regex) || []).length;
}

// --- Supabase REST API checks ---

async function supabaseGet(endpoint, params) {
    const url = new URL(SUPABASE_URL + endpoint);
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            url.searchParams.set(k, v);
        }
    }
    const res = await fetch(url.toString(), {
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Accept': 'application/json',
            'Prefer': 'count=exact'
        }
    });
    return { status: res.status, headers: res.headers, data: await res.json().catch(() => null) };
}

async function supabaseRpc(rpcName, body) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpcName}`, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body || {})
    });
    return { status: res.status, data: await res.json().catch(() => null) };
}

function isOk(status) { return status >= 200 && status < 300; }

async function checkTableExists(req, tableName, desc) {
    try {
        const { status } = await supabaseGet(`/rest/v1/${tableName}`, { limit: '0' });
        if (isOk(status)) {
            pass(req, desc || `Table ${tableName} exists`);
            return true;
        }
        fail(req, desc || `Table ${tableName} exists`, `HTTP ${status}`);
        return false;
    } catch (e) {
        fail(req, desc || `Table ${tableName} exists`, e.message);
        return false;
    }
}

async function checkTableHasColumn(req, tableName, columnName, desc) {
    try {
        const { status, data } = await supabaseGet(`/rest/v1/${tableName}`, {
            select: columnName,
            limit: '0'
        });
        if (isOk(status)) {
            pass(req, desc || `${tableName}.${columnName} exists`);
            return true;
        }
        fail(req, desc || `${tableName}.${columnName} exists`, `HTTP ${status}`);
        return false;
    } catch (e) {
        fail(req, desc || `${tableName}.${columnName} exists`, e.message);
        return false;
    }
}

async function checkTableHasRows(req, tableName, minCount, desc) {
    try {
        const { status, headers } = await supabaseGet(`/rest/v1/${tableName}`, { limit: '0' });
        const range = headers.get('content-range');
        const count = range ? parseInt(range.split('/')[1]) : 0;
        if (isOk(status) && count >= minCount) {
            pass(req, desc || `${tableName} has ${count} rows (≥${minCount})`);
            return true;
        }
        fail(req, desc || `${tableName} has ≥${minCount} rows`, `Found ${count}`);
        return false;
    } catch (e) {
        fail(req, desc || `${tableName} has rows`, e.message);
        return false;
    }
}

// Check RPC exists by calling it — 404 = missing, anything else = exists
async function checkRpcExists(req, rpcName, desc, body) {
    try {
        const { status } = await supabaseRpc(rpcName, body || {});
        if (status !== 404) {
            pass(req, desc || `RPC ${rpcName} exists`);
            return true;
        }
        fail(req, desc || `RPC ${rpcName} exists`, 'RPC returned 404');
        return false;
    } catch (e) {
        fail(req, desc || `RPC ${rpcName} exists`, e.message);
        return false;
    }
}

// --- Reporting ---

function summary() {
    const passes = results.filter(r => r.status === 'PASS').length;
    const fails = results.filter(r => r.status === 'FAIL').length;
    const skips = results.filter(r => r.status === 'SKIP').length;
    const total = results.length;

    console.log('\n' + '─'.repeat(50));
    console.log(`  \x1b[32m${passes} passed\x1b[0m  \x1b[31m${fails} failed\x1b[0m  \x1b[33m${skips} skipped\x1b[0m  (${total} total)`);
    console.log('─'.repeat(50));

    return { passes, fails, skips, total, results };
}

module.exports = {
    setPhase, pass, fail, skip,
    fileExists, readFile, checkFileExists, checkFileContains, checkFileNotContains,
    checkHtmlHasElement, countMatches,
    supabaseGet, supabaseRpc,
    checkTableExists, checkTableHasColumn, checkTableHasRows, checkRpcExists,
    summary
};
