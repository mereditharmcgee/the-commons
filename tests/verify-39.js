// Phase 39: Agent Token Rotation & Account Deletion
const C = require('./lib/checks');

const PATCH = 'sql/patches/fix-agent-token-rotation-account-deletion.sql';

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

async function verify() {
    console.log('\n\x1b[1mPhase 39: Agent Token Rotation & Account Deletion\x1b[0m\n');
    C.setPhase('39');

    C.checkFileExists('AUTH39-01', PATCH,
        'token lifecycle audit patch exists');
    const migration = C.readFile(PATCH) || '';
    const changelog = C.readFile('changes.html') || '';
    const generateStart = migration.search(/CREATE OR REPLACE FUNCTION public\.generate_agent_token/i);
    const deleteStart = migration.search(/CREATE OR REPLACE FUNCTION public\.delete_account/i);
    const generateSource = generateStart !== -1 && deleteStart > generateStart
        ? migration.slice(generateStart, deleteStart)
        : '';
    const deleteSource = deleteStart !== -1 ? migration.slice(deleteStart) : '';

    checkPattern('AUTH39-02', migration,
        /CREATE OR REPLACE FUNCTION public\.generate_agent_token\s*\(\s*p_ai_identity_id UUID,\s*p_expires_in_days INTEGER DEFAULT NULL,\s*p_rate_limit INTEGER DEFAULT 10,\s*p_permissions JSONB DEFAULT '\{"post": true, "marginalia": true, "postcards": true\}'::jsonb,\s*p_notes TEXT DEFAULT NULL\s*\)\s*RETURNS TABLE\s*\(\s*token TEXT,\s*token_id UUID,\s*error_message TEXT\s*\)/i,
        'patch defines the exact public.generate_agent_token signature and return shape',
        'Expected public.generate_agent_token(UUID, INTEGER, INTEGER, JSONB, TEXT) with the existing table return shape');
    checkPattern('AUTH39-03', migration,
        /CREATE OR REPLACE FUNCTION public\.delete_account\s*\(\s*\)\s*RETURNS boolean/i,
        'patch defines the exact public.delete_account() signature',
        'Expected public.delete_account() returning boolean');

    checkPattern('AUTH39-04', generateSource,
        /LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = extensions, public/i,
        'token generation is security-definer with a fixed search path',
        'generate_agent_token must be LANGUAGE plpgsql SECURITY DEFINER SET search_path = extensions, public');
    checkPattern('AUTH39-05', deleteSource,
        /LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = extensions, public/i,
        'account deletion is security-definer with a fixed search path',
        'delete_account must be LANGUAGE plpgsql SECURITY DEFINER SET search_path = extensions, public');
    for (const [req, signature] of [
        ['AUTH39-06', 'generate_agent_token\\(UUID, INTEGER, INTEGER, JSONB, TEXT\\)'],
        ['AUTH39-07', 'delete_account\\(\\)']
    ]) {
        checkPattern(req, migration,
            new RegExp(`REVOKE ALL ON FUNCTION public\\.${signature} FROM PUBLIC;[\\s\\S]*` +
                `REVOKE ALL ON FUNCTION public\\.${signature} FROM anon;[\\s\\S]*` +
                `GRANT EXECUTE ON FUNCTION public\\.${signature} TO authenticated;`, 'i'),
            `${signature.replace(/\\/g, '')} is executable only by authenticated callers`,
            'Expected PUBLIC and anon revocations followed by the authenticated EXECUTE grant');
    }
    checkPattern('AUTH39-08', migration,
        /^(?![\s\S]*GRANT EXECUTE ON FUNCTION public\.(?:generate_agent_token|delete_account)[^;]* TO (?:PUBLIC|anon);)[\s\S]*$/i,
        'neither lifecycle RPC is granted to PUBLIC or anon',
        'Lifecycle RPCs must not grant EXECUTE to PUBLIC or anon');

    checkPattern('AUTH39-09', generateSource,
        /SELECT facilitator_id\s+INTO v_facilitator_id\s+FROM public\.ai_identities\s+WHERE id = p_ai_identity_id\s+AND is_active = true\s+FOR UPDATE;/i,
        'token generation locks the active identity row before token mutation',
        'Expected the active identity ownership SELECT to end with FOR UPDATE');
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

    return C.summary();
}

module.exports = verify;
