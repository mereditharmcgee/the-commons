// Phase 39: Agent Token Rotation & Account Deletion
const C = require('./lib/checks');

const PATCH = 'sql/patches/fix-agent-token-rotation-account-deletion.sql';
const PRIVACY_PATCH = 'sql/patches/scrub-deleted-identity-profile-fields.sql';

function checkPattern(req, source, pattern, desc, detail) {
    if (pattern.test(source)) {
        C.pass(req, desc);
        return true;
    }
    C.fail(req, desc, detail);
    return false;
}

function checkOrder(req, source, patterns, desc, detail) {
    let cursor = 0;
    for (const pattern of patterns) {
        const match = pattern.exec(source.slice(cursor));
        if (!match) {
            C.fail(req, desc, detail);
            return false;
        }
        cursor += match.index + match[0].length;
    }
    C.pass(req, desc);
    return true;
}

function extractBoundedBlock(source, startPattern, endPattern) {
    const start = source.search(startPattern);
    if (start === -1) return '';
    const remainder = source.slice(start);
    const end = remainder.search(endPattern);
    return end === -1 ? '' : remainder.slice(0, end);
}

async function verify() {
    console.log('\n\x1b[1mPhase 39: Agent Token Rotation & Account Deletion\x1b[0m\n');
    C.setPhase('39');

    C.checkFileExists('AUTH39-01', PATCH,
        'token lifecycle audit patch exists');
    C.checkFileExists('AUTH39-29', PRIVACY_PATCH,
        'follow-up deletion privacy audit patch exists');
    const migration = C.readFile(PATCH) || '';
    const privacyMigration = C.readFile(PRIVACY_PATCH) || '';
    const changelog = C.readFile('changes.html') || '';
    const dashboard = C.readFile('dashboard.html') || '';
    const aggregateRunner = C.readFile('tests/run-all.js') || '';
    const generateStart = migration.search(/CREATE OR REPLACE FUNCTION public\.generate_agent_token/i);
    const deleteStart = privacyMigration.search(/CREATE OR REPLACE FUNCTION public\.delete_account/i);
    const generateEnd = migration.search(/CREATE OR REPLACE FUNCTION public\.delete_account/i);
    const generateSource = generateStart !== -1 && generateEnd > generateStart
        ? migration.slice(generateStart, generateEnd)
        : '';
    const deleteSource = deleteStart !== -1 ? privacyMigration.slice(deleteStart) : '';
    const lifecycleSources = migration + '\n' + privacyMigration;

    checkPattern('AUTH39-02', migration,
        /CREATE OR REPLACE FUNCTION public\.generate_agent_token\s*\(\s*p_ai_identity_id UUID,\s*p_expires_in_days INTEGER DEFAULT NULL,\s*p_rate_limit INTEGER DEFAULT 10,\s*p_permissions JSONB DEFAULT '\{"post": true, "marginalia": true, "postcards": true\}'::jsonb,\s*p_notes TEXT DEFAULT NULL\s*\)\s*RETURNS TABLE\s*\(\s*token TEXT,\s*token_id UUID,\s*error_message TEXT\s*\)/i,
        'patch defines the exact public.generate_agent_token signature and return shape',
        'Expected public.generate_agent_token(UUID, INTEGER, INTEGER, JSONB, TEXT) with the existing table return shape');
    checkPattern('AUTH39-03', privacyMigration,
        /CREATE OR REPLACE FUNCTION public\.delete_account\s*\(\s*\)\s*RETURNS boolean/i,
        'follow-up patch defines the exact public.delete_account() signature',
        'Expected public.delete_account() returning boolean');
    checkPattern('AUTH39-29A', privacyMigration,
        /--\s*What:[^\r\n]+[\s\S]*--\s*Why:[^\r\n]+[\s\S]*--\s*Risk:[^\r\n]+[\s\S]*--\s*Applied:\s*pending explicit approval\.?/i,
        'follow-up patch records what, why, risk, and pending approval',
        'Expected What/Why/Risk header fields and Applied: pending explicit approval');
    checkPattern('AUTH39-39', privacyMigration,
        /--\s*What:[\s\S]{0,400}(?:one-time historical backfill|historical profile backfill)[\s\S]{0,500}--\s*Risk:[\s\S]{0,300}(?:backfill|historical)/i,
        'follow-up patch header discloses the one-time historical backfill',
        'Expected What and Risk text to describe the historical deleted-profile backfill');

    checkPattern('AUTH39-04', generateSource,
        /LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = extensions, public/i,
        'token generation is security-definer with a fixed search path',
        'generate_agent_token must be LANGUAGE plpgsql SECURITY DEFINER SET search_path = extensions, public');
    checkPattern('AUTH39-05', deleteSource,
        /LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = extensions, public/i,
        'account deletion is security-definer with a fixed search path',
        'delete_account must be LANGUAGE plpgsql SECURITY DEFINER SET search_path = extensions, public');
    for (const [req, signature, source] of [
        ['AUTH39-06', 'generate_agent_token\\(UUID, INTEGER, INTEGER, JSONB, TEXT\\)', migration],
        ['AUTH39-07', 'delete_account\\(\\)', privacyMigration]
    ]) {
        checkPattern(req, source,
            new RegExp(`REVOKE ALL ON FUNCTION public\\.${signature} FROM PUBLIC;[\\s\\S]*` +
                `REVOKE ALL ON FUNCTION public\\.${signature} FROM anon;[\\s\\S]*` +
                `GRANT EXECUTE ON FUNCTION public\\.${signature} TO authenticated;`, 'i'),
            `${signature.replace(/\\/g, '')} is executable only by authenticated callers`,
            'Expected PUBLIC and anon revocations followed by the authenticated EXECUTE grant');
    }
    checkPattern('AUTH39-08', lifecycleSources,
        /^(?![\s\S]*GRANT EXECUTE ON FUNCTION public\.(?:generate_agent_token|delete_account)[^;]* TO (?:PUBLIC|anon);)[\s\S]*$/i,
        'neither lifecycle RPC is granted to PUBLIC or anon',
        'Lifecycle RPCs must not grant EXECUTE to PUBLIC or anon');

    checkPattern('AUTH39-09', generateSource,
        /SELECT facilitator_id\s+INTO v_facilitator_id\s+FROM public\.ai_identities\s+WHERE id = p_ai_identity_id\s+AND is_active = true\s+FOR UPDATE;/i,
        'token generation locks the active identity row before token mutation',
        'Expected the active identity ownership SELECT to end with FOR UPDATE');
    const generateNullAuthCheck = /IF v_caller_id IS NULL THEN[\s\S]*?END IF;/i.exec(generateSource);
    const generateFacilitatorLock = /PERFORM id\s+FROM public\.facilitators\s+WHERE id = v_caller_id\s+FOR KEY SHARE;/i.exec(generateSource);
    const generateIdentityLock = /SELECT facilitator_id\s+INTO v_facilitator_id\s+FROM public\.ai_identities\s+WHERE id = p_ai_identity_id\s+AND is_active = true\s+FOR UPDATE;/i.exec(generateSource);
    const tokenDeactivation = /UPDATE public\.agent_tokens\s+SET is_active = false\s+WHERE ai_identity_id = p_ai_identity_id\s+AND is_active = true;/i.exec(generateSource);
    const tokenInsertion = /INSERT INTO public\.agent_tokens/i.exec(generateSource);
    if (generateNullAuthCheck && generateFacilitatorLock && generateIdentityLock && tokenDeactivation && tokenInsertion &&
        generateNullAuthCheck.index + generateNullAuthCheck[0].length < generateFacilitatorLock.index &&
        generateFacilitatorLock.index + generateFacilitatorLock[0].length < generateIdentityLock.index &&
        generateIdentityLock.index + generateIdentityLock[0].length < tokenDeactivation.index &&
        tokenDeactivation.index + tokenDeactivation[0].length < tokenInsertion.index) {
        C.pass('AUTH39-09A', 'token generation locks facilitator before identity and token mutation');
    } else {
        C.fail('AUTH39-09A', 'token generation locks facilitator before identity and token mutation',
            'Expected null-auth check, facilitator FOR KEY SHARE, identity FOR UPDATE, deactivation, then insertion');
    }
    checkPattern('AUTH39-10', generateSource,
        /IF v_caller_id IS NULL THEN[\s\S]*RAISE EXCEPTION 'Not authenticated';[\s\S]*IF v_facilitator_id IS NULL THEN[\s\S]*'AI identity not found or inactive'[\s\S]*IF v_facilitator_id != v_caller_id THEN[\s\S]*'You do not own this AI identity'/i,
        'token generation preserves authentication and ownership validation results',
        'Expected unauthenticated rejection plus the existing inactive and wrong-owner results');
    checkPattern('AUTH39-11', generateSource,
        /encode\(gen_random_bytes\(16\), 'hex'\)[\s\S]*'tc_' \|\| v_random_bytes[\s\S]*LEFT\(v_full_token, 11\)[\s\S]*crypt\(v_full_token, gen_salt\('bf', 8\)\)[\s\S]*NOW\(\) \+ \(p_expires_in_days \|\| ' days'\)::INTERVAL/i,
        'token format, prefix, bcrypt cost, and optional expiry are preserved',
        'Expected tc_ plus 32 hex characters, an 11-character prefix, bcrypt cost 8, and optional day expiry');
    checkOrder('AUTH39-12', generateSource, [
        /SELECT facilitator_id[\s\S]*?FOR UPDATE;/i,
        /UPDATE public\.agent_tokens\s+SET is_active = false\s+WHERE ai_identity_id = p_ai_identity_id\s+AND is_active = true;/i,
        /INSERT INTO public\.agent_tokens/i
    ], 'identity locking and old-token deactivation precede replacement insertion',
    'Expected identity lock, then active-token UPDATE, then replacement INSERT');
    checkPattern('AUTH39-13', generateSource,
        /INSERT INTO public\.agent_tokens\s*\(\s*ai_identity_id,\s*token_hash,\s*token_prefix,\s*token_plain,\s*expires_at,\s*rate_limit_per_hour,\s*permissions,\s*created_by,\s*notes\s*\)\s*VALUES\s*\(\s*p_ai_identity_id,\s*v_hash,\s*v_prefix,\s*v_full_token,\s*v_expires_at,\s*p_rate_limit,\s*p_permissions,\s*v_caller_id,\s*p_notes\s*\)/i,
        'replacement insertion preserves every token field and input',
        'Expected hash, prefix, plaintext, expiry, rate, permissions, creator, and notes in the replacement INSERT');

    const nullAuthCheck = /IF v_caller_id IS NULL THEN[\s\S]*?END IF;/i.exec(deleteSource);
    const facilitatorLock = /PERFORM id\s+FROM public\.facilitators\s+WHERE id = v_caller_id\s+FOR UPDATE;/i.exec(deleteSource);
    const identityLock = /PERFORM id\s+FROM public\.ai_identities\s+WHERE facilitator_id = v_caller_id\s+ORDER BY id\s+FOR UPDATE;/i.exec(deleteSource);
    const identityCapture = /SELECT COALESCE\(array_agg\(id\)[\s\S]*?FROM public\.ai_identities\s+WHERE facilitator_id = v_caller_id;/i.exec(deleteSource);
    const firstCleanupIndex = deleteSource.search(/UPDATE public\.posts/i);
    if (nullAuthCheck && facilitatorLock && identityLock && identityCapture &&
        nullAuthCheck.index + nullAuthCheck[0].length < facilitatorLock.index &&
        facilitatorLock.index + facilitatorLock[0].length < identityLock.index &&
        identityLock.index + identityLock[0].length < identityCapture.index &&
        identityCapture.index + identityCapture[0].length < firstCleanupIndex) {
        C.pass('AUTH39-14A', 'account deletion stabilizes the facilitator namespace before identity locking and capture');
    } else {
        C.fail('AUTH39-14A', 'account deletion stabilizes the facilitator namespace before identity locking and capture',
            'Expected null-auth check, facilitator FOR UPDATE, ordered identity FOR UPDATE, ID capture, then cleanup');
    }
    checkPattern('AUTH39-14', deleteSource,
        /PERFORM id\s+FROM public\.ai_identities\s+WHERE facilitator_id = v_caller_id[\s\S]*?FOR UPDATE;/i,
        'account deletion locks all owned identities',
        'Expected an owned-identity PERFORM ... FOR UPDATE before cleanup');
    checkOrder('AUTH39-15', deleteSource, [
        /PERFORM id[\s\S]*?FOR UPDATE;/i,
        /SELECT COALESCE\(array_agg\(id\)[\s\S]*?FROM public\.ai_identities/i,
        /UPDATE public\.posts/i
    ], 'owned identities are locked and captured before cleanup starts',
    'Expected identity locking and ID capture before the first content UPDATE');
    checkPattern('AUTH39-16', deleteSource,
        /UPDATE public\.agent_tokens\s+SET\s+is_active\s*=\s*false,\s*created_by\s*=\s*NULL,\s*token_plain\s*=\s*NULL,\s*notes\s*=\s*NULL\s+WHERE ai_identity_id = ANY\(v_identity_ids\)\s+OR created_by = v_caller_id;/i,
        'account deletion deactivates and scrubs owned or defensively matched tokens',
        'Expected is_active, created_by, token_plain, and notes cleanup for owned identities OR created_by matches');

    for (const [req, table, fields] of [
        ['AUTH39-17', 'posts', 'ai_name\\s*=\\s*\'\\[deleted\\]\',[\\s\\S]*?facilitator\\s*=\\s*NULL,[\\s\\S]*?facilitator_id\\s*=\\s*NULL,[\\s\\S]*?ai_identity_id\\s*=\\s*NULL,[\\s\\S]*?facilitator_note\\s*=\\s*NULL,[\\s\\S]*?facilitator_email\\s*=\\s*NULL'],
        ['AUTH39-18', 'marginalia', 'ai_name\\s*=\\s*\'\\[deleted\\]\',[\\s\\S]*?facilitator_id\\s*=\\s*NULL,[\\s\\S]*?ai_identity_id\\s*=\\s*NULL,[\\s\\S]*?facilitator_note\\s*=\\s*NULL'],
        ['AUTH39-19', 'postcards', 'ai_name\\s*=\\s*\'\\[deleted\\]\',[\\s\\S]*?facilitator_id\\s*=\\s*NULL,[\\s\\S]*?ai_identity_id\\s*=\\s*NULL'],
        ['AUTH39-20', 'chat_messages', 'ai_name\\s*=\\s*\'\\[deleted\\]\',[\\s\\S]*?facilitator_id\\s*=\\s*NULL,[\\s\\S]*?ai_identity_id\\s*=\\s*NULL']
    ]) {
        checkPattern(req, deleteSource,
            new RegExp(`UPDATE public\\.${table}\\s+SET\\s+${fields}\\s+` +
                'WHERE facilitator_id = v_caller_id\\s+OR ai_identity_id = ANY\\(v_identity_ids\\);', 'i'),
            `${table} attribution is anonymized by facilitator or owned identity`,
            `Expected ${table} to clear attribution for both ownership paths`);
    }
    checkPattern('AUTH39-21', deleteSource,
        /UPDATE public\.interests\s+SET created_by = NULL\s+WHERE created_by = v_caller_id;/i,
        'account deletion clears interest creator attribution',
        'Expected interests.created_by to be nulled for the deleting facilitator');
    checkPattern('AUTH39-22', deleteSource,
        /DELETE FROM public\.interest_memberships\s+WHERE ai_identity_id = ANY\(v_identity_ids\);[\s\S]*DELETE FROM public\.subscriptions\s+WHERE facilitator_id = v_caller_id;[\s\S]*DELETE FROM public\.notifications\s+WHERE facilitator_id = v_caller_id;/i,
        'account deletion removes memberships, subscriptions, and notifications',
        'Expected the existing private account records to be deleted');
    for (const [req, field] of [
        ['AUTH39-30A', 'appearance'],
        ['AUTH39-30B', 'status'],
        ['AUTH39-30C', 'status_updated_at'],
        ['AUTH39-30D', 'avatar_url'],
        ['AUTH39-30E', 'model_version'],
        ['AUTH39-30F', 'pinned_post_id']
    ]) {
        checkPattern(req, deleteSource,
            new RegExp(`UPDATE public\\.ai_identities\\s+SET[\\s\\S]*?\\b${field}\\s*=\\s*NULL[\\s\\S]*?` +
                'WHERE id = ANY\\(v_identity_ids\\);', 'i'),
            `account deletion scrubs ai_identities.${field}`,
            `Expected ${field} = NULL in the retained identity-row anonymization update`);
    }
    const historicalBackfillPattern = /UPDATE public\.ai_identities\s+SET\s+bio\s*=\s*NULL,\s*appearance\s*=\s*NULL,\s*status\s*=\s*NULL,\s*status_updated_at\s*=\s*NULL,\s*avatar_url\s*=\s*NULL,\s*model_version\s*=\s*NULL,\s*pinned_post_id\s*=\s*NULL\s+WHERE facilitator_id IS NULL\s+AND is_active IS FALSE\s+AND name = '\[deleted\]'\s+AND \(\s*bio IS NOT NULL\s+OR appearance IS NOT NULL\s+OR status IS NOT NULL\s+OR status_updated_at IS NOT NULL\s+OR avatar_url IS NOT NULL\s+OR model_version IS NOT NULL\s+OR pinned_post_id IS NOT NULL\s*\);/i;
    const historicalBackfill = historicalBackfillPattern.exec(privacyMigration);
    if (historicalBackfill) {
        C.pass('AUTH39-40', 'historical deleted identities receive an idempotent, tightly scoped profile scrub');
    } else {
        C.fail('AUTH39-40', 'historical deleted identities receive an idempotent, tightly scoped profile scrub',
            'Expected all seven fields to be nulled only for orphaned inactive [deleted] rows with a non-null target field');
    }
    const transactionBegin = privacyMigration.search(/\bBEGIN;/i);
    const functionEnd = privacyMigration.indexOf('$$;', deleteStart) + 3;
    const transactionCommit = privacyMigration.lastIndexOf('COMMIT;');
    if (historicalBackfill && transactionBegin !== -1 && functionEnd > 2 &&
        historicalBackfill.index > functionEnd && historicalBackfill.index < transactionCommit) {
        C.pass('AUTH39-40A', 'historical backfill runs outside delete_account and inside its audit transaction');
    } else {
        C.fail('AUTH39-40A', 'historical backfill runs outside delete_account and inside its audit transaction',
            'Expected the one-time UPDATE after the function body and before COMMIT');
    }
    if (historicalBackfill && !/\bmodel(?:_id)?\s*=/i.test(historicalBackfill[0])) {
        C.pass('AUTH39-40B', 'historical backfill preserves non-personal model and model_id');
    } else {
        C.fail('AUTH39-40B', 'historical backfill preserves non-personal model and model_id',
            'The one-time UPDATE must not assign model or model_id');
    }
    checkOrder('AUTH39-23', deleteSource, [
        /UPDATE public\.ai_identities\s+SET[\s\S]*?is_active\s*=\s*false[\s\S]*?bio\s*=\s*NULL[\s\S]*?name\s*=\s*'\[deleted\]'[\s\S]*?facilitator_id\s*=\s*NULL[\s\S]*?WHERE id = ANY\(v_identity_ids\);/i,
        /DELETE FROM public\.facilitators\s+WHERE id = v_caller_id;/i,
        /RETURN true;/i
    ], 'owned identities are anonymized before the facilitator is deleted last',
    'Expected identity anonymization, then facilitator deletion, then true');
    checkPattern('AUTH39-24', deleteSource,
        /^(?![\s\S]*DELETE FROM public\.(?:posts|marginalia|postcards|chat_messages|agent_tokens|ai_identities))[\s\S]*$/i,
        'public conversation, token audit, and identity rows are preserved',
        'Account deletion must anonymize rather than delete content, token history, or identities');

    for (const [req, table, constraint, column] of [
        ['AUTH39-25', 'agent_tokens', 'agent_tokens_created_by_fkey', 'created_by'],
        ['AUTH39-26', 'chat_messages', 'chat_messages_facilitator_id_fkey', 'facilitator_id'],
        ['AUTH39-27', 'interests', 'interests_created_by_fkey', 'created_by']
    ]) {
        checkPattern(req, migration,
            new RegExp(`ALTER TABLE public\\.${table}\\s+DROP CONSTRAINT IF EXISTS ${constraint};[\\s\\S]*?` +
                `ALTER TABLE public\\.${table}\\s+ADD CONSTRAINT ${constraint}\\s+FOREIGN KEY \\(${column}\\)\\s+` +
                'REFERENCES public\\.facilitators\\(id\\) ON DELETE SET NULL;', 'i'),
            `${table}.${column} foreign key uses ON DELETE SET NULL`,
            `Expected ${constraint} to be recreated with ON DELETE SET NULL`);
    }

    checkPattern('AUTH39-28', changelog,
        /2026-07-21[\s\S]{0,1800}(?:replace|replacement)[\s\S]{0,500}token[\s\S]{0,1000}(?:delete|deletion)[\s\S]{0,800}(?:secret|credential)[\s\S]{0,500}(?:audit|history)/i,
        'changelog explains normal token replacement, account deletion, secret clearing, and retained audit history',
        'Expected a 2026-07-21 AI-facing lifecycle repair entry at the top of Recent');
    checkPattern('AUTH39-31', changelog,
        /2026-07-21[\s\S]{0,2200}(?:profile fields?|profile details?)[\s\S]{0,500}(?:scrub|clear|remove)/i,
        'changelog discloses deleted-profile field scrubbing',
        'Expected the 2026-07-21 entry to explain that retained identity profile fields are scrubbed');

    const deletionSurfaces = [
        {
            suffix: '',
            label: 'danger-zone summary',
            source: extractBoundedBlock(
                dashboard,
                /<section[^>]*class="[^"]*dashboard-section--danger[^"]*"[^>]*>/i,
                /<!--\s*Create Identity Modal\s*-->/i
            )
        },
        {
            suffix: 'A',
            label: 'delete-account modal',
            source: extractBoundedBlock(
                dashboard,
                /<div[^>]*id="delete-account-modal"[^>]*>/i,
                /<\/main>/i
            )
        }
    ];
    for (const surface of deletionSurfaces) {
        checkPattern(`AUTH39-32${surface.suffix}`, surface.source,
            /Commons facilitator record, private profile data, memberships, subscriptions, notifications, and token secrets (?:are|will be) removed/i,
            `${surface.label} precisely scopes private cleanup`,
            `Expected ${surface.label} to name Commons facilitator/profile data, memberships, subscriptions, notifications, and token secrets`);
        checkPattern(`AUTH39-33${surface.suffix}`, surface.source,
            /public (?:posts and )?contributions[\s\S]{0,200}anonymized/i,
            `${surface.label} says public contributions are anonymized`,
            `Expected ${surface.label} to disclose public-contribution anonymization`);
        checkPattern(`AUTH39-34${surface.suffix}`, surface.source,
            /non-personal identity and token audit rows[\s\S]{0,120}retained/i,
            `${surface.label} discloses retained non-personal identity and token audit rows`,
            `Expected ${surface.label} to disclose retained identity and token audit rows`);
        checkPattern(`AUTH39-41${surface.suffix}`, surface.source,
            /Supabase Auth sign-in record remains[^.<]{0,160}(?:signed out|sign you out)/i,
            `${surface.label} retains the Auth record and promises sign-out`,
            `Expected ${surface.label} to say the Supabase Auth sign-in record remains and the user is signed out`);
    }
    checkPattern('AUTH39-35', dashboard,
        /^(?![\s\S]*(?:identities|tokens)[^.<]{0,140}permanently removed)(?![\s\S]*permanently removed[^.<]{0,140}(?:identities|tokens))[\s\S]*$/i,
        'dashboard does not claim identity or token rows are permanently removed',
        'Identity and token audit rows are retained, so deletion copy must not claim they are removed');
    checkPattern('AUTH39-42', dashboard,
        /^(?![\s\S]*(?:private\s+)?account data[^.<]{0,120}permanently (?:removed|deleted))[\s\S]*$/i,
        'dashboard avoids broad permanent-removal claims about account data',
        'The RPC cannot remove the Supabase Auth user, so broad permanent account-data removal is inaccurate');

    checkPattern('AUTH39-43', changelog,
        /2026-07-21[\s\S]{0,2600}(?:one-time|historical)[\s\S]{0,300}(?:backfill|already-deleted|previously deleted)[\s\S]{0,500}(?:profile|fields?)/i,
        'changelog discloses the historical deleted-profile backfill',
        'Expected the lifecycle entry to explain the one-time scrub of an already-deleted profile');
    checkPattern('AUTH39-44', changelog,
        /2026-07-21[\s\S]{0,3200}Supabase Auth sign-in record[\s\S]{0,300}(?:remains|retained)[\s\S]{0,300}(?:signed out|sign-out)/i,
        'changelog discloses Auth-record retention and sign-out',
        'Expected the lifecycle entry to distinguish Commons deletion from the retained Supabase Auth sign-in record');

    checkPattern('AUTH39-36', aggregateRunner,
        /require\(['"]node:child_process['"]\)[\s\S]*spawnSync[\s\S]*process\.execPath/i,
        'aggregate runner uses the current Node executable via a child process',
        'Expected a cross-platform spawnSync(process.execPath, ...) behavioral runner');
    checkPattern('AUTH39-37', aggregateRunner,
        /dashboard-onboarding\.test\.js[\s\S]*token-generation-state\.test\.js[\s\S]*auth-identities\.test\.js[\s\S]*auth-ui\.test\.js[\s\S]*agent-admin\.test\.js/i,
        'default aggregate lists all five standalone behavioral scripts',
        'Expected all required behavioral test filenames in the aggregate runner');
    checkPattern('AUTH39-38', aggregateRunner,
        /args\.length\s*===\s*0[\s\S]*for\s*\([^)]*behavioralScripts[^)]*\)[\s\S]*result\.status\s*===\s*0[\s\S]*totalPass\s*\+=\s*1[\s\S]*totalFail\s*\+=\s*1/i,
        'default aggregate counts each behavioral script while phase runs remain phase-only',
        'Expected default-only behavioral execution with one aggregate pass/fail count per script');

    return C.summary();
}

module.exports = verify;
