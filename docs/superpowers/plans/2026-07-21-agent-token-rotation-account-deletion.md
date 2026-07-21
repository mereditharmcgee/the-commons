# Agent Token Rotation and Account Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan with a separate review gate.

**Goal:** Make current-token rotation succeed without violating the one-active-token invariant, and make account deletion succeed for token-bearing accounts without retaining facilitator attribution or revealable token material.

**Architecture:** Replace the two production RPCs in one transaction-safe migration. Both functions serialize on the owned `ai_identities` row: token generation deactivates the old token before inserting the replacement, relying on PostgreSQL transaction rollback to preserve the old token if insertion fails; account deletion locks every owned identity before scrubbing tokens and attribution. Three facilitator foreign keys become `ON DELETE SET NULL` as defense in depth while identity and token audit rows remain preserved.

**Tech Stack:** PostgreSQL/PL/pgSQL on Supabase, static Node contract checks, vanilla HTML changelog. Production has no staging database.

**Evidence:** The July 2026 disposable-account walkthrough reproduced (1) a partial-unique-index failure when `generate_agent_token` inserted a replacement while the previous token was still active and (2) `delete_account()` failing on `agent_tokens_created_by_fkey` after merely deactivating tokens.

## Constraints

- Preserve the partial unique index `agent_tokens_identity_active`; exactly one active token remains the supported model.
- Preserve token audit rows and `agent_activity`; do not delete token history.
- Never expose a service-role key, agent token, password, or disposable-account credential in the repository, reports, or logs.
- Both RPCs must be `SECURITY DEFINER` with a fixed `search_path`, schema-qualified application objects, and explicit EXECUTE revocation from `PUBLIC`/`anon` followed by the minimum authenticated grant.
- Rotation and deletion must lock the same identity row before mutating token state.
- The migration must be an auditable file in `sql/patches/` with what/why/risk/applied-date header.
- Applying the migration and pushing the branch are separate gates. This task prepares and reviews the migration; the controller applies only after review under Meredith's explicit database approval. Nothing pushes to `main` without a later deployment approval.

---

### Task 1: Repair the live token lifecycle invariants

**Files:**
- Create: `tests/verify-39.js`
- Modify: `tests/run-all.js`
- Create: `sql/patches/fix-agent-token-rotation-account-deletion.sql`
- Modify: `changes.html`

**Interfaces:**
- Replaces: `public.generate_agent_token(UUID, INTEGER, INTEGER, JSONB, TEXT)` with the same parameters and table return shape.
- Replaces: `public.delete_account()` returning boolean.
- Preserves: current token prefix/plaintext/hash generation, bcrypt cost 8, expiry/rate/permissions/notes inputs, validation behavior, audit rows, and authenticated dashboard callers.

- [ ] **Step 1: Add Phase 39 as a failing static contract test**

Create `tests/verify-39.js` using `tests/lib/checks.js`, export an async `verify()` function, and add phase `39` to `tests/run-all.js`.

The phase must fail before the migration exists and then verify all of these contracts:

1. The audit patch exists and defines both exact `public` RPC signatures.
2. Each RPC fixes its `search_path`; both revoke EXECUTE from `PUBLIC` and `anon`, and grant only `authenticated`.
3. `generate_agent_token` selects the active owned identity `FOR UPDATE` before token mutation.
4. Its `UPDATE public.agent_tokens SET is_active = false` occurs before its `INSERT INTO public.agent_tokens`, and the insertion still stores `token_plain`, hash, prefix, expiry, rate limit, permissions, creator, and notes.
5. `delete_account` locks all identities owned by `auth.uid()` before cleanup.
6. Token cleanup sets `is_active = false`, `created_by = NULL`, `token_plain = NULL`, and `notes = NULL` for both owned identities and any defensive `created_by = auth.uid()` match.
7. Account cleanup anonymizes chat attribution, nulls `interests.created_by`, preserves the existing post/marginalia/postcard anonymization, removes memberships/subscriptions/notifications, anonymizes identities, and deletes the facilitator last.
8. The `agent_tokens.created_by`, `chat_messages.facilitator_id`, and `interests.created_by` foreign keys are recreated with `ON DELETE SET NULL`.
9. `changes.html` contains a user-facing entry explaining that replacement tokens and account deletion now complete normally.

Run `node tests/run-all.js 39` and capture the expected red result caused by the missing patch/changelog contract. Do not weaken a check merely to make it pass.

- [ ] **Step 2: Write the auditable migration**

Create `sql/patches/fix-agent-token-rotation-account-deletion.sql` with this header information:

- What: serialize token rotation and account deletion; scrub token secrets/attribution; add three `ON DELETE SET NULL` safeguards.
- Why: the live replacement-token call collides with `agent_tokens_identity_active`, and account deletion is blocked by facilitator foreign keys.
- Risk: moderate, because foreign-key recreation briefly locks three tables and two security-definer RPCs are replaced; no rows are deleted beyond the existing account-deletion contract.
- Applied: `pending review` until the production call succeeds; then record `2026-07-21` and the application method.

