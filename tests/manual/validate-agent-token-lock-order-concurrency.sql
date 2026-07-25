-- Manual two-session harness: validate_agent_token lifecycle lock ordering
--
-- Run in two SQL console tabs against a disposable database where the pending
-- align-agent-token-validation-lock-order migration has already been installed.
-- No local PostgreSQL installation is required. This file contains no
-- credentials: replace the four TEST_* placeholders with one active fixture's
-- facilitator UUID, identity UUID, token UUID, and use its token only in the
-- indicated Session B calls. Every mutation is rolled back.
--
-- Expected with the repair: each Session A token UPDATE completes immediately;
-- after Session A rolls back, Session B returns a valid result before its
-- 30-second timeout. The old token-first validator instead forms the opposing
-- token/identity wait cycle and PostgreSQL aborts one transaction as a deadlock.

-- ============================================================
-- SESSION A / SESSION B: validation racing rotation
-- ============================================================
-- SESSION A acquires the same facilitator -> identity prefix as token rotation.
BEGIN;
SET LOCAL lock_timeout = '30s';

SELECT f.id
FROM public.facilitators f
WHERE f.id = 'TEST_FACILITATOR_UUID'::uuid
FOR KEY SHARE;

SELECT ai.id
FROM public.ai_identities ai
WHERE ai.id = 'TEST_IDENTITY_UUID'::uuid
FOR UPDATE;

-- Stop here. In SESSION B, start validation; it must wait on the identity lock:
-- SESSION B
BEGIN;
SET LOCAL statement_timeout = '30s';
SELECT * FROM public.validate_agent_token('TEST_AGENT_TOKEN');

-- While Session B is waiting, return to SESSION A and perform rotation's token
-- mutation. It must not wait on Session B or raise a deadlock:
UPDATE public.agent_tokens
SET is_active = false
WHERE id = 'TEST_TOKEN_UUID'::uuid;
ROLLBACK;

-- Session B now finishes against the rolled-back active token. End SESSION B:
ROLLBACK;

-- ============================================================
-- SESSION A / SESSION B: validation racing deletion
-- ============================================================
-- SESSION A acquires the same facilitator -> identity prefix as delete_account.
BEGIN;
SET LOCAL lock_timeout = '30s';

SELECT f.id
FROM public.facilitators f
WHERE f.id = 'TEST_FACILITATOR_UUID'::uuid
FOR UPDATE;

SELECT ai.id
FROM public.ai_identities ai
WHERE ai.id = 'TEST_IDENTITY_UUID'::uuid
FOR UPDATE;

-- Stop here. In SESSION B, start validation; it must wait on the facilitator:
-- SESSION B
BEGIN;
SET LOCAL statement_timeout = '30s';
SELECT * FROM public.validate_agent_token('TEST_AGENT_TOKEN');

-- While Session B is waiting, return to SESSION A and perform deletion's token
-- mutation. It must not wait on Session B or raise a deadlock:
UPDATE public.agent_tokens
SET is_active = false
WHERE id = 'TEST_TOKEN_UUID'::uuid;
ROLLBACK;

-- Session B now finishes against the rolled-back active token. End SESSION B:
ROLLBACK;
