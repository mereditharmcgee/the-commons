// Offline checks for the outside backup (scripts/backup/). The round trip
// against a real local PostgreSQL lives in tests/backup/roundtrip.sh; these
// checks need only node and git.
// Run: npm run test:backup
//
// Why each one exists:
// - The PowerShell script must run on Windows PowerShell 5.1, which has no
//   && or || between commands, no ternary, no ?? and no ?. , and reads a file
//   without a byte order mark as ANSI, so anything outside ASCII can garble.
//   pwsh was not available where this was written, so these are the guard.
// - The PowerShell script and its Bash twin must hand pg_dump and pg_dumpall
//   the same arguments: the round trip proves the Bash one, and parity is
//   what carries that proof over to the one Meredith runs.
// - The restore drill must use the restore flags the round trip proved.
// - A dump must never be committed: the repository is public.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const ps1 = read('scripts/backup/commons-backup.ps1');
const sh = read('scripts/backup/commons-backup.sh');
const roundtrip = read('tests/backup/roundtrip.sh');
const drill = read('docs/plans/2026-11-04-restore-drill.md');
const guide = read('docs/plans/2026-11-04-backup-setup-guide.md');

// PowerShell code with comments and string contents blanked out, so syntax
// checks only see code.
function psCodeOnly(src) {
    let out = '';
    let i = 0;
    while (i < src.length) {
        const two = src.slice(i, i + 2);
        if (two === '<#') {
            const end = src.indexOf('#>', i + 2);
            i = end === -1 ? src.length : end + 2;
            out += ' ';
        } else if (src[i] === '#') {
            while (i < src.length && src[i] !== '\n') i++;
        } else if (src[i] === "'") {
            i++;
            while (i < src.length && !(src[i] === "'" && src[i + 1] !== "'")) i += src[i] === "'" ? 2 : 1;
            i++;
            out += "''";
        } else if (src[i] === '"') {
            i++;
            while (i < src.length && src[i] !== '"') i += src[i] === '`' ? 2 : 1;
            i++;
            out += '""';
        } else {
            out += src[i++];
        }
    }
    return out;
}

function between(src, begin, end) {
    const a = src.indexOf(begin);
    const b = src.indexOf(end, a);
    assert.ok(a !== -1 && b !== -1, `markers ${begin} / ${end} not found`);
    return src.slice(a + begin.length, b);
}

const flags = text => [...new Set(text.match(/--[a-z][a-z-]*(=[A-Za-z0-9_.-]+)?/g) || [])]
    .filter(f => !f.startsWith('--file') && !f.startsWith('--exclude-schema'))
    .sort();

test('the PowerShell script is plain ASCII', () => {
    const bad = [...ps1].findIndex(ch => ch.charCodeAt(0) > 126 || (ch.charCodeAt(0) < 32 && !'\r\n\t'.includes(ch)));
    assert.equal(bad, -1, `non-ASCII character at offset ${bad}`);
});

test('the PowerShell script uses no syntax that Windows PowerShell 5.1 lacks', () => {
    const code = psCodeOnly(ps1);
    assert.doesNotMatch(code, /&&/, 'pipeline chain && is PowerShell 7 only');
    assert.doesNotMatch(code, /\|\|/, 'pipeline chain || is PowerShell 7 only');
    assert.doesNotMatch(code, /\?\?/, 'null-coalescing ?? is PowerShell 7 only');
    assert.doesNotMatch(code, /\?\./, 'null-conditional ?. is PowerShell 7 only');
    assert.doesNotMatch(code, /\s\?\s[^\n]*\s:\s/, 'the ternary operator is PowerShell 7 only');
    assert.doesNotMatch(code, /-Parallel\b|-AdditionalChildPath\b|-AsByteStream\b/i, 'PowerShell 7 only parameter');
    assert.doesNotMatch(code, /\bclean\s*\{/, 'clean blocks are PowerShell 7.3 only');
});

test('the connection string comes only from the environment and is never printed', () => {
    const params = between(ps1, 'param(', '\n)\n');
    assert.doesNotMatch(params, /url|conn|password|dsn|secret/i, 'no parameter may carry the connection string');
    assert.match(ps1, /\$env:COMMONS_BACKUP_DB_URL/);
    for (const line of ps1.split('\n')) {
        if (/Write-(Output|Host|Error|Warning|Verbose)|Console\]::(Error\.)?Write|Stop-Backup|Add-Content|throw/.test(line)) {
            assert.doesNotMatch(line, /\$url\b|PGPASSWORD|\$pgEnv|\$Matches\[3\]/, `prints a secret: ${line.trim()}`);
        }
    }
    assert.match(ps1, /\$url = \$null/, 'the script drops its copy of the string once parsed');
    // The secret goes to the tools as environment variables, never as arguments.
    assert.doesNotMatch(between(ps1, '# BEGIN pg_dump args', '# END pg_dump args'), /--dbname|-d\s|\$url/);
    assert.doesNotMatch(between(sh, '# BEGIN pg_dump args', '# END pg_dump args'), /--dbname|-d\s|\$url/);
    assert.match(sh, /unset COMMONS_BACKUP_DB_URL url/);
});

