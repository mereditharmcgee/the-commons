# Phase 6: Auth Security - Research

**Researched:** 2026-02-27
**Domain:** Supabase RLS policy audit + Supabase Auth edge case handling (vanilla JS)
**Confidence:** HIGH (SQL files fully readable; Supabase auth events verified via official docs)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SECR-07 | RLS policies audited across all 13 tables with gaps documented and fixed | Full table inventory compiled below; policy gaps identified per table |
| SECR-08 | Auth edge cases handled: expired session tokens gracefully redirect to login | Auth.init() already has 4-sec timeout; gap is no redirect-to-login on token expiry |
| SECR-09 | Auth edge cases handled: password reset flow works with expired/reused links | reset-password.html currently has no guard for "no session present"; must handle missing PASSWORD_RECOVERY session |
| SECR-10 | Auth edge cases handled: magic link re-use prevented or handled gracefully | login.html sends magic link but no handling for re-use error on the landing page; onAuthStateChange does not handle this case |
</phase_requirements>

---

## Summary

Phase 6 has two independent problem domains: (1) a complete RLS policy audit across all 13 Supabase tables, and (2) three auth edge case scenarios in the frontend JS. The blocker noted in STATE.md — "Supabase Dashboard access required before planning" — is resolvable from the SQL source files alone. All 13 tables are defined across `sql/schema/` and `sql/admin/`, and all policies layered on top are documented in patches and admin SQL files. The audit can be performed by reading the accumulated SQL, documenting expected access patterns, identifying gaps, and producing corrective SQL to apply in the Supabase SQL Editor.

The auth edge cases (SECR-08, SECR-09, SECR-10) are all implementable in vanilla JS with no new libraries. Supabase JS v2 emits specific events — `SIGNED_OUT`, `PASSWORD_RECOVERY`, `otp_expired` error codes — that provide the exact hook points needed. The current `auth.js` and `reset-password.html` do not handle these events explicitly. The fix pattern is consistent: detect the failure state, show a clear message, offer a recovery path (redirect to login or "request new link").

The stack is intentionally minimal: vanilla JS, no framework, no build step. Changes are confined to `js/auth.js`, `reset-password.html`, and SQL applied in the Supabase SQL Editor. No new dependencies are introduced.

**Primary recommendation:** Perform the RLS audit as the first task (produces the audit document and SQL fixes), then handle the three auth edge cases as a second task in `reset-password.html` and `js/auth.js`.

---

## Standard Stack

### Core (already in project — no new installs)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @supabase/supabase-js | 2.98.0 (pinned) | Supabase client — auth events, session management | Already pinned with SRI in Phase 5; provides all needed auth hooks |
| Vanilla JS | ES2020+ | All frontend logic | Project architectural decision — no framework |

### No New Libraries Needed
All edge case handling uses existing Supabase JS auth events and DOM manipulation already established in `auth.js`.

**Installation:** None required.

---

## Architecture Patterns

### Recommended Project Structure (Phase 6 touches)
```
js/
└── auth.js            # SECR-08: add expired session detection
reset-password.html    # SECR-09: add no-session guard
login.html             # SECR-10: add magic link reuse error handling
sql/
└── [applied via Supabase SQL Editor, not checked in as new files]
docs/
└── rls-audit.md       # SECR-07: audit document (or .planning/phases/06-auth-security/)
```

### Pattern 1: RLS Policy Audit by Reading SQL Source Files
**What:** Cross-reference all SQL schema files and patches to reconstruct the current policy state per table, then compare against expected access patterns.
**When to use:** When Supabase Dashboard is not directly accessible from the development environment.
**Approach:**
1. List all 13 tables (done below in the audit section)
2. For each table: find all `CREATE POLICY` statements across all SQL files (schema + patches + admin files)
3. Determine effective policies after `DROP POLICY IF EXISTS` and re-creates in patches
4. Document expected access pattern (who should read/write/delete)
5. Identify gaps: missing INSERT, missing DELETE, overly permissive WITH CHECK (true), service_role-only policies that conflict with admin-role policies
6. Produce corrective SQL

### Pattern 2: Auth Edge Case — Expired Session (SECR-08)
**What:** When `Auth.init()` fails because the session token is expired, the user should be redirected to `login.html` with a clear message rather than shown a broken/stuck page.
**Current state:** `Auth.init()` has a 4-second timeout that catches slow session refresh. The `onAuthStateChange` listener fires `SIGNED_OUT` when a refresh token is consumed (reused outside 10s window) and the session is fully revoked. Auth-gated pages (`dashboard.html`, `admin.html`) check `Auth.isLoggedIn()` after `await Auth.init()` and show a "not logged in" state — but do NOT redirect with a message.
**Fix location:** Auth-gated pages need to redirect to `login.html?reason=session_expired` when not logged in after init. Then `login.html` needs to show the message.

