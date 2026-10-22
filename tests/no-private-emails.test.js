// Fails if any tracked (or new, not ignored) text file holds an email address
// outside a short allowlist.
// Run: node --test tests/no-private-emails.test.js (also part of npm run test:pages)
//
// Why: the repo is public, and privacy.html says personal data is not shared.
// Facilitators', survey respondents' and partner organisers' addresses belong
// in the admin contact queue and Meredith's inbox, never in notes, archives,
// SQL comments or fixtures. A 2026-10-22 sweep removed about two dozen of
// them; this keeps them from creeping back. Write "[email removed]", a role
// ("a facilitator"), or an address at a reserved example domain instead.
//
// The allowlist is deliberately short. Add to it only an address the project
// publishes on purpose (contact.html, privacy.html, tos.html) or a no-reply
// sender, never a person's own address.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');

// Exact addresses the project publishes or commits with on purpose.
const ALLOWED_ADDRESSES = new Set([
    'jointhecommons@proton.me', // the published contact (contact, privacy, tos, research, README)
    'noreply@anthropic.com',    // Co-Authored-By trailers in commit-message examples
]);

// Domains that can never deliver mail to a real person.
const ALLOWED_DOMAINS = [
    /(^|\.)example\.(com|org|net)$/,  // RFC 2606 documentation domains
    /\.(example|invalid|test)$/,      // RFC 2606 reserved top-level domains
    /^users\.noreply\.github\.com$/,  // GitHub no-reply commit addresses
];

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

function isAllowed(address) {
    const lower = address.toLowerCase();
    if (ALLOWED_ADDRESSES.has(lower)) return true;
    const domain = lower.slice(lower.lastIndexOf('@') + 1);
    return ALLOWED_DOMAINS.some(re => re.test(domain));
}

// Returns [{ line, address }] for every address in text that is not allowed.
function findPrivateEmails(text) {
    // HTML entities and URL-encoding for "@" would otherwise hide an address.
    const normalized = text.replace(/&#0*64;|&#x0*40;|&commat;|%40/gi, '@');
    const found = [];
    for (const m of normalized.matchAll(EMAIL)) {
        // https://user@host/ is URL userinfo (tests use it for redirect
        // spoofing), not a mailbox.
        if (normalized.slice(Math.max(0, m.index - 2), m.index) === '//') continue;
        if (isAllowed(m[0])) continue;
        const line = normalized.slice(0, m.index).split('\n').length;
        found.push({ line, address: m[0] });
    }
    return found;
}

// Hide most of the local part so a failure log does not repeat the address.
function mask(address) {
    const at = address.lastIndexOf('@');
    return address.slice(0, Math.min(2, at)) + '***' + address.slice(at);
}

function trackedFiles() {
    const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
        cwd: root, encoding: 'utf8', maxBuffer: 1 << 26,
    });
    return [...new Set(out.split('\0').filter(Boolean))].sort();
}

function isBinary(buf) {
    // Same heuristic git uses: a NUL byte in the first 8000 bytes.
    return buf.subarray(0, 8000).includes(0);
}

let files = null;
try { files = trackedFiles(); } catch { files = null; }

test('the scanner flags private addresses and passes allowed ones', () => {
    // Built at runtime so this file never holds a private-looking address.
    const personal = ['someone', 'gmail.com'].join('@');
    const encoded = ['someone', 'proton.me'].join('&#64;');
    assert.deepEqual(findPrivateEmails(`Reply to ${personal} today`).map(f => f.address), [personal]);
    assert.equal(findPrivateEmails(`x\ny ${encoded}`)[0].line, 2);
    for (const ok of [
        ['jointhecommons', 'proton.me'], ['JoinTheCommons', 'Proton.me'], ['noreply', 'anthropic.com'],
        ['private.person', 'example.com'], ['a', 'test.invalid'], ['b', 'commons.test'],
        ['12345+someone', 'users.noreply.github.com'],
    ]) {
        assert.deepEqual(findPrivateEmails(ok.join('@')), [], ok.join('@'));
    }
    assert.deepEqual(findPrivateEmails('https://' + ['evil', 'chatgpt.com'].join('@') + '/callback'), []);
    assert.equal(mask(personal), 'so***@gmail.com');
});

test('no tracked text file holds a private email address', { skip: files ? false : 'git is not available' }, () => {
    assert.ok(files.length > 100, `only ${files.length} files listed; is this the repo root?`);
    const hits = [];
    for (const file of files) {
        const abs = path.join(root, file);
        let buf;
        try { buf = fs.readFileSync(abs); } catch { continue; } // deleted in the working tree
        if (isBinary(buf)) continue;
        for (const { line, address } of findPrivateEmails(buf.toString('utf8'))) {
            hits.push(`${file}:${line} ${mask(address)}`);
        }
    }
    assert.deepEqual(hits, [],
        'Private email addresses found. Replace each with "[email removed]" or a role ' +
        '(and replace a private full name beside it with a role too). Only add to the ' +
        'allowlist in tests/no-private-emails.test.js for an address the project publishes ' +
        'on purpose.\n  ' + hits.join('\n  '));
});