test('both scripts pass pg_dump and pg_dumpall the same arguments', () => {
    for (const tool of ['pg_dump', 'pg_dumpall']) {
        const a = flags(between(ps1, `# BEGIN ${tool} args`, `# END ${tool} args`));
        const b = flags(between(sh, `# BEGIN ${tool} args`, `# END ${tool} args`));
        assert.ok(a.length >= 3, `${tool}: too few flags found (${a})`);
        assert.deepEqual(a, b, `${tool} arguments differ`);
    }
    const psExcludes = ps1.match(/\$excludes = @\(([^)]*)\)/)[1].match(/'([^']+)'/g).map(s => s.slice(1, -1));
    const shExcludes = sh.match(/^excludes=\(([^)]*)\)/m)[1].trim().split(/\s+/);
    assert.deepEqual(psExcludes, shExcludes, 'the excluded schemas differ');
    assert.ok(!psExcludes.includes('auth'), 'auth must stay in the dump: it holds the sign-in accounts');
    const psCount = ps1.match(/\$countSql = "([^"]+)"/)[1];
    const shCount = sh.match(/count_sql="([^"]+)"/)[1];
    assert.equal(psCount, shCount, 'the row-count queries differ');
    for (const name of ['commons-database.dump', 'commons-roles.sql', 'commons-counts.tsv', 'commons-manifest.txt', 'commons-backup-', '.tar.age', 'backup-log.txt']) {
        assert.ok(ps1.includes(name) && sh.includes(name), `${name} is not used by both scripts`);
    }
});

test('both scripts clean up in every exit path and refuse a private key', () => {
    assert.match(ps1, /\} finally \{\s*\n\s*Remove-Item -LiteralPath \$work -Recurse -Force/);
    assert.match(sh, /trap cleanup EXIT/);
    assert.match(ps1, /AGE-SECRET-KEY/);
    assert.match(sh, /AGE-SECRET-KEY/);
});

test('the restore drill uses the restore commands the round trip proved', () => {
    const proved = roundtrip.split('\n').filter(l => /pg_restore --no-owner/.test(l))
        .map(l => flags(l.replace(/--use-list=\S+/, '--use-list')).filter(f => !f.startsWith('--dbname')).join(' '));
    assert.equal(proved.length, 4);
    const documented = drill.split('\n').filter(l => /^pg_restore --no-owner/.test(l.trim()))
        .map(l => flags(l.replace(/--use-list=\S+/, '--use-list')).filter(f => !f.startsWith('--dbname')).join(' '));
    for (const p of proved) assert.ok(documented.includes(p), `the drill lacks: pg_restore ${p}`);
    for (const stmt of ['ON TABLES', 'ON SEQUENCES', 'ON FUNCTIONS']) {
        assert.ok(drill.includes(`IN SCHEMA public REVOKE ALL ${stmt} FROM anon, authenticated, service_role`), `drill lacks the default-privileges step for ${stmt}`);
    }
    assert.match(drill, /dfephsfberzadihcrhal/, 'the drill must guard against the live project ref');
});

test('git ignores every file a backup or restore drill makes, and no tracked file', () => {
    const made = [
        'commons-backup-20261104-191755Z.tar.age', 'commons-backup-20261104-191755Z.tar.age.partial',
        'commons-database.dump', 'commons-roles.sql', 'commons-counts.tsv', 'commons-manifest.txt',
        'commons-backup.tar', 'copy.tar', 'auth-triggers.txt', 'backup-log.txt', 'live.sql.gz', 'x.pgdump',
        'backups/anything.txt', 'restore-drill/commons-roles.sql', 'docs/commons-database.dump',
        'scripts/backup/commons-backup-private-key.age', 'data/commons-backup.tar.gz',
    ];
    const out = execFileSync('git', ['check-ignore', '--no-index', ...made], { cwd: root, encoding: 'utf8' });
    assert.deepEqual(out.trim().split('\n').sort(), [...made].sort());

    for (const keep of ['scripts/backup/commons-backup.ps1', 'scripts/backup/commons-backup.sh',
        'tests/backup/roundtrip.sh', 'sql/patches/ip-rate-limit.sql', 'docs/plans/2026-11-04-restore-drill.md']) {
        let ignored = true;
        try { execFileSync('git', ['check-ignore', '--no-index', '-q', keep], { cwd: root }); } catch { ignored = false; }
        assert.equal(ignored, false, `${keep} must not be ignored`);
    }

    const gi = read('.gitignore');
    const section = gi.slice(gi.indexOf('# Database backups (scripts/backup/)'));
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gi-')), 'rules');
    fs.writeFileSync(tmp, section);
    const caught = execFileSync('git', ['ls-files', '-ci', `--exclude-from=${tmp}`], { cwd: root, encoding: 'utf8' }).trim();
    assert.equal(caught, '', `the backup rules would hide tracked files:\n${caught}`);
});

test('nothing runs the backup from GitHub Actions', () => {
    const dir = path.join(root, '.github', 'workflows');
    for (const f of fs.readdirSync(dir)) {
        assert.doesNotMatch(fs.readFileSync(path.join(dir, f), 'utf8'), /commons-backup|pg_dump/, `${f} runs a backup in public CI`);
    }
});

test('the backup files carry no em dashes or money figures', () => {
    const files = {
        'commons-backup.ps1': ps1, 'commons-backup.sh': sh, 'roundtrip.sh': roundtrip,
        'restore drill': drill, 'setup guide': guide,
    };
    for (const [name, text] of Object.entries(files)) {
        assert.doesNotMatch(text, /\u2014/, `${name} has an em dash`);
    }
    // Only the docs: in code, $1 is a regex group, not a price.
    for (const [name, text] of [['restore drill', drill], ['setup guide', guide]]) {
        assert.doesNotMatch(text, /[$\u00a3\u20ac]\s?\d|\b\d+(\.\d+)?\s?(USD|dollars)\b/i, `${name} has a money figure`);
    }
});