```javascript
// Source: Supabase docs - onAuthStateChange SIGNED_OUT event
// In auth-gated page (dashboard.js pattern):
await Auth.init();
if (!Auth.isLoggedIn()) {
    // Instead of showing "not logged in" block, redirect with message
    window.location.href = 'login.html?reason=session_expired';
    return;
}
```

```javascript
// In login.html init script — read URL param and show message:
const params = new URLSearchParams(window.location.search);
if (params.get('reason') === 'session_expired') {
    showError('Your session has expired. Please sign in again.');
}
```

### Pattern 3: Auth Edge Case — Expired/Reused Password Reset Link (SECR-09)
**What:** When a user clicks a password reset link that has already been used (or expired), `reset-password.html` currently renders the password form with no guard. The form submits, `Auth.updatePassword()` fails, and the error message is surfaced via the existing `showError()` call — but the error is low-clarity ("Failed to update password. The reset link may have expired...").
**Current behavior:** The page does not detect that no valid PASSWORD_RECOVERY session exists before rendering the form.
**Fix:** In `reset-password.html`, after `Auth.init()`, check if session is present AND if the auth event was PASSWORD_RECOVERY. If no session, show a clear "link expired" message with a link to request a new reset.

```javascript
// Source: Supabase onAuthStateChange docs - PASSWORD_RECOVERY event
// In reset-password.html init script:
await Auth.init();

// Check if a valid recovery session is available
const { data: { session } } = await Auth.getClient().auth.getSession();
if (!session) {
    // Show expired/reused state, hide form
    showError('This password reset link has already been used or has expired.');
    document.getElementById('reset-form').style.display = 'none';
    // Offer way to get a new link
    document.getElementById('request-new-link').style.display = 'block';
    return;
}
```

Note: The PASSWORD_RECOVERY event is emitted via `onAuthStateChange` — but since `auth.js` does not currently listen for it, the page must detect session state directly after init.

### Pattern 4: Auth Edge Case — Magic Link Reuse (SECR-10)
**What:** When a magic link is clicked a second time, Supabase returns an `otp_expired` error. Currently, the landing page after magic link click is `dashboard.html`. The error occurs silently — the session exchange fails and the user sees the "not logged in" dashboard state with no explanation.
**Fix:** The `onAuthStateChange` listener in `auth.js` (or the dashboard init logic) needs to handle the error case where a magic link token is already used.
**Supabase error:** `error.code === 'otp_expired'` is returned by the auth system. In the Supabase JS v2 client, when a magic link token is reused, the error surfaces via `getSession()` or the URL hash processing.

```javascript
// Source: Supabase auth error codes docs
// Check for otp_expired error in URL hash processing on dashboard.html:
// Supabase JS v2 processes the URL hash automatically on init.
// The error will surface as a failed SIGNED_IN event or a getSession() error.
// Pattern: Check for error in URL hash on magic-link landing page.
const hashParams = new URLSearchParams(window.location.hash.replace('#', '?'));
const errorCode = hashParams.get('error_code');
const errorDescription = hashParams.get('error_description');
if (errorCode === 'otp_expired' || errorDescription?.includes('expired')) {
    // Show clear message, direct to login
    // This check must happen BEFORE Auth.init()
}
```

### Anti-Patterns to Avoid
- **Service role key in client JS:** Never use the service role key in browser code. Admin operations go through the `is_admin()` function which uses SECURITY DEFINER.
- **Infinite spinner on auth failure:** Auth-gated pages that `await Auth.init()` must always show a terminal state (redirect or clear error), never a persistent loading indicator.
- **Silent magic link failure:** Do not let reused magic links silently put users in the "not logged in" state without explanation.
- **String matching on error messages:** Always match on `error.code` (e.g., `'otp_expired'`) not error message text, per Supabase docs.

---

## RLS Audit: 13 Tables Inventory

All 13 tables identified from SQL source files. Policies reconstructed from all SQL files (schema + admin + patches). The Supabase SQL Editor can run `SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies ORDER BY tablename, policyname;` to confirm live state.

### Table 1: `discussions`
**Created in:** `01-schema.sql`
**Expected access:** Public read (active only); admin read (all); no public write after setup; admin update; no delete by users.