Implement the migration in this order:

1. Drop and recreate `agent_tokens_created_by_fkey`, `chat_messages_facilitator_id_fkey`, and `interests_created_by_fkey` against `public.facilitators(id) ON DELETE SET NULL`. The referencing columns stay nullable.
2. Replace `public.generate_agent_token(...)` as `LANGUAGE plpgsql SECURITY DEFINER SET search_path = extensions, public`.
   - Store `auth.uid()` once and reject an unauthenticated caller.
   - Select the active identity's `facilitator_id` by ID `FOR UPDATE`; preserve the existing not-found/inactive and wrong-owner error results.
   - Generate `tc_` plus 32 hex characters, its 11-character prefix, bcrypt hash at cost 8, and optional expiry exactly as the current live function does.
   - Deactivate all active tokens for the identity, then insert the new active token and return it.
   - Do not add an exception handler that commits a deactivation: PostgreSQL must roll the whole RPC back if generation or insertion fails.
3. Replace `public.delete_account()` as `LANGUAGE plpgsql SECURITY DEFINER SET search_path = extensions, public`.
   - Reject `NULL auth.uid()`.
   - Lock all identities still owned by that user with `FOR UPDATE` before any cleanup. Use the same row lock as generation so concurrent rotation either finishes before the scrub or observes the deleted/inactive ownership afterward.
   - Anonymize posts, marginalia, postcards, and chat messages selected by either the facilitator ID or an owned AI identity ID; clear user attribution fields and set the AI display name to `[deleted]` where that column exists.
   - Scrub every token linked to an owned identity, plus any token whose `created_by` is the user: deactivate it and clear `created_by`, `token_plain`, and free-text `notes` while retaining hash/prefix/audit rows.
   - Null `interests.created_by`; delete owned identity memberships, facilitator subscriptions, and notifications.
   - Anonymize/deactivate owned identities and clear their facilitator IDs, then delete the facilitator record last and return true.
4. For both exact function signatures, `REVOKE ALL ... FROM PUBLIC`, `REVOKE ALL ... FROM anon`, and `GRANT EXECUTE ... TO authenticated`.

- [ ] **Step 3: Add the user-facing changelog entry**

At the top of `changes.html` Recent, add a dated entry addressed to AI voices. Explain that facilitators can now replace a current token without the old token blocking the new one, and can delete a token-bearing account without stale credential ownership preventing completion. Mention that retired token secrets and facilitator attribution are cleared while non-personal audit history is retained. Do not describe internal constraint names.

- [ ] **Step 4: Make Phase 39 green and run focused checks**

Run:

```bash
node tests/run-all.js 39
node tests/run-all.js
npx --no-install eslint tests/verify-39.js tests/run-all.js
git diff --check
rg -n "service_role|SUPABASE_SERVICE|tc_[0-9a-fA-F]{20,}" sql/patches/fix-agent-token-rotation-account-deletion.sql tests/verify-39.js changes.html
```

Expected: Phase 39 and the full suite pass; ESLint and diff checks are clean; the secret scan has no matches.

- [ ] **Step 5: Self-review, commit, and report**

Review the migration against the constraints and the current definitions in `sql/patches/031-token-reveal.sql` and `sql/patches/028-account-deletion.sql`. Confirm the replacement retains every intended field and account deletion still preserves public conversation content.

Commit only the four Task 1 files with message:

```text
fix(auth): repair token rotation and account deletion
```

Write `.superpowers/sdd/task-9-report.md` with the red/green evidence, exact commit, files changed, risk notes, and any uncertainty for the independent reviewer.

---

## Controller-only production verification after review

The controller, not the implementer, performs these steps after an independent reviewer returns both `SPEC: PASS` and `QUALITY: APPROVED`:

1. Apply the reviewed SQL once to Supabase project `dfephsfberzadihcrhal` using the configured Supabase connector/migration mechanism; do not use `db push` against unrelated historical migrations.
2. Run database diagnostics/advisors when the connector exposes them and inspect the application result for SQL errors.
3. Change the audit header from `pending review` to `Applied: 2026-07-21` with the actual method, commit that audit-only update, and rerun Phase 39/full checks.
4. With fresh credentials held only in the browser session, create an auto-confirmed disposable account, create an identity and first token, validate it, rotate it, prove the old token rejects and the new token validates, verify exactly one active token in the owner view, and delete the account successfully.
5. Confirm the walkthrough creates zero public posts, marginalia, postcards, reactions, follows, memberships, or subscriptions. Do not record credentials in notes or tool output.
6. Record non-secret outcomes in `.planning/IDENTITY-ONBOARDING-WALKTHROUGHS-2026-07.md` and `.superpowers/sdd/task-8-report.md`.
7. Run the complete branch verification and independent final review. Stop before push and ask Meredith separately for the production deployment approval.
