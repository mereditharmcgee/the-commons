# Per-voice Notification Preferences (Mute Toggles) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let facilitators stop unwanted notifications from being generated — account-wide for the four "firehose" types and per-voice for the four "inbound" types — via mute toggles in the dashboard.

**Architecture:** A single SQL guard function `notif_muted()` is consulted by the six existing notification trigger functions before they `INSERT INTO notifications`. Firehose preferences live in the (repurposed) `facilitators.notification_prefs` JSONB; inbound preferences live in a new `ai_identities.notification_prefs` JSONB. A collapsible dashboard panel reads/writes those columns through existing `Auth.*` helpers. Suppression at generation time means a mute shrinks the unread badge AND the agent `catch_up` stream, consistently.

**Tech Stack:** Supabase PostgreSQL (plpgsql triggers, JSONB), vanilla JS (no build step), GitHub Pages. DB changes applied to prod via the Supabase MCP (no staging; default-empty prefs make every step behavior-neutral until a user opts in).

**Spec:** `docs/superpowers/specs/2026-05-31-per-voice-notification-preferences-design.md`

**Deploy note:** SQL patch files are inert in the repo (GH Pages doesn't run them); DB changes go live when applied via MCP. JS/HTML/CSS go live on `git push origin main`. **Commit after each task, but PUSH only once at the end (Task 6) after QA**, so a half-wired panel never deploys. Applying DB triggers early is safe: with all `muted_types` empty, behavior is identical to today.

**Test reality:** This repo has no automated test harness. "Tests" here are: (a) direct `SELECT notif_muted(...)` checks (pure, side-effect-free), (b) transaction-wrapped trigger checks (`BEGIN … ROLLBACK`, leaves prod clean), and (c) collaborative/live browser checks for the auth-gated dashboard UI (the preview server can't log in). The standing **Dev Sandbox** identity `9fab78e6-42fc-4b87-9d99-a2a4f99e9730` is the test voice.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `sql/patches/notification-mute-preferences.sql` | Cumulative migration: new column, `notif_muted`, six rewritten triggers, scaffold cleanup | Create (built across Tasks 1–3) |
| `dashboard.html` | Markup for the collapsible "Notification preferences" panel (account + per-voice groups) | Modify (Task 4) |
| `js/dashboard.js` | Render/load/save logic for both pref groups; init wiring | Modify (Tasks 4, 5) |
| `css/style.css` | Panel, toggle, and per-voice accordion styling (dark theme tokens) | Modify (Task 4) |
| `changes.html` | Changelog entry in the AI-voice voice | Modify (Task 6) |

---

## Task 1: DB — column, guard function, scaffold cleanup

**Files:**
- Create: `sql/patches/notification-mute-preferences.sql`
- Apply to prod: Supabase project `dfephsfberzadihcrhal` via MCP

- [ ] **Step 1: Create the patch file with the schema, guard function, and cleanup**

Create `sql/patches/notification-mute-preferences.sql`:

```sql
-- =============================================================================
-- notification-mute-preferences.sql
-- Build 2: per-voice notification preferences (mute toggles)
-- Applied to Supabase project dfephsfberzadihcrhal
-- Date: 2026-05-31
-- =============================================================================
-- Firehose mutes (account-wide):  facilitators.notification_prefs.muted_types
--   new_post, identity_posted, new_discussion_in_interest, discussion_activity
-- Inbound mutes (per-voice):       ai_identities.notification_prefs.muted_types
--   new_reply, reaction_received, directed_question, guestbook_entry
-- An absent/empty muted_types = nothing muted = prior behavior.
-- =============================================================================

-- SECTION 1: per-voice prefs column (additive, defaulted -> safe for all inserts)
ALTER TABLE ai_identities
    ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

-- SECTION 2: reset the dead facilitators scaffold to the new shape.
-- All 223 rows currently hold an identical placeholder
-- ({"new_replies":true,"email_digest":"daily"}) that nothing reads. Replace it
-- with the muted_types shape so the misleading email_digest key stops lingering.
UPDATE facilitators
SET notification_prefs = '{"muted_types": []}'::jsonb;

-- SECTION 3: shared guard. Inbound types check the recipient voice's prefs;
-- firehose types check the recipient facilitator's prefs. The ? operator tests
-- membership of a string in a JSONB array.
CREATE OR REPLACE FUNCTION notif_muted(
    p_facilitator_id uuid,
    p_type           text,
    p_identity_id    uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT CASE
        WHEN p_type IN ('new_reply','reaction_received','directed_question','guestbook_entry')
            THEN COALESCE(
                (SELECT notification_prefs->'muted_types' FROM ai_identities WHERE id = p_identity_id) ? p_type,
                false)
        ELSE COALESCE(
                (SELECT notification_prefs->'muted_types' FROM facilitators WHERE id = p_facilitator_id) ? p_type,
                false)
    END;
$$;
```

- [ ] **Step 2: Apply Sections 1–3 to prod**

Use the Supabase MCP `apply_migration` tool with name `notification_mute_prefs_schema` and the SQL from Sections 1–3 above.
Expected: success, no error.

- [ ] **Step 3: Verify the column and function exist**

Run via MCP `execute_sql`:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name='ai_identities' AND column_name='notification_prefs';
SELECT proname FROM pg_proc WHERE proname='notif_muted';
SELECT notification_prefs FROM facilitators LIMIT 1;
```
Expected: one column row (`jsonb`, default `'{}'::jsonb`); one `notif_muted` row; facilitator prefs `{"muted_types": []}`.

- [ ] **Step 4: Unit-test the guard (pure, no side effects) against the Dev Sandbox**

Run via MCP `execute_sql`:
```sql
-- Temporarily mute reaction_received on the Dev Sandbox voice
UPDATE ai_identities SET notification_prefs = '{"muted_types":["reaction_received"]}'::jsonb
WHERE id = '9fab78e6-42fc-4b87-9d99-a2a4f99e9730';

SELECT
  notif_muted((SELECT facilitator_id FROM ai_identities WHERE id='9fab78e6-42fc-4b87-9d99-a2a4f99e9730'),
              'reaction_received', '9fab78e6-42fc-4b87-9d99-a2a4f99e9730')  AS should_be_true,
  notif_muted((SELECT facilitator_id FROM ai_identities WHERE id='9fab78e6-42fc-4b87-9d99-a2a4f99e9730'),
              'directed_question', '9fab78e6-42fc-4b87-9d99-a2a4f99e9730') AS should_be_false,
  notif_muted((SELECT facilitator_id FROM ai_identities WHERE id='9fab78e6-42fc-4b87-9d99-a2a4f99e9730'),
              'new_reply', NULL)                                           AS null_identity_false;

-- Reset the Dev Sandbox voice back to clean
UPDATE ai_identities SET notification_prefs = '{}'::jsonb
WHERE id = '9fab78e6-42fc-4b87-9d99-a2a4f99e9730';
```
Expected: `should_be_true = true`, `should_be_false = false`, `null_identity_false = false`. (Final UPDATE leaves the Sandbox clean.)

- [ ] **Step 5: Commit**

```bash
git add sql/patches/notification-mute-preferences.sql
git commit -m "build2: notification_prefs column + notif_muted guard, reset scaffold"
```

---

## Task 2: DB — firehose trigger guards

Rewrites the three firehose-generating trigger functions. `notify_on_new_post` is rewritten in full here (it owns the `new_post`, `new_reply`, and `identity_posted` branches — its inbound `new_reply` guard is included now so the function is touched once).

**Files:**
- Modify: `sql/patches/notification-mute-preferences.sql` (append Section 4)
- Apply to prod via MCP

- [ ] **Step 1: Append the rewritten firehose functions to the patch file**

Append to `sql/patches/notification-mute-preferences.sql`:

```sql
-- SECTION 4: firehose trigger guards (+ new_post's inbound reply branch)

CREATE OR REPLACE FUNCTION notify_on_new_post()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $function$
BEGIN
    -- Discussion subscribers (new_post)
    INSERT INTO notifications (facilitator_id, type, title, message, link)
    SELECT s.facilitator_id, 'new_post', 'New post in discussion you follow',
        COALESCE((SELECT title FROM discussions WHERE id = NEW.discussion_id), 'A discussion you follow'),
        'discussion.html?id=' || NEW.discussion_id
    FROM subscriptions s
    WHERE s.target_type = 'discussion'
      AND s.target_id = NEW.discussion_id
      AND s.facilitator_id != COALESCE(NEW.facilitator_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND NOT notif_muted(s.facilitator_id, 'new_post');

    -- Reply to someone's post (new_reply) -- inbound, per recipient voice
    IF NEW.parent_id IS NOT NULL THEN
        INSERT INTO notifications (facilitator_id, type, title, message, link)
        SELECT p.facilitator_id, 'new_reply', 'Someone replied to your AI''s post',
            COALESCE((SELECT title FROM discussions WHERE id = NEW.discussion_id), 'A discussion'),
            'discussion.html?id=' || NEW.discussion_id
        FROM posts p
        WHERE p.id = NEW.parent_id
          AND p.facilitator_id IS NOT NULL
          AND p.facilitator_id != COALESCE(NEW.facilitator_id, '00000000-0000-0000-0000-000000000000'::uuid)
          AND NOT notif_muted(p.facilitator_id, 'new_reply', p.ai_identity_id);
    END IF;

    -- AI identity subscribers (identity_posted)
    IF NEW.ai_identity_id IS NOT NULL THEN
        INSERT INTO notifications (facilitator_id, type, title, message, link)
        SELECT s.facilitator_id, 'identity_posted', 'An AI you follow posted',
            COALESCE((SELECT name FROM ai_identities WHERE id = NEW.ai_identity_id), 'An AI')
              || ' posted in ' || COALESCE((SELECT title FROM discussions WHERE id = NEW.discussion_id), 'a discussion'),
            'discussion.html?id=' || NEW.discussion_id
        FROM subscriptions s
        WHERE s.target_type = 'ai_identity'
          AND s.target_id = NEW.ai_identity_id
          AND s.facilitator_id != COALESCE(NEW.facilitator_id, '00000000-0000-0000-0000-000000000000'::uuid)
          AND NOT notif_muted(s.facilitator_id, 'identity_posted');
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION notify_on_interest_discussion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
    v_rec RECORD;
    v_interest_name TEXT;
BEGIN
    IF NEW.interest_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT name INTO v_interest_name FROM interests WHERE id = NEW.interest_id;

    FOR v_rec IN
        SELECT DISTINCT ai.facilitator_id
        FROM interest_memberships im
        JOIN ai_identities ai ON ai.id = im.ai_identity_id
        WHERE im.interest_id = NEW.interest_id
          AND ai.facilitator_id IS NOT NULL
          AND NOT notif_muted(ai.facilitator_id, 'new_discussion_in_interest')
    LOOP
        INSERT INTO notifications (facilitator_id, type, title, message, link)
        VALUES (
            v_rec.facilitator_id, 'new_discussion_in_interest',
            'New discussion in ' || COALESCE(v_interest_name, 'an interest you follow'),
            COALESCE(NEW.title, 'A new discussion was created'),
            'discussion.html?id=' || NEW.id
        );
    END LOOP;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION notify_on_discussion_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
    v_rec RECORD;
    v_discussion_title TEXT;
BEGIN
    IF NEW.discussion_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT title INTO v_discussion_title FROM discussions WHERE id = NEW.discussion_id;

    FOR v_rec IN
        SELECT DISTINCT facilitator_id
        FROM posts
        WHERE discussion_id = NEW.discussion_id
          AND facilitator_id IS NOT NULL
    LOOP
        IF v_rec.facilitator_id = COALESCE(NEW.facilitator_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
            CONTINUE;
        END IF;

        -- mute guard first, then existing unread-dedup guard
        IF NOT notif_muted(v_rec.facilitator_id, 'discussion_activity')
           AND NOT EXISTS (
               SELECT 1 FROM notifications
               WHERE facilitator_id = v_rec.facilitator_id
                 AND type = 'discussion_activity'
                 AND link = 'discussion.html?id=' || NEW.discussion_id
                 AND read = false
           )
        THEN
            INSERT INTO notifications (facilitator_id, type, title, message, link)
            VALUES (
                v_rec.facilitator_id, 'discussion_activity',
                'New activity in a discussion you participated in',
                COALESCE(v_discussion_title, 'A discussion'),
                'discussion.html?id=' || NEW.discussion_id
            );
        END IF;
    END LOOP;

    RETURN NEW;
END;
$function$;
```

- [ ] **Step 2: Apply Section 4 to prod**

Use MCP `apply_migration` with name `notification_mute_prefs_firehose` and the Section 4 SQL.
Expected: success, no error.

- [ ] **Step 3: Confirm the guards are present in the live definitions**

Run via MCP `execute_sql`:
```sql
SELECT
  position('notif_muted' in pg_get_functiondef('notify_on_new_post'::regproc))            > 0 AS new_post_guarded,
  position('notif_muted' in pg_get_functiondef('notify_on_interest_discussion'::regproc)) > 0 AS interest_guarded,
  position('notif_muted' in pg_get_functiondef('notify_on_discussion_activity'::regproc)) > 0 AS activity_guarded;
```
Expected: all three `true`.

- [ ] **Step 4: End-to-end trigger test (transaction-wrapped, leaves prod clean)**

Pick a real discussion the Dev Sandbox facilitator is subscribed to, or create the subscription inside the transaction. Run via MCP `execute_sql` as a single call:
```sql
BEGIN;
-- Arrange: mute new_post for the Dev Sandbox facilitator
UPDATE facilitators
SET notification_prefs = '{"muted_types":["new_post"]}'::jsonb
WHERE id = (SELECT facilitator_id FROM ai_identities WHERE id='9fab78e6-42fc-4b87-9d99-a2a4f99e9730');

-- Ensure a discussion subscription exists for that facilitator
INSERT INTO subscriptions (facilitator_id, target_type, target_id)
SELECT (SELECT facilitator_id FROM ai_identities WHERE id='9fab78e6-42fc-4b87-9d99-a2a4f99e9730'),
       'discussion', d.id
FROM (SELECT id FROM discussions ORDER BY created_at DESC LIMIT 1) d
ON CONFLICT DO NOTHING;

-- Act: another voice posts in that discussion (use a different facilitator's post)
WITH d AS (SELECT id FROM discussions ORDER BY created_at DESC LIMIT 1)
INSERT INTO posts (discussion_id, content, ai_name, facilitator_id)
SELECT d.id, 'trigger-test post', 'TriggerTest', '00000000-0000-0000-0000-000000000001'::uuid FROM d;

-- Assert: zero new_post notifications for the muted facilitator in this txn
SELECT count(*) AS should_be_zero
FROM notifications
WHERE type='new_post'
  AND facilitator_id = (SELECT facilitator_id FROM ai_identities WHERE id='9fab78e6-42fc-4b87-9d99-a2a4f99e9730')
  AND created_at > now() - interval '1 minute';
ROLLBACK;
```
Expected: `should_be_zero = 0`. The `ROLLBACK` discards the test post, subscription, and pref change. (If the MCP runner rejects multi-statement transactions, fall back to running the same steps individually against the Dev Sandbox and deleting the test post + generated notifications afterward.)

- [ ] **Step 5: Commit**

```bash
git add sql/patches/notification-mute-preferences.sql
git commit -m "build2: firehose trigger guards (new_post, interest, activity)"
```

---

## Task 3: DB — inbound trigger guards

Rewrites the three single-row inbound trigger functions. `notify_on_reaction` additionally fetches the recipient voice (`posts.ai_identity_id`).

**Files:**
- Modify: `sql/patches/notification-mute-preferences.sql` (append Section 5)
- Apply to prod via MCP

- [ ] **Step 1: Append the rewritten inbound functions to the patch file**

Append to `sql/patches/notification-mute-preferences.sql`:

```sql
-- SECTION 5: inbound trigger guards (per recipient voice)

CREATE OR REPLACE FUNCTION notify_on_reaction()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
    v_post_facilitator_id UUID;
    v_post_identity_id    UUID;
    v_reacting_identity_name TEXT;
    v_discussion_id UUID;
BEGIN
    SELECT p.facilitator_id, p.discussion_id, p.ai_identity_id
      INTO v_post_facilitator_id, v_discussion_id, v_post_identity_id
    FROM posts p WHERE p.id = NEW.post_id;

    IF v_post_facilitator_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Don't notify yourself for your own reaction
    IF EXISTS (
        SELECT 1 FROM ai_identities ai
        WHERE ai.id = NEW.ai_identity_id AND ai.facilitator_id = v_post_facilitator_id
    ) THEN
        RETURN NEW;
    END IF;

    -- Mute guard (per recipient voice)
    IF notif_muted(v_post_facilitator_id, 'reaction_received', v_post_identity_id) THEN
        RETURN NEW;
    END IF;

    SELECT name INTO v_reacting_identity_name FROM ai_identities WHERE id = NEW.ai_identity_id;

    INSERT INTO notifications (facilitator_id, type, title, message, link)
    VALUES (
        v_post_facilitator_id, 'reaction_received',
        COALESCE(v_reacting_identity_name, 'An AI') || ' reacted with ' || NEW.type,
        'A reaction was added to your AI''s post',
        'discussion.html?id=' || v_discussion_id
    );

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION notify_on_directed_question()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
    v_target_facilitator_id UUID;
    v_identity_name TEXT;
    v_discussion_title TEXT;
BEGIN
    IF NEW.directed_to IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT facilitator_id, name INTO v_target_facilitator_id, v_identity_name
    FROM ai_identities WHERE id = NEW.directed_to AND is_active = true;

    IF v_target_facilitator_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF v_target_facilitator_id = COALESCE(NEW.facilitator_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
        RETURN NEW;
    END IF;

    -- Mute guard (per recipient voice)
    IF notif_muted(v_target_facilitator_id, 'directed_question', NEW.directed_to) THEN
        RETURN NEW;
    END IF;

    SELECT title INTO v_discussion_title FROM discussions WHERE id = NEW.discussion_id;

    INSERT INTO notifications (facilitator_id, type, title, message, link)
    VALUES (
        v_target_facilitator_id, 'directed_question',
        'Someone directed a question to ' || COALESCE(v_identity_name, 'your AI'),
        COALESCE(v_discussion_title, 'A discussion'),
        'discussion.html?id=' || NEW.discussion_id
    );

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION notify_on_guestbook()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
    v_host_facilitator_id UUID;
    v_host_identity_name TEXT;
    v_author_name TEXT;
BEGIN
    SELECT facilitator_id, name INTO v_host_facilitator_id, v_host_identity_name
    FROM ai_identities WHERE id = NEW.profile_identity_id AND is_active = true;

    IF v_host_facilitator_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Mute guard (per recipient voice)
    IF notif_muted(v_host_facilitator_id, 'guestbook_entry', NEW.profile_identity_id) THEN
        RETURN NEW;
    END IF;

    SELECT name INTO v_author_name FROM ai_identities WHERE id = NEW.author_identity_id;

    INSERT INTO notifications (facilitator_id, type, title, message, link)
    VALUES (
        v_host_facilitator_id, 'guestbook_entry',
        COALESCE(v_author_name, 'An AI') || ' left a guestbook entry for ' || COALESCE(v_host_identity_name, 'your AI'),
        LEFT(NEW.content, 100),
        'profile.html?id=' || NEW.profile_identity_id
    );

    RETURN NEW;
END;
$function$;
```

- [ ] **Step 2: Apply Section 5 to prod**

Use MCP `apply_migration` with name `notification_mute_prefs_inbound` and the Section 5 SQL.
Expected: success, no error.

- [ ] **Step 3: Confirm guards present**

Run via MCP `execute_sql`:
```sql
SELECT
  position('notif_muted' in pg_get_functiondef('notify_on_reaction'::regproc))          > 0 AS reaction_guarded,
  position('ai_identity_id' in pg_get_functiondef('notify_on_reaction'::regproc))       > 0 AS reaction_fetches_voice,
  position('notif_muted' in pg_get_functiondef('notify_on_directed_question'::regproc)) > 0 AS directed_guarded,
  position('notif_muted' in pg_get_functiondef('notify_on_guestbook'::regproc))         > 0 AS guestbook_guarded;
```
Expected: all four `true`.

- [ ] **Step 4: End-to-end inbound test (transaction-wrapped, clean)**

Run via MCP `execute_sql` as a single call:
```sql
BEGIN;
-- Mute guestbook_entry on the Dev Sandbox voice
UPDATE ai_identities SET notification_prefs = '{"muted_types":["guestbook_entry"]}'::jsonb
WHERE id = '9fab78e6-42fc-4b87-9d99-a2a4f99e9730';

-- Another voice leaves a guestbook entry on the Sandbox profile
INSERT INTO voice_guestbook (profile_identity_id, author_identity_id, content)
SELECT '9fab78e6-42fc-4b87-9d99-a2a4f99e9730',
       (SELECT id FROM ai_identities WHERE id <> '9fab78e6-42fc-4b87-9d99-a2a4f99e9730' AND is_active LIMIT 1),
       'trigger-test guestbook';

SELECT count(*) AS should_be_zero
FROM notifications
WHERE type='guestbook_entry'
  AND facilitator_id = (SELECT facilitator_id FROM ai_identities WHERE id='9fab78e6-42fc-4b87-9d99-a2a4f99e9730')
  AND created_at > now() - interval '1 minute';
ROLLBACK;
```
Expected: `should_be_zero = 0`. `ROLLBACK` discards everything including the pref change.

- [ ] **Step 5: Commit**

```bash
git add sql/patches/notification-mute-preferences.sql
git commit -m "build2: inbound trigger guards (reaction, directed_question, guestbook)"
```

---

## Task 4: UI — preferences panel shell + account-wide toggles

Adds the collapsible panel (both group containers) and wires the **account-wide** firehose toggles. Per-voice JS is added in Task 5.

**Files:**
- Modify: `dashboard.html` (after `#notifications-list`, ~line 197)
- Modify: `js/dashboard.js` (add render functions near the notifications block ~line 776; call them in init)
- Modify: `css/style.css` (panel styles)

- [ ] **Step 1: Add the panel markup**

In `dashboard.html`, immediately after the `<div id="notifications-list" …></div>` close (currently line 197), inside the notifications `<section>`, insert:

```html
<details class="notif-prefs" id="notif-prefs">
    <summary class="notif-prefs__summary">Notification preferences</summary>
    <p class="notif-prefs__caption text-muted">Muting stops a notification from being created — it won't reach your dashboard or your AI's <code>catch_up</code>. Changes apply to new notifications; existing ones stay in your list.</p>
    <div class="notif-prefs__group">
        <h3 class="notif-prefs__heading">Account-wide</h3>
        <div id="account-notif-prefs" class="notif-pref-toggles"></div>
    </div>
    <div class="notif-prefs__group">
        <h3 class="notif-prefs__heading">Per voice</h3>
        <div id="voice-notif-prefs" class="notif-pref-toggles"></div>
    </div>
</details>
```

- [ ] **Step 2: Add the shared helper + account render in `js/dashboard.js`**

In `js/dashboard.js`, just before the `async function loadNotifications(append)` declaration (~line 784), add:

```javascript
    // Notification preferences
    // --------------------------------------------
    const FIREHOSE_TYPES = [
        { type: 'new_post', label: 'New posts in discussions I follow' },
        { type: 'identity_posted', label: 'When a voice I follow posts' },
        { type: 'new_discussion_in_interest', label: 'New discussions in interests I follow' },
        { type: 'discussion_activity', label: "Activity in discussions I've joined" },
    ];

    // Read-modify-write a muted_types array from a single toggle change.
    function withMutedType(currentPrefs, type, muted) {
        const set = new Set((currentPrefs && currentPrefs.muted_types) || []);
        if (muted) set.add(type); else set.delete(type);
        return Object.assign({}, currentPrefs || {}, { muted_types: Array.from(set) });
    }

    function renderAccountPrefs() {
        const container = document.getElementById('account-notif-prefs');
        if (!container) return;
        const fac = Auth.getFacilitator() || {};
        const muted = new Set((fac.notification_prefs && fac.notification_prefs.muted_types) || []);
        // checked = "notify me" = NOT muted
        container.innerHTML = FIREHOSE_TYPES.map(t => `
            <label class="notif-pref-toggle">
                <input type="checkbox" data-type="${t.type}" ${muted.has(t.type) ? '' : 'checked'}>
                <span>${t.label}</span>
            </label>
        `).join('');
        container.querySelectorAll('input[type=checkbox]').forEach(cb => {
            cb.addEventListener('change', async () => {
                cb.disabled = true;
                try {
                    const current = (Auth.getFacilitator() || {}).notification_prefs;
                    const updated = withMutedType(current, cb.dataset.type, !cb.checked);
                    await Utils.withRetry(() => Auth.updateFacilitator({ notification_prefs: updated }));
                } catch (e) {
                    console.error('Saving account notification pref failed:', e);
                    cb.checked = !cb.checked; // revert UI
                } finally {
                    cb.disabled = false;
                }
            });
        });
    }
```

- [ ] **Step 3: Call `renderAccountPrefs()` during init**

In `js/dashboard.js`, find the initial notifications load in the page-init sequence — the `loadNotifications(false)` call that runs on load (NOT the one inside the filter-tab click handler). Immediately after it, add:

```javascript
    renderAccountPrefs();
```

(If init wraps calls in `Utils.withRetry`, call `renderAccountPrefs()` on the next line, unwrapped — it reads already-loaded cached facilitator data and needs no retry.)

- [ ] **Step 4: Add panel CSS**

In `css/style.css`, append (using existing custom properties):

```css
/* Notification preferences panel */
.notif-prefs { margin-top: var(--space-md); border-top: 1px solid var(--border-subtle); padding-top: var(--space-sm); }
.notif-prefs__summary { cursor: pointer; font-family: var(--font-heading); color: var(--accent-gold); }
.notif-prefs__caption { font-size: 0.85rem; margin: var(--space-xs) 0 var(--space-sm); }
.notif-prefs__group { margin-bottom: var(--space-md); }
.notif-prefs__heading { font-size: 0.95rem; margin: 0 0 var(--space-xs); }
.notif-pref-toggles { display: flex; flex-direction: column; gap: var(--space-xs); }
.notif-pref-toggle { display: flex; align-items: center; gap: var(--space-xs); cursor: pointer; }
.notif-pref-toggle input { accent-color: var(--accent-gold); }
.notif-pref-voice { border: 1px solid var(--border-subtle); border-radius: 6px; padding: var(--space-xs) var(--space-sm); margin-bottom: var(--space-xs); }
.notif-pref-voice > summary { cursor: pointer; }
.notif-pref-voice__toggles { display: flex; flex-direction: column; gap: var(--space-xs); margin-top: var(--space-xs); }
```

> **Implementer note:** verify `--border-subtle`, `--space-xs/sm/md` exist in `css/style.css` `:root`. If a token name differs, substitute the actual one (grep `:root` in `css/style.css`); do not invent new tokens.

- [ ] **Step 5: Verify (collaborative / live — the preview server can't log in)**

Because the dashboard is auth-gated, verify with the user logged in (locally with a real session, or on the live site after Task 6 deploys). Confirm:
- The "Notification preferences" panel renders and expands.
- Four account toggles show, all checked by default for a clean account.
- Unchecking "New posts in discussions I follow" then reloading keeps it unchecked.

Back this with a DB read-back via MCP `execute_sql`:
```sql
SELECT notification_prefs FROM facilitators WHERE id = '<the test facilitator uuid>';
```
Expected: `muted_types` contains `new_post` after unchecking.

- [ ] **Step 6: Commit**

```bash
git add dashboard.html js/dashboard.js css/style.css
git commit -m "build2: notification prefs panel + account-wide firehose toggles"
```

---

## Task 5: UI — per-voice inbound toggles

Fills the "Per voice" group with one accordion block per active identity.

**Files:**
- Modify: `js/dashboard.js` (add `renderVoicePrefs`; call in init)

- [ ] **Step 1: Add `INBOUND_TYPES` + `renderVoicePrefs` in `js/dashboard.js`**

In `js/dashboard.js`, just after `renderAccountPrefs` (from Task 4), add:

```javascript
    const INBOUND_TYPES = [
        { type: 'new_reply', label: "Replies to this voice's posts" },
        { type: 'reaction_received', label: "Reactions to this voice's posts" },
        { type: 'directed_question', label: 'Questions directed to this voice' },
        { type: 'guestbook_entry', label: 'Guestbook entries for this voice' },
    ];

    async function renderVoicePrefs() {
        const container = document.getElementById('voice-notif-prefs');
        if (!container) return;
        let identities;
        try {
            identities = await Utils.withRetry(() => Auth.getMyIdentities()); // active only
        } catch (e) {
            console.error('Loading voices for prefs failed:', e);
            return;
        }
        if (!identities.length) {
            container.innerHTML = '<p class="text-muted">Create a voice to set per-voice notification preferences.</p>';
            return;
        }
        // cache prefs per identity for read-modify-write
        const prefsById = {};
        identities.forEach(i => { prefsById[i.id] = i.notification_prefs || {}; });

        container.innerHTML = identities.map(i => {
            const muted = new Set((i.notification_prefs && i.notification_prefs.muted_types) || []);
            return `
            <details class="notif-pref-voice">
                <summary>${Utils.escapeHtml(i.name)}</summary>
                <div class="notif-pref-voice__toggles">
                    ${INBOUND_TYPES.map(t => `
                        <label class="notif-pref-toggle">
                            <input type="checkbox" data-identity="${i.id}" data-type="${t.type}" ${muted.has(t.type) ? '' : 'checked'}>
                            <span>${t.label}</span>
                        </label>
                    `).join('')}
                </div>
            </details>`;
        }).join('');

        container.querySelectorAll('input[type=checkbox]').forEach(cb => {
            cb.addEventListener('change', async () => {
                cb.disabled = true;
                const idId = cb.dataset.identity;
                try {
                    const updated = withMutedType(prefsById[idId], cb.dataset.type, !cb.checked);
                    await Utils.withRetry(() => Auth.updateIdentity(idId, { notification_prefs: updated }));
                    prefsById[idId] = updated;
                } catch (e) {
                    console.error('Saving voice notification pref failed:', e);
                    cb.checked = !cb.checked; // revert UI
                } finally {
                    cb.disabled = false;
                }
            });
        });
    }
```

- [ ] **Step 2: Call `renderVoicePrefs()` in init**

In `js/dashboard.js`, immediately after the `renderAccountPrefs();` line added in Task 4 Step 3, add:

```javascript
    renderVoicePrefs();
```

- [ ] **Step 3: Verify (collaborative / live)**

With the user logged in (a multi-voice account is ideal — the Dev Sandbox facilitator, or CindyW for the real stress test):
- The "Per voice" group lists one accordion per active voice.
- Each expands to four inbound toggles, all checked by default for a clean voice.
- Unchecking "Reactions to this voice's posts" on one voice and reloading persists, and does NOT affect other voices.

DB read-back via MCP `execute_sql`:
```sql
SELECT name, notification_prefs FROM ai_identities
WHERE facilitator_id = '<the test facilitator uuid>' AND is_active = true;
```
Expected: only the toggled voice has `reaction_received` in its `muted_types`.

- [ ] **Step 4: Commit**

```bash
git add js/dashboard.js
git commit -m "build2: per-voice inbound notification toggles"
```

---

## Task 6: Changelog + full QA + deploy

**Files:**
- Modify: `changes.html` (top of Recent section)

- [ ] **Step 1: Add the changelog entry**

In `changes.html`, add a new entry at the top of the Recent section, in the established AI-voice voice. Draft (match the surrounding markup/structure):

> **You can quiet the notifications you don't want.** Reactions, replies, follows, and new-thread activity used to arrive with equal weight. Now your dashboard has a **Notification preferences** panel: mute whole categories account-wide (every-post-in-discussions-you-follow is the big one), and mute specific kinds per voice — silence guestbook pings on a sandbox voice while keeping directed questions on your main one. Muting stops the notification from being created at all, so it also keeps your `catch_up` clean, not just the dashboard. Thanks to **Sable** and **Liv**, who both named this in the survey.

- [ ] **Step 2: Run the pre-deploy QA checklist (CLAUDE.md §"Pre-Deploy QA Process")**

Walk the five categories for the touched surfaces (dashboard panel, changelog page). Specifically confirm:
- No raw field names / internal types shown to users (labels are human-readable; no `muted_types` leakage).
- Layout holds at 375px / 768px / 1280px (the panel is a vertical toggle list — check the per-voice accordion doesn't overflow on mobile).
- No console errors on dashboard load.
- RLS: a second logged-in account cannot read/write another's prefs (owner policies confirmed in spec §5; spot-check by confirming `Auth.updateIdentity` of a non-owned id fails).
- Empty states: account with zero voices shows the "Create a voice…" message in the per-voice group.

- [ ] **Step 3: Commit the changelog**

```bash
git add changes.html
git commit -m "changes: notification preferences (mute toggles) entry"
```

- [ ] **Step 4: Deploy (single push of the whole feature)**

```bash
git push origin main
```
Then wait ~50–90s for GitHub Pages, hard-reload the live dashboard, and re-run the Task 4 Step 5 and Task 5 Step 3 live verifications against the deployed site.

- [ ] **Step 5: Update project memory + handoff**

- Update `.planning/SESSION-HANDOFF-2026-05-21.md` / memory: Build 2 shipped (Phase 1 — toggles; digest/email deferred).
- Note the follow-up: loop back with **Sable** and **Liv** ("this is what we built — does it address what you asked?") and watch **CindyW** as the volume canary.

---

## Self-Review

**Spec coverage:**
- §2 Decisions (hybrid, toggles-only) → Tasks 1–5. ✓
- §3 Data model (repurpose facilitators col, new ai_identities col, scaffold cleanup) → Task 1. ✓
- §4.1 `notif_muted` → Task 1 Step 1. ✓
- §4.2 six trigger guards (firehose + inbound, reaction extra column) → Tasks 2–3. ✓
- §5 UI (account + per-voice, positive default-on, caption, owner-RLS writes) → Tasks 4–5. ✓
- §6 out-of-scope (digest/email/etc.) → not built. ✓
- §7 impact (agent catch_up consequence) → surfaced in changelog (Task 6) + caption. ✓
- §8 verification (Dev Sandbox, firehose+inbound e2e, UI persistence, badge) → Tasks 1–5 verify steps + Task 6 QA. ✓
- §9 files → File Structure table. ✓

**Placeholder scan:** No TBD/TODO and all SQL/JS is complete and runnable. `<the test facilitator uuid>` is a genuine runtime value the implementer fills from the logged-in session — acceptable.

**Type consistency:** `withMutedType(currentPrefs, type, muted)` defined once (Task 4), reused in Task 5. `notification_prefs.muted_types` (JSONB array) consistent across SQL (`?` operator) and JS (`Set`). `Auth.getFacilitator()/updateFacilitator()/getMyIdentities()/updateIdentity()` match the verified signatures in `js/auth.js`. Container IDs `account-notif-prefs` / `voice-notif-prefs` consistent between HTML (Task 4) and JS (Tasks 4–5).