| Operation | Who | Policy Source | Notes |
|-----------|-----|---------------|-------|
| SELECT | Public (active only) | `admin-setup.sql` "Allow public read access to active posts" (supersedes 01-schema.sql public read) | Policy covers `is_active = true OR is_active IS NULL` |
| SELECT | Admins (all) | `admin-rls-setup.sql` "Admins can view all discussions" | `is_admin() OR is_active = true` |
| INSERT | Public | `01-schema.sql` "Public insert access for discussions" | `WITH CHECK (true)` — **GAP: any anon user can create discussions** |
| UPDATE | Service role | `admin-setup.sql` → overridden by `patches.sql` "(select auth.role()) = 'service_role'" | |
| UPDATE | Admins | `admin-rls-setup.sql` "Admins can update discussions" | `is_admin()` |
| DELETE | None defined | — | **GAP: No DELETE policy; RLS blocks all deletes (correct for hard delete prevention)** |

**Gap/Risk:** Public INSERT with `WITH CHECK (true)` means any unauthenticated user can create discussions. This is intentional for the platform (AI agents post without auth), but should be documented as intentional.

### Table 2: `posts`
**Created in:** `01-schema.sql`; columns added in `02-identity-system.sql` and `patches.sql`
**Expected access:** Public read (active only); admin read (all); public insert (anon + authenticated); user update own; admin update any.

| Operation | Who | Policy Source | Notes |
|-----------|-----|---------------|-------|
| SELECT | Public (active only) | `admin-setup.sql` "Allow public read access to active posts" | `is_active = true OR is_active IS NULL` |
| SELECT | Admins (all) | `admin-rls-setup.sql` "Admins can view all posts" | `is_admin() OR is_active = true` |
| INSERT | Public | `01-schema.sql` "Public insert access for posts" | `WITH CHECK (true)` |
| UPDATE | Service role | `patches.sql` "(select auth.role()) = 'service_role'" | |
| UPDATE | Admins | `admin-rls-setup.sql` "Admins can update posts" | |
| UPDATE | Users (own) | `10-user-post-management.sql` "Users can update own posts" | `auth.uid() = facilitator_id` |
| DELETE | None defined | — | Correct — soft delete via `is_active = false` |

**Gap/Risk:** Multiple UPDATE policies exist — this is PostgreSQL's default OR behavior (any matching policy allows). Documented as intentional (service role, admin, and user can all update for different reasons). The `WITH CHECK (true)` on INSERT means unauthenticated users CAN set `facilitator_id` to any UUID — they are not forced to use their own. This is a real gap: a malicious user could set `facilitator_id = someoneElsesId` on an anonymous post. HOWEVER: this is a known platform design (posts were originally fully anonymous before identity system was added). Document as accepted risk.

### Table 3: `marginalia`
**Created in:** `06-reading-room-schema.sql`; columns added in `02-identity-system.sql`
**Expected access:** Same pattern as posts.

| Operation | Who | Policy Source | Notes |
|-----------|-----|---------------|-------|
| SELECT | Public (active only) | `admin-setup.sql` "Allow public read access to active marginalia" | |
| SELECT | Admins (all) | `admin-rls-setup.sql` "Admins can view all marginalia" | |
| INSERT | Public | `06-reading-room-schema.sql` "Public insert access for marginalia" | `WITH CHECK (true)` |
| UPDATE | Service role | `patches.sql` | |
| UPDATE | Admins | `admin-rls-setup.sql` "Admins can update marginalia" | |
| UPDATE | Users (own) | `10-user-post-management.sql` "Users can update own marginalia" | |
| DELETE | None defined | — | Correct — soft delete |

**Gap/Risk:** Same `facilitator_id` spoof risk as posts — same accepted-risk design.

### Table 4: `facilitators`
**Created in:** `02-identity-system.sql`
**Expected access:** Users read/update/insert own only; admins read all + delete.

| Operation | Who | Policy Source | Notes |
|-----------|-----|---------------|-------|
| SELECT | Own user | `02-identity-system.sql` "Users can read own facilitator profile" | `auth.uid() = id` |
| SELECT | Admins | `admin-rls-setup.sql` "Admins can view all facilitators" | Supersedes own-user policy with `is_admin() OR auth.uid() = id` |
| INSERT | Own user | `02-identity-system.sql` "Users can insert own facilitator profile" | `auth.uid() = id` |
| UPDATE | Own user | `02-identity-system.sql` "Users can update own facilitator profile" | `auth.uid() = id` |
| DELETE | Admins | `admin-rls-setup.sql` "Admins can delete facilitators" | |

**Gap/Risk:** No public read — correct. Facilitator profiles are private. Admin can view all for moderation. Clean.

### Table 5: `ai_identities`
**Created in:** `02-identity-system.sql`
**Expected access:** Public read (active only); facilitator insert/update own; admin read all + delete.

| Operation | Who | Policy Source | Notes |
|-----------|-----|---------------|-------|
| SELECT | Anyone (active only) | `02-identity-system.sql` "Anyone can read active ai_identities" | `is_active = true` |
| SELECT | Admins (all) | `admin-rls-setup.sql` "Admins can view all ai_identities" | `is_admin() OR is_active = true` |
| INSERT | Facilitators (own) | `02-identity-system.sql` "Facilitators can insert own ai_identities" | `auth.uid() = facilitator_id` |
| UPDATE | Facilitators (own) | `02-identity-system.sql` "Facilitators can update own ai_identities" | `auth.uid() = facilitator_id` |
| DELETE | Admins | `admin-rls-setup.sql` "Admins can delete ai_identities" | |

**Gap/Risk:** No public INSERT — correct (must be authenticated to create). No user DELETE of own identity — gap or design choice? Currently users can only deactivate via UPDATE (set `is_active = false`). Document as intentional soft-delete pattern.

### Table 6: `subscriptions`
**Created in:** `02-identity-system.sql`
**Expected access:** Users read/insert/delete own only; admins delete any.

| Operation | Who | Policy Source | Notes |
|-----------|-----|---------------|-------|
| SELECT | Own user | `02-identity-system.sql` "Users can read own subscriptions" | `auth.uid() = facilitator_id` |
| INSERT | Own user | `02-identity-system.sql` "Users can insert own subscriptions" | `auth.uid() = facilitator_id` |
| DELETE | Own user or Admins | `admin-rls-setup.sql` "Admins can delete subscriptions" | `is_admin() OR auth.uid() = facilitator_id` |

**Gap/Risk:** No UPDATE policy — correct (subscriptions have no editable fields). Clean.

### Table 7: `notifications`
**Created in:** `02-identity-system.sql`
**Expected access:** Users read/update own; admins delete any.

| Operation | Who | Policy Source | Notes |
|-----------|-----|---------------|-------|
| SELECT | Own user | `02-identity-system.sql` "Users can read own notifications" | `auth.uid() = facilitator_id` |
| UPDATE | Own user | `02-identity-system.sql` "Users can update own notifications" | `auth.uid() = facilitator_id` |
| DELETE | Admins or own user | `admin-rls-setup.sql` "Admins can delete notifications" | `is_admin() OR auth.uid() = facilitator_id` |
| INSERT | None (SECURITY DEFINER trigger only) | `02-identity-system.sql` trigger `notify_on_new_post()` | Correct — no direct user insert |

**Gap/Risk:** No direct INSERT policy — notifications are inserted only by the `notify_on_new_post()` SECURITY DEFINER trigger. This is correct and secure. Clean.

### Table 8: `agent_tokens`
**Created in:** `03-agent-system.sql`
**Expected access:** Facilitators view/create/update own identity's tokens; admins view all.

| Operation | Who | Policy Source | Notes |
|-----------|-----|---------------|-------|
| SELECT | Facilitators (own identities) | `03-agent-system.sql` "Facilitators view own agent tokens" | Subquery checks `ai_identities.facilitator_id = auth.uid()` |
| SELECT | Admins | `03-agent-system.sql` "Admins view all agent tokens" | |
| INSERT | Facilitators (own identities) | `03-agent-system.sql` "Facilitators create agent tokens" | |
| UPDATE | Facilitators (own identities) | `03-agent-system.sql` "Facilitators update own agent tokens" | For revocation |
| DELETE | None defined | — | **GAP: No DELETE policy — tokens are deactivated via UPDATE (`is_active = false`), not deleted.** Document as intentional (audit trail preservation). |

**Gap/Risk:** No DELETE is intentional (soft revoke). Token hashes are stored — the policy correctly prevents any user from reading token_hash of another user. Clean.

### Table 9: `agent_activity`
**Created in:** `03-agent-system.sql`
**Expected access:** Facilitators read own; admins read all; SECURITY DEFINER functions insert only.

| Operation | Who | Policy Source | Notes |
|-----------|-----|---------------|-------|
| SELECT | Facilitators (own) | `03-agent-system.sql` "Facilitators view own agent activity" | |
| SELECT | Admins | `03-agent-system.sql` "Admins view all agent activity" | |
| INSERT | None (SECURITY DEFINER only) | Comment in `03-agent-system.sql` | Correct — no direct insert |

**Gap/Risk:** No public or user INSERT — only SECURITY DEFINER functions insert into this table. No UPDATE or DELETE policies — clean audit log (append-only is intentional). Clean.

### Table 10: `texts`
**Created in:** `06-reading-room-schema.sql`
**Expected access:** Public read; admin insert + delete only.

| Operation | Who | Policy Source | Notes |
|-----------|-----|---------------|-------|
| SELECT | Anyone | `06-reading-room-schema.sql` "Public read access for texts" | `USING (true)` — all texts readable |
| INSERT | Admins | `admin-rls-setup.sql` "Admins can insert texts" | `is_admin()` |
| DELETE | Admins | `admin-rls-setup.sql` "Admins can delete texts" | `is_admin()` |
| UPDATE | None defined | — | **GAP: No UPDATE policy for texts. If a text needs to be corrected, no path exists.** Low risk — texts are curated static content. Document as accepted limitation. |

**Gap/Risk:** No public write — correct. No UPDATE for admins — noted limitation but low risk.

### Table 11: `text_submissions`
**Created in:** `09-text-submissions-setup.sql`
**Expected access:** Public insert; service role read/update/delete (overridden by admin policies).

| Operation | Who | Policy Source | Notes |
|-----------|-----|---------------|-------|
| SELECT | Service role | `09-text-submissions-setup.sql` → `patches.sql` fix | `(select auth.role()) = 'service_role'` |
| SELECT | Admins | `admin-rls-setup.sql` "Admins can view text_submissions" | `is_admin()` |
| INSERT | Public | `09-text-submissions-setup.sql` "Allow public to submit texts" | `WITH CHECK (true)` — anyone can submit |
| UPDATE | Service role | `patches.sql` | |
| UPDATE | Admins | `admin-rls-setup.sql` "Admins can update text_submissions" | |
| DELETE | Service role | `patches.sql` | |

**Gap/Risk:** Multiple SELECT policies exist (service_role AND admins). PostgreSQL allows either to grant access. Admins using the frontend can read submissions via `is_admin()`. Clean for intended use.

### Table 12: `contact`
**Created in:** `08-contact-schema.sql`
**Expected access:** Public insert; service role read; admins read.

| Operation | Who | Policy Source | Notes |
|-----------|-----|---------------|-------|
| SELECT | Service role | `08-contact-schema.sql` "Allow service role to read contact messages" | |
| SELECT | Admins | `admin-rls-setup.sql` "Admins can view contact messages" | `is_admin()` |
| INSERT | Public | `08-contact-schema.sql` "Allow public to insert contact messages" | `WITH CHECK (true)` |
| UPDATE | None | — | Correct — contact messages are read-only |
| DELETE | None | — | **GAP: No delete policy.** Contact messages accumulate indefinitely. Low operational risk, but no cleanup path. Document as accepted. |

**Gap/Risk:** No DELETE — contact messages are permanently retained. Low risk for current scale.

### Table 13: `moments`
**Created in:** `05-moments-schema.sql`
**Expected access:** Public read (active only); admin-only create (done via Supabase dashboard, not frontend).

| Operation | Who | Policy Source | Notes |
|-----------|-----|---------------|-------|
| SELECT | Anyone (active only) | `05-moments-schema.sql` "Anyone can read active moments" | `is_active = true` |
| INSERT | None via RLS | Comment says "admin-created only" | **GAP: No INSERT policy for admins via frontend.** Moments are created in Supabase Dashboard directly — no frontend path exists. |
| UPDATE | None defined | — | **GAP: No UPDATE policy.** Moments can't be edited via frontend. |
| DELETE | None defined | — | Same as above |

**Gap/Risk:** Moments are intentionally admin-created via Supabase Dashboard with no frontend UI. All gaps are by design. Document as intentional.

### Table 14 (bonus): `chat_rooms` and `chat_messages`
Note: These are two additional tables in `04-chat-schema.sql`, bringing the actual count to 14 or 15 tables depending on how `postcard_prompts` is counted. The requirement says "13 tables" — the audit should clarify the exact live count.

**chat_rooms:**
- SELECT: Public (active only); Admins (all via FOR ALL)
- ALL ops: Admins via `is_admin()`

**chat_messages:**
- SELECT: Public (active only); Admins (all)
- INSERT: Public WITH CHECK constraints (length, model, room active, rate limit)
- UPDATE: Admins only

**postcard_prompts:**
- SELECT: Public (active only) — `is_active = true`
- ALL: Service role only — `(select auth.role()) = 'service_role'`

**Gap/Risk:** `chat_messages` INSERT has no facilitator_id constraint — anonymous posting allowed intentionally.

### Actual Table Count
From SQL files: discussions, posts, marginalia, facilitators, ai_identities, subscriptions, notifications, agent_tokens, agent_activity, texts, text_submissions, contact, moments, chat_rooms, chat_messages, postcards, postcard_prompts = **17 tables total**.

The requirement says "13 tables" — this number is likely from an earlier schema state. The audit task should count actual live tables and audit all of them. The planner should note this discrepancy.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Detecting expired session | Custom token expiry check | Supabase `onAuthStateChange` SIGNED_OUT event | Supabase client handles token refresh automatically; SIGNED_OUT fires when session truly terminates |
| Detecting reused magic link | Custom URL hash parsing | Read `error_code` from URL hash (already in fragment when Supabase redirects with error) | Supabase populates hash with error_code=otp_expired on failed link consumption |
| Detecting expired reset link | Custom session validator | Check `getSession()` after `Auth.init()` — null session = no valid recovery token | Supabase nulls out the session when the recovery token is consumed or expired |
| RLS policy listing | Custom query builder | `SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies ORDER BY tablename;` | PostgreSQL system catalog has all policy metadata |
| Admin role check | JWT claim parsing | `is_admin()` SECURITY DEFINER function already in DB | Prevents infinite recursion, already implemented |

**Key insight:** All auth edge cases map to existing Supabase client behavior — the work is wiring up UI responses to events and states that already exist.

---

## Common Pitfalls

### Pitfall 1: Checking `Auth.isLoggedIn()` Instead of Session for PASSWORD_RECOVERY
**What goes wrong:** `Auth.isLoggedIn()` returns `true` when a password recovery session exists (Supabase temporarily signs in the user via the recovery link). The `reset-password.html` page appears to work, but calling `Auth.updatePassword()` fails if the session was already consumed by a previous visit.
**Why it happens:** Supabase's password reset flow creates a short-lived session that expires after one use. Revisiting the link can cause a stale session or no session.
**How to avoid:** After `Auth.init()`, call `Auth.getClient().auth.getSession()` explicitly and check if `session` is non-null before rendering the form.
**Warning signs:** `Auth.updatePassword()` throws an error even though `Auth.isLoggedIn()` returned true.

### Pitfall 2: URL Hash Consumed Before JS Runs
**What goes wrong:** Supabase JS v2 processes the URL hash (`#access_token=...&type=recovery`) automatically on client initialization. By the time custom JS runs, the hash may be cleared from the URL.
**Why it happens:** The Supabase client processes magic link / recovery tokens from the hash on `createClient()`. Error parameters (`#error=...&error_code=otp_expired`) remain in the hash — but only if Supabase redirected with an error, not on success.
**How to avoid:** Check for `error_code` in the hash BEFORE calling `Auth.init()` (before `createClient()` processes it), OR check `getSession()` after init (session will be null if token was invalid).
**Warning signs:** Error handling code never fires even though the link was expired.

### Pitfall 3: Multiple Permissive SELECT Policies (Known Issue)
**What goes wrong:** When two SELECT policies both apply to the same table (e.g., "Public read active posts" and "Admins can view all posts"), PostgreSQL ORs them together. An admin sees all posts — but so does any authenticated user whose session satisfies either policy.
**Why it happens:** Supabase's permissive policy model means any matching policy grants access.
**How to avoid:** This is already handled correctly in this codebase — admin policies use `is_admin()` which only returns true for users in the `admins` table. No gap here.
**Warning signs:** Non-admin authenticated users can read hidden/inactive content.

### Pitfall 4: Missing `is_active` Filter in RLS vs. Application-Level Filter
**What goes wrong:** Some tables filter `is_active` in RLS policies; others rely on application-level WHERE clauses. If RLS doesn't enforce `is_active`, a direct Supabase client call (e.g., from a curious user in browser devtools) can fetch soft-deleted records.
**How to avoid:** For posts, marginalia, postcards — verify the live RLS policy filters `is_active = true` for the public SELECT case (it does, via the admin-setup.sql policy).

### Pitfall 5: `await Auth.init()` 4-Second Timeout Masking Expired Sessions
**What goes wrong:** On auth-gated pages, if `getSession()` times out at 4 seconds (slow connection), `Auth.init()` proceeds without a session. The page shows "not logged in" — which is correct behavior, but the user sees a generic "not logged in" message, not "your session expired."
**Why it happens:** The timeout is a deliberate performance guard, not an error handler.
**How to avoid:** The redirect-with-reason approach (Pattern 2 above) handles this — the user gets a "session expired" message either way.

---

## Code Examples

### Auditing All Live RLS Policies (run in Supabase SQL Editor)
```sql
-- Source: PostgreSQL system catalog (pg_policies view)
SELECT
    tablename,
    policyname,
    cmd,
    permissive,
    qual AS using_expression,
    with_check AS check_expression
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

### Detecting Expired/Reused Reset Link on reset-password.html
```javascript
// Source: Supabase auth docs - getSession() returns null for expired tokens
// Run AFTER Auth.init() in reset-password.html
async function checkResetSession() {
    const { data: { session }, error } = await Auth.getClient().auth.getSession();

    if (!session) {
        // No valid recovery session — link is expired or already used
        showError('This password reset link has already been used or has expired.');
        document.getElementById('reset-form').style.display = 'none';

        // Show recovery path
        const newLinkEl = document.createElement('p');
        newLinkEl.innerHTML = '<a href="login.html">Go to login</a> to request a new reset link.';
        newLinkEl.style.textAlign = 'center';
        newLinkEl.style.marginTop = 'var(--space-md)';
        document.querySelector('.reset-card').appendChild(newLinkEl);
        return false;
    }
    return true;
}
```

### Detecting Reused Magic Link Before Auth Init
```javascript
// Source: Supabase error redirect behavior (error params in URL hash)
// Run BEFORE Auth.init() in the magic link landing page (dashboard.html)
function checkMagicLinkError() {
    // Supabase redirects with error info in hash when OTP is expired
    const hash = window.location.hash;
    if (hash.includes('error_code=otp_expired') ||
        hash.includes('error=access_denied')) {
        // Clear the hash to avoid Supabase client confusion
        history.replaceState(null, '', window.location.pathname + window.location.search);
        return 'Your sign-in link has already been used. Please sign in again.';
    }
    return null;
}
```

### Expired Session Redirect in Auth-Gated Pages
```javascript
// Source: Project pattern in dashboard.js
// Replace the current "show notLoggedIn div" pattern
await Auth.init();
if (!Auth.isLoggedIn()) {
    // Was there a magic link error?
    const magicLinkError = checkMagicLinkError();
    const reason = magicLinkError ? 'magic_link_expired' : 'session_expired';
    window.location.href = 'login.html?reason=' + reason;
    return;
}
```

### Showing Context Message on login.html
```javascript
// Source: Project pattern in login.html init script
// Add BEFORE Auth.init() call
const urlParams = new URLSearchParams(window.location.search);
const reason = urlParams.get('reason');
if (reason === 'session_expired') {
    showError('Your session has expired. Please sign in again.');
} else if (reason === 'magic_link_expired') {
    showError('That sign-in link has already been used. Please sign in with your password or request a new magic link.');
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `auth.role()` in RLS policies (evaluated per row) | `(select auth.role())` (evaluated once per query) | January 2026 patch | Performance fix — already applied in patches.sql |
| Duplicate SELECT policies on posts/marginalia | Single policy after DROP + recreate | January 2026 patch | Supabase lint warning resolved — already applied |
| Floating @2 Supabase URL | Pinned @2.98.0 with SRI | Phase 5 (complete) | Supply chain security |

**No deprecated approaches in active use for Phase 6.**

---

## Open Questions

1. **Actual live table count (13 vs. 17)**
   - What we know: SQL source files define at minimum 17 tables (discussions, posts, marginalia, facilitators, ai_identities, subscriptions, notifications, agent_tokens, agent_activity, texts, text_submissions, contact, moments, chat_rooms, chat_messages, postcards, postcard_prompts)
   - What's unclear: Whether the Supabase project has exactly these tables or if some were not created (some schema files may not have been run)
   - Recommendation: The audit task MUST begin with `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;` run in the Supabase SQL Editor to get the definitive list. The SECR-07 success criterion says "13 tables" — if the live count differs, document and audit all live tables.

2. **PASSWORD_RECOVERY vs. direct getSession() approach**
   - What we know: Supabase emits PASSWORD_RECOVERY via `onAuthStateChange` when a valid recovery link is clicked. The current `auth.js` `onAuthStateChange` only handles SIGNED_IN and SIGNED_OUT.
   - What's unclear: Whether we should hook into the PASSWORD_RECOVERY event in auth.js (central) or check `getSession()` in reset-password.html (local).
   - Recommendation: Use `getSession()` check in `reset-password.html` directly — it is simpler, doesn't require modifying the global auth.js listener, and works regardless of whether the recovery event fired.

3. **Magic link landing page**
   - What we know: Magic link redirects to `dashboard.html` (per Auth.sendMagicLink() in auth.js — `redirectUrl` is set to `dashboard.html`)
   - What's unclear: Whether the URL hash error parameters from a reused magic link persist long enough for JS to read them, or whether Supabase JS clears them on createClient()
   - Recommendation: Implement BOTH the pre-init hash check AND the post-init getSession() null check. Belt-and-suspenders. If hash is cleared before JS runs, session will be null.

---

## Validation Architecture

Note: `.planning/config.json` has `workflow.nyquist_validation` not set (key absent). The config has no `nyquist_validation` key. Skipping this section — no automated test validation required for this phase.

---

## Implementation Guidance for Planner

### Task 1: RLS Audit (SECR-07)
This is a documentation + SQL task, not a code task.
1. Run `SELECT tablename FROM pg_tables WHERE schemaname = 'public';` in Supabase SQL Editor — capture actual table count
2. Run `SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;` — capture all live policies
3. Compare live policies against the expected patterns documented in this research
4. Document gaps in an audit file (`.planning/phases/06-auth-security/rls-audit.md` or similar)
5. Produce corrective SQL for any unacceptable gaps and apply in Supabase SQL Editor
6. The success criterion is: all tables have documented expected access patterns and any gap between expected and actual is resolved

**Key: This task produces no code changes to the repository (SQL is applied in the Supabase Dashboard).** The deliverable is the audit document.

### Task 2: Auth Edge Cases (SECR-08, SECR-09, SECR-10)
Three edge cases, likely implementable in a single focused task:
- **SECR-08** (expired session): Modify auth-gated pages (`dashboard.html` JS, `admin.html` JS) to redirect to `login.html?reason=session_expired` instead of showing "not logged in" div. Modify `login.html` JS to read the `reason` param and show contextual message.
- **SECR-09** (expired reset link): Modify `reset-password.html` JS to call `getSession()` after `Auth.init()` and show "link expired" message with "go to login" link if session is null.
- **SECR-10** (magic link reuse): Add pre-init hash check in `dashboard.html` (the magic link landing page) to detect `error_code=otp_expired` and redirect to `login.html?reason=magic_link_expired`.

All three changes are vanilla JS, no new libraries. Changes are in: `js/dashboard.js`, `js/admin.js` (if auth-gated), `reset-password.html`, `login.html`.

---

## Sources

### Primary (HIGH confidence)
- Supabase JS v2 onAuthStateChange docs (https://supabase.com/docs/reference/javascript/auth-onauthstatechange) — event list including PASSWORD_RECOVERY, TOKEN_REFRESHED, SIGNED_OUT, USER_UPDATED, INITIAL_SESSION, SIGNED_IN
- Supabase Auth error codes (https://supabase.com/docs/guides/auth/debugging/error-codes) — `otp_expired` code confirmed; `AuthApiError` class with `.code` property
- Supabase Sessions docs (https://supabase.com/docs/guides/auth/sessions) — session expiry behavior, refresh token one-use semantics
- Supabase OTP troubleshooting (https://supabase.com/docs/guides/troubleshooting/otp-verification-failures-token-has-expired-or-otp_expired-errors-5ee4d0) — otp_expired error, email prefetching cause
- Project SQL files (all files in `sql/schema/` and `sql/admin/`) — authoritative source for all table definitions and RLS policies
- `js/auth.js` — authoritative source for auth flow, current event handling
- `reset-password.html` — current reset flow implementation
- `login.html` — current login flow implementation

### Secondary (MEDIUM confidence)
- Supabase GitHub Discussion #3360 (password reset flow) — PASSWORD_RECOVERY event confirmed to fire for recovery links; temporary session created
- Supabase GitHub Discussion #35591 (otp_expired error) — confirms error behavior for expired password reset links

### Tertiary (LOW confidence)
- Assertion that Supabase JS v2 processes URL hash during `createClient()` — not explicitly confirmed in official docs; inferred from auth-js behavior and community reports. Pre-init hash check is belt-and-suspenders mitigation.

---

## Metadata

**Confidence breakdown:**
- RLS audit (table inventory and policy reconstruction): HIGH — derived directly from SQL source files
- Auth edge case patterns (SECR-08, SECR-09, SECR-10): HIGH — Supabase event names and error codes confirmed via official docs
- Magic link hash parameter timing: MEDIUM — behavior inferred from community reports, not explicit official docs
- Exact live table count: LOW — SQL files are source of truth but not guaranteed to reflect live DB state

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (Supabase auth API is stable; 30-day window appropriate)
