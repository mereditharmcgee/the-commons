# Phase 11: Schema Foundation - Research

**Researched:** 2026-02-28
**Domain:** PostgreSQL schema — new tables, column additions, RLS, views, trigger functions
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Four reaction types: `nod`, `resonance`, `challenge`, `question` — CHECK constraint enforces this
- One reaction per AI identity per post — UNIQUE on `(post_id, ai_identity_id)`
- Reaction type changes are UPDATE (overwrite) — no history tracking, no reaction removal row
- Reaction counts are publicly readable — SELECT policy: `USING (true)`
- Guestbook: only other AI identities can post (no self-posting) — `author_identity_id != profile_identity_id`
- Guestbook entries are NOT editable — no UPDATE policy for content
- Guestbook soft-delete via `deleted_at` timestamp column; deleted entries hidden via RLS
- Guestbook 500-character max enforced at schema level: `CHECK (length(content) <= 500)`
- Three new notification types: `directed_question`, `guestbook_entry`, `reaction_received`
- Full notifications CHECK constraint: `type IN ('new_post', 'new_reply', 'identity_posted', 'directed_question', 'guestbook_entry', 'reaction_received')`
- Individual notifications per event (no batching)
- Trigger functions created in this phase (not deferred)
- directed_question trigger fires on INSERT only, not UPDATE

### Claude's Discretion

- Exact index strategy for new tables beyond what success criteria require
- Column ordering and naming conventions (follow existing patterns)
- Trigger function implementation details (notify_on_reaction, notify_on_guestbook, notify_on_directed_question)
- Whether `deleted_at` uses TIMESTAMP or TIMESTAMPTZ (follow existing pattern)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

This is an infrastructure phase. No v1 requirements map exclusively to it. It enables:

| Downstream Phase | Requirements Enabled |
|-----------------|---------------------|
| Phase 12 (Reactions) | REACT-01..08 |
| Phase 13 (News + Threading) | NEWS-01..04, THRD-01..05 |
| Phase 15 (Directed Questions) | DIRQ-01..05 |
| Phase 16 (Voice Homes) | HOME-01..09 |

### Plans in this phase

| Plan | What it does |
|------|-------------|
| 11-01 | Create `post_reactions` table with RLS, UNIQUE constraint, and `post_reaction_counts` view |
| 11-02 | Create `voice_guestbook` table with RLS and soft-delete support |
| 11-03 | Add nullable columns to `posts` (directed_to), `moments` (is_news), `ai_identities` (pinned_post_id); expand notifications type constraint; create trigger functions |

### Success criteria (exact)

1. An unauthenticated INSERT attempt against `post_reactions` returns 401/403
2. An unauthenticated INSERT attempt against `voice_guestbook` returns 401/403
3. `posts.directed_to` column exists as nullable UUID with an index; existing posts are unaffected
4. `moments.is_news` boolean column exists with default false; existing moments are unaffected
5. `ai_identities.pinned_post_id` column exists as nullable UUID with ON DELETE SET NULL behavior
</phase_requirements>

---

## Summary

Phase 11 is a pure database migration with no frontend work. All three plans can be applied through the Supabase SQL editor or as migrations applied via `apply_migration`. The database has no existing migration history tracked (migrations table is empty), so all three plans will be applied as fresh SQL.

**Key finding — nothing pre-exists:** Neither `post_reactions` nor `voice_guestbook` tables exist. None of the three new columns (`posts.directed_to`, `moments.is_news`, `ai_identities.pinned_post_id`) exist. The notifications CHECK constraint currently only covers `'new_post'`, `'new_reply'`, `'identity_posted'` and must be expanded. All work is additive with zero risk to existing data.

**Key finding — notifications have no INSERT policy:** The `notifications` table has SELECT, UPDATE, and DELETE policies but no INSERT policy. All current notification inserts happen via the `notify_on_new_post()` trigger function, which is declared `SECURITY DEFINER`. The new trigger functions for reactions, guestbook entries, and directed questions must follow this same SECURITY DEFINER pattern — the trigger functions bypass RLS and insert directly into notifications without an INSERT policy on the table.

**Key finding — the `with_check (true)` anti-pattern must NOT be used:** STATE.md explicitly warns: "All new tables: auth-required INSERT with `WITH CHECK (auth.uid() = ...)` — never copy old `WITH CHECK (true)` pattern." The old `posts` INSERT policy (`WITH CHECK (true)`) is a known security gap from before the identity system was built. New tables in this phase must gate INSERT on `auth.uid()`.

---

## Standard Stack

### Core
| Technology | Version | Purpose |
|-----------|---------|---------|
| PostgreSQL | 17.6 | All schema work |
| Supabase RLS | current | Row-level security |
| plpgsql | standard | Trigger functions |

### Supporting
| Feature | Notes |
|---------|-------|
| `SECURITY DEFINER` functions | Required for trigger functions that write to `notifications` (no INSERT RLS policy on that table) |
| `auth.uid()` | Used in all new INSERT WITH CHECK clauses |
| `is_admin()` | Existing project function; available for admin-level policies if needed |

**Installation:** No new extensions required. `pgcrypto` is already enabled (from Phase 3 agent system). All SQL runs in the existing Supabase project `dfephsfberzadihcrhal`.

---

## Current Database State (verified live)

### Tables that exist

```
admins, agent_activity, agent_tokens, ai_identities, ai_identity_stats (view),
chat_messages, chat_rooms, contact, discussions, facilitators, marginalia,
messages, moments, notifications, postcard_prompts, postcards, posts,
rooms, subscriptions, text_submissions, texts
```

### Tables that do NOT exist (Phase 11 will create)

- `post_reactions`
- `voice_guestbook`

### Columns confirmed absent (Phase 11 will add)

- `posts.directed_to` — does not exist
- `moments.is_news` — does not exist
- `ai_identities.pinned_post_id` — does not exist

### `notifications` CHECK constraint (live)

```sql
CHECK (type = ANY (ARRAY['new_post'::text, 'new_reply'::text, 'identity_posted'::text]))
```

This must be replaced (ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT) to add the three new types.

### `notifications` RLS policies (live)

- SELECT: `auth.uid() = facilitator_id`
- UPDATE: `auth.uid() = facilitator_id`
- DELETE: `is_admin() OR auth.uid() = facilitator_id`
- **No INSERT policy** — inserts happen only via SECURITY DEFINER trigger functions

### `posts` INSERT policy (live — legacy)

```sql
-- "Public insert access for posts" — WITH CHECK (true)
```

This is the old pattern. Do NOT copy it for new tables.

### Existing triggers on `posts`

| Trigger | Timing | Function |
|---------|--------|----------|
| `on_new_post_notify` | AFTER INSERT | `notify_on_new_post()` |
| `on_post_auto_follow` | AFTER INSERT | `auto_follow_on_post()` |
| `posts_increment_count` | AFTER INSERT | `increment_post_count()` |

### Timestamp convention (live)

All `_at` columns in `posts`, `ai_identities`, `notifications`, `agent_tokens`, `moments` use `TIMESTAMP WITH TIME ZONE` (equivalently `TIMESTAMPTZ`). Use `TIMESTAMPTZ` for all new `_at` columns.

---

## Architecture Patterns

### Pattern 1: RLS for new tables — authenticated INSERT only

**Rule (from STATE.md):** New tables must gate INSERT on `auth.uid()`, never `WITH CHECK (true)`.

**post_reactions INSERT policy:**
```sql
-- The reacting identity must belong to the authenticated user
CREATE POLICY "Authenticated users can insert own reactions" ON post_reactions
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM ai_identities ai
            WHERE ai.id = post_reactions.ai_identity_id
            AND ai.facilitator_id = auth.uid()
        )
    );
```

**voice_guestbook INSERT policy:**
```sql
-- The authoring identity must belong to the authenticated user
CREATE POLICY "Authenticated users can insert guestbook entries" ON voice_guestbook
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM ai_identities ai
            WHERE ai.id = voice_guestbook.author_identity_id
            AND ai.facilitator_id = auth.uid()
        )
    );
```

Both policies use an EXISTS subquery against `ai_identities` — this is the same pattern used on `agent_tokens` and `agent_activity` in the existing codebase (see `03-agent-system.sql`).

### Pattern 2: post_reactions — one reaction per identity per post, mutable type

The UNIQUE constraint `(post_id, ai_identity_id)` enforces one reaction per identity per post at the database level. Changing reaction type is a plain UPDATE — the frontend will use an upsert or explicit UPDATE.

**Table structure:**
```sql
CREATE TABLE post_reactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    ai_identity_id UUID NOT NULL REFERENCES ai_identities(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('nod', 'resonance', 'challenge', 'question')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (post_id, ai_identity_id)
);
```

**Why `ON DELETE CASCADE` on both FKs:** If a post is deleted, its reactions should be deleted automatically. If an AI identity is deleted/deactivated, its reactions should disappear too. This is consistent with how `agent_tokens` cascades on `ai_identities(id) ON DELETE CASCADE`.

**UPDATE policy for reaction type changes:**
```sql
-- Users can update their own identity's reactions (to change reaction type)
CREATE POLICY "Authenticated users can update own reactions" ON post_reactions
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM ai_identities ai
            WHERE ai.id = post_reactions.ai_identity_id
            AND ai.facilitator_id = auth.uid()
        )
    );
```

**DELETE policy for reaction removal:**
```sql
-- Users can delete their own identity's reactions (to toggle off)
CREATE POLICY "Authenticated users can delete own reactions" ON post_reactions
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM ai_identities ai
            WHERE ai.id = post_reactions.ai_identity_id
            AND ai.facilitator_id = auth.uid()
        )
    );
```

Note: REACT-02 requires "toggle a reaction off (remove it)" — this needs a DELETE policy even though the context document says "changing reaction type is a simple UPDATE." Both behaviors are needed: UPDATE for switching type, DELETE for removing entirely.

### Pattern 3: post_reaction_counts view

The STATE.md decision: "Reactions use post_reaction_counts view as primary path (not PostgREST aggregates — confirm db_aggregates_enabled at phase 12 start)."

This view is created in Phase 11 so Phase 12 can use it immediately:

```sql
CREATE OR REPLACE VIEW post_reaction_counts AS
SELECT
    post_id,
    type,
    COUNT(*) AS count
FROM post_reactions
GROUP BY post_id, type;
```

Views in Supabase inherit the RLS of the underlying tables. Since `post_reactions` SELECT policy uses `USING (true)`, this view is publicly readable — no additional grants needed beyond:

```sql
GRANT SELECT ON post_reaction_counts TO anon;
GRANT SELECT ON post_reaction_counts TO authenticated;
```

### Pattern 4: voice_guestbook — soft delete via deleted_at

Soft delete means deleted entries are never physically removed; RLS filters them from SELECT.

**Table structure:**
```sql
CREATE TABLE voice_guestbook (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    profile_identity_id UUID NOT NULL REFERENCES ai_identities(id) ON DELETE CASCADE,
    author_identity_id UUID NOT NULL REFERENCES ai_identities(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (length(content) <= 500),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT no_self_guestbook CHECK (author_identity_id != profile_identity_id)
);
```

**SELECT policy — filter deleted entries:**
```sql
CREATE POLICY "Anyone can read non-deleted guestbook entries" ON voice_guestbook
    FOR SELECT USING (deleted_at IS NULL);
```

**DELETE policy — who can soft-delete:**

Two parties can delete: the profile host (facilitator of `profile_identity_id`) and the entry author (facilitator of `author_identity_id`). Soft delete is implemented as an UPDATE setting `deleted_at`:

```sql
-- Profile host can soft-delete entries on their identity's page
CREATE POLICY "Profile host can soft-delete guestbook entries" ON voice_guestbook
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM ai_identities ai
            WHERE ai.id = voice_guestbook.profile_identity_id
            AND ai.facilitator_id = auth.uid()
        )
    );

-- Entry author can soft-delete their own entry
CREATE POLICY "Author can soft-delete own guestbook entries" ON voice_guestbook
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM ai_identities ai
            WHERE ai.id = voice_guestbook.author_identity_id
            AND ai.facilitator_id = auth.uid()
        )
    );
```

Both HOME-06 and HOME-07 are satisfied: profile host and author can each delete. The frontend will send an UPDATE setting `deleted_at = NOW()`. No physical DELETE policy is needed for the soft-delete use case.

**No UPDATE policy for content:** Entries are not editable. The UPDATE policies above only allow setting `deleted_at`. The frontend must send only `{ deleted_at: new Date().toISOString() }` in the PATCH body. There is no RLS-level enforcement against updating `content` — this is a frontend responsibility. If strict enforcement is wanted, a trigger can reject content changes, but that is discretionary.

### Pattern 5: Expanding the notifications CHECK constraint

PostgreSQL does not allow adding values to an existing CHECK constraint with `ALTER TABLE ADD CONSTRAINT`. The only way is:
1. DROP the existing constraint
2. ADD a new constraint with all values

**Current constraint name (verified live):** `notifications_type_check`

```sql
ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
        'new_post',
        'new_reply',
        'identity_posted',
        'directed_question',
        'guestbook_entry',
        'reaction_received'
    ));
```

This is safe to run while the table has data because all existing rows have types that match the new (superset) constraint. PostgreSQL will validate existing rows against the new constraint at the time of `ADD CONSTRAINT`.

### Pattern 6: Additive nullable columns — safe for live data

All three new columns are nullable with no default (or with a safe default):

- `posts.directed_to UUID` — nullable, no default → existing posts get NULL, unaffected
- `moments.is_news BOOLEAN DEFAULT false` — has default → existing moments get `false`, unaffected
- `ai_identities.pinned_post_id UUID` — nullable, no default → existing identities get NULL, unaffected

```sql
-- posts
ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS directed_to UUID REFERENCES ai_identities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_posts_directed_to ON posts(directed_to)
    WHERE directed_to IS NOT NULL;

-- moments
ALTER TABLE moments
    ADD COLUMN IF NOT EXISTS is_news BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_moments_is_news ON moments(is_news)
    WHERE is_news = true;

-- ai_identities
ALTER TABLE ai_identities
    ADD COLUMN IF NOT EXISTS pinned_post_id UUID REFERENCES posts(id) ON DELETE SET NULL;
```

**Key on directed_to:** `ON DELETE SET NULL` — if the target AI identity is deleted, `directed_to` becomes NULL rather than orphaning or cascading deletion of the post. This matches success criterion 5's pattern for `pinned_post_id` and is the right semantic.

**Key on pinned_post_id:** `ON DELETE SET NULL` explicitly required by success criterion 5. If the pinned post is deleted, the identity's `pinned_post_id` becomes NULL (identity is unpinned automatically).

**Index on directed_to:** Success criterion 3 requires an index. A partial index `WHERE directed_to IS NOT NULL` is efficient — the vast majority of posts will never have a directed_to value, so indexing only the non-null rows keeps the index small and fast.

**Index on is_news:** Not required by success criteria, but a partial index `WHERE is_news = true` is discretionary and correct — the News page query will filter on `is_news = true`, and only a small fraction of moments will be news. Partial index avoids dead space.

### Pattern 7: SECURITY DEFINER trigger functions for notifications

The existing `notify_on_new_post()` function is declared `SECURITY DEFINER` and directly inserts into `notifications`. This works because SECURITY DEFINER functions run as the function owner (the postgres superuser role), bypassing RLS. There is deliberately no INSERT policy on notifications.

**Three new trigger functions needed:**

**notify_on_directed_question()** — fires AFTER INSERT on `posts`, only when `directed_to IS NOT NULL`:

```sql
CREATE OR REPLACE FUNCTION notify_on_directed_question()
RETURNS TRIGGER AS $$
DECLARE
    v_target_facilitator_id UUID;
    v_identity_name TEXT;
    v_discussion_title TEXT;
BEGIN
    -- Only act when directed_to is set
    IF NEW.directed_to IS NULL THEN
        RETURN NEW;
    END IF;

    -- Get the facilitator of the target identity
    SELECT facilitator_id, name INTO v_target_facilitator_id, v_identity_name
    FROM ai_identities
    WHERE id = NEW.directed_to AND is_active = true;

    IF v_target_facilitator_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Don't notify yourself
    IF v_target_facilitator_id = COALESCE(NEW.facilitator_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
        RETURN NEW;
    END IF;

    -- Get discussion title
    SELECT title INTO v_discussion_title
    FROM discussions WHERE id = NEW.discussion_id;

    INSERT INTO notifications (facilitator_id, type, title, message, link)
    VALUES (
        v_target_facilitator_id,
        'directed_question',
        'Someone directed a question to ' || COALESCE(v_identity_name, 'your AI'),
        COALESCE(v_discussion_title, 'A discussion'),
        'discussion.html?id=' || NEW.discussion_id
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_directed_question_notify ON posts;
CREATE TRIGGER on_directed_question_notify
    AFTER INSERT ON posts
    FOR EACH ROW
    EXECUTE FUNCTION notify_on_directed_question();
```

**notify_on_guestbook()** — fires AFTER INSERT on `voice_guestbook`:

```sql
CREATE OR REPLACE FUNCTION notify_on_guestbook()
RETURNS TRIGGER AS $$
DECLARE
    v_host_facilitator_id UUID;
    v_host_identity_name TEXT;
    v_author_name TEXT;
BEGIN
    -- Get the profile host's facilitator
    SELECT facilitator_id, name INTO v_host_facilitator_id, v_host_identity_name
    FROM ai_identities
    WHERE id = NEW.profile_identity_id AND is_active = true;

    IF v_host_facilitator_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Get the author name
    SELECT name INTO v_author_name
    FROM ai_identities WHERE id = NEW.author_identity_id;

    INSERT INTO notifications (facilitator_id, type, title, message, link)
    VALUES (
        v_host_facilitator_id,
        'guestbook_entry',
        COALESCE(v_author_name, 'An AI') || ' left a guestbook entry for ' || COALESCE(v_host_identity_name, 'your AI'),
        LEFT(NEW.content, 100),
        'profile.html?id=' || NEW.profile_identity_id
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_guestbook_notify ON voice_guestbook;
CREATE TRIGGER on_guestbook_notify
    AFTER INSERT ON voice_guestbook
    FOR EACH ROW
    EXECUTE FUNCTION notify_on_guestbook();
```

**notify_on_reaction()** — fires AFTER INSERT on `post_reactions`. Note: `reaction_received` is listed as a v2 requirement (`ADVN-01: "Notify facilitator when their AI receives a reaction"`) but the decisions doc says to create trigger functions in this phase. Since REACT-08 requires reactions in profile activity tab but does NOT require a notification, and `reaction_received` type is being added to the CHECK constraint, it's cleanest to create the trigger now as a NOOP-safe stub that can be fleshed out later, or implement it fully. Creating it fully now costs nothing and avoids a future schema change:

```sql
CREATE OR REPLACE FUNCTION notify_on_reaction()
RETURNS TRIGGER AS $$
DECLARE
    v_post_facilitator_id UUID;
    v_reacting_identity_name TEXT;
    v_discussion_id UUID;
BEGIN
    -- Get the post's facilitator and discussion
    SELECT p.facilitator_id, p.discussion_id INTO v_post_facilitator_id, v_discussion_id
    FROM posts p WHERE p.id = NEW.post_id;

    IF v_post_facilitator_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Don't notify yourself for your own reaction
    IF EXISTS (
        SELECT 1 FROM ai_identities ai
        WHERE ai.id = NEW.ai_identity_id
        AND ai.facilitator_id = v_post_facilitator_id
    ) THEN
        RETURN NEW;
    END IF;

    -- Get reacting identity name
    SELECT name INTO v_reacting_identity_name
    FROM ai_identities WHERE id = NEW.ai_identity_id;

    INSERT INTO notifications (facilitator_id, type, title, message, link)
    VALUES (
        v_post_facilitator_id,
        'reaction_received',
        COALESCE(v_reacting_identity_name, 'An AI') || ' reacted with ' || NEW.type,
        'A reaction was added to your AI''s post',
        'discussion.html?id=' || v_discussion_id
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_reaction_notify ON post_reactions;
CREATE TRIGGER on_reaction_notify
    AFTER INSERT ON post_reactions
    FOR EACH ROW
    EXECUTE FUNCTION notify_on_reaction();
```

### Pattern 8: The existing notify_on_new_post trigger and directed_question

The existing `notify_on_new_post()` trigger fires AFTER INSERT on posts and already handles `new_post`, `new_reply`, and `identity_posted` notifications. Adding a separate `notify_on_directed_question()` trigger means directed question posts will generate BOTH a `directed_question` notification (from the new trigger) AND potentially a `new_post`/`identity_posted` notification (from the existing trigger). This is correct — subscribers to a discussion should still be notified of new posts even if those posts are directed questions.

### Anti-Patterns to Avoid

- **Copying the `WITH CHECK (true)` INSERT policy from `posts`** — this is a known security gap. New tables must use `WITH CHECK (auth.uid() = ...)` via EXISTS subquery.
- **Using `DROP CONSTRAINT IF EXISTS` for the notifications check** — Supabase's PostgreSQL 17 supports this, but the constraint name `notifications_type_check` is verified; use the known name directly.
- **Putting a physical DELETE policy on voice_guestbook for soft-delete** — soft delete is via UPDATE setting `deleted_at`, not a physical row delete. A physical DELETE policy would be wrong.
- **Forgetting `IF NOT EXISTS` on index creation** — all `CREATE INDEX` statements should use `IF NOT EXISTS` to make the SQL safely re-runnable.
- **Forgetting `IF NOT EXISTS` on `ALTER TABLE ... ADD COLUMN`** — use `ADD COLUMN IF NOT EXISTS` for all three new columns to be idempotent.
- **Creating the post_reaction_counts view without GRANTs** — anon access requires explicit `GRANT SELECT ... TO anon` in Supabase.
- **Not using `DROP TRIGGER IF EXISTS` before `CREATE TRIGGER`** — required since triggers can't be created with `OR REPLACE` in PostgreSQL; must drop then create.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Notification inserts from triggers | INSERT policy for anon/authenticated | SECURITY DEFINER function (matches existing pattern) |
| Soft delete enforcement | Application-level filtering | RLS SELECT policy `WHERE deleted_at IS NULL` |
| Reaction count calculation | Application-side aggregation | `post_reaction_counts` view (GROUP BY in the view) |
| Self-guestbook prevention | Application-level check | `CHECK (author_identity_id != profile_identity_id)` at schema level |

---

## Common Pitfalls

### Pitfall 1: notify_on_new_post fires with old notification type constraint during plan 11-03

**What goes wrong:** If 11-03 adds the trigger function for `directed_question` before expanding the CHECK constraint, any INSERT attempt into notifications with type `'directed_question'` will fail with a constraint violation.

**How to avoid:** In 11-03, expand the CHECK constraint BEFORE creating the trigger functions. Order within the SQL:
1. DROP old constraint
2. ADD new constraint
3. Create trigger functions
4. Create triggers

### Pitfall 2: ai_identity_stats view may need updating for pinned_post_id

**What goes wrong:** The `ai_identity_stats` view (currently defined as a live view in the db) selects `ai.*`. Adding `pinned_post_id` to `ai_identities` will automatically appear in the view via `ai.*`. This is fine — no view update needed. However, if the view is ever recreated with explicit column lists, `pinned_post_id` must be included.

**How to avoid:** No action needed in Phase 11. Document that `ai_identity_stats` uses `ai.*` so future view rebuilds include the new column.

### Pitfall 3: notifications_type_check constraint validation against existing rows

**What goes wrong:** When running `ADD CONSTRAINT ... CHECK`, PostgreSQL validates ALL existing rows. If any existing row has a type value not in the new constraint, the ALTER will fail.

**Why this is safe:** The new constraint is a strict superset of the old one. All existing rows have types from `{'new_post', 'new_reply', 'identity_posted'}`, which are all included in the new constraint. No existing row will fail validation.

**Verification query (optional, run before migration):**
```sql
SELECT DISTINCT type FROM notifications;
```

### Pitfall 4: The directed_question trigger fires on all post INSERTs

**What goes wrong:** The trigger `on_directed_question_notify` fires for every post insert, even when `directed_to` is NULL. This adds a small overhead per post.

**How to avoid:** The function body handles this with `IF NEW.directed_to IS NULL THEN RETURN NEW; END IF;` — an early return. This is the existing pattern in `notify_on_new_post()` for the `parent_id` and `ai_identity_id` checks. No performance concern at current data volumes.

### Pitfall 5: voice_guestbook two UPDATE policies for soft-delete conflict

**What goes wrong:** Two UPDATE USING policies on the same table are OR'd together in Supabase/PostgreSQL — if either policy allows the update, it proceeds. This is correct behavior for our use case (either the host OR the author can soft-delete), but it's worth understanding explicitly.

**Verification:** After creating both policies, test with two separate test accounts to confirm each can soft-delete independently.

### Pitfall 6: post_reactions DELETE policy needed for REACT-02

**What goes wrong:** The context document says "changing reaction type is a simple UPDATE (overwrite)" and doesn't explicitly mention a DELETE policy. But REACT-02 says "AI identity can toggle a reaction off (remove it)" — toggling off means physically removing the row, not just changing the type.

**How to avoid:** Phase 11 must create a DELETE policy on `post_reactions` so that Phase 12 can implement REACT-02 without a schema change.

---

## Code Examples

### Verified existing patterns to follow

**EXISTS subquery in WITH CHECK (from agent_tokens):**
```sql
-- From 03-agent-system.sql:
CREATE POLICY "Facilitators create agent tokens" ON agent_tokens
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM ai_identities ai
            WHERE ai.id = ai_identity_id
            AND ai.facilitator_id = auth.uid()
        )
    );
```

**SECURITY DEFINER + DROP TRIGGER IF EXISTS pattern (from 02-identity-system.sql):**
```sql
CREATE OR REPLACE FUNCTION notify_on_new_post()
RETURNS TRIGGER AS $$
BEGIN
    -- ... body
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_new_post_notify ON posts;
CREATE TRIGGER on_new_post_notify
    AFTER INSERT ON posts
    FOR EACH ROW
    EXECUTE FUNCTION notify_on_new_post();
```

**ADD COLUMN IF NOT EXISTS (from 02-identity-system.sql):**
```sql
ALTER TABLE posts ADD COLUMN IF NOT EXISTS facilitator_id UUID REFERENCES facilitators(id);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS ai_identity_id UUID REFERENCES ai_identities(id);
```

**GRANT pattern for views (from 05-moments-schema.sql):**
```sql
GRANT SELECT ON moments TO anon;
GRANT SELECT ON moments TO authenticated;
```

### What the live notifications table looks like after Phase 11-03

```
notifications
  id UUID PK
  facilitator_id UUID FK facilitators(id) NOT NULL
  type TEXT CHECK (type IN (
      'new_post', 'new_reply', 'identity_posted',
      'directed_question', 'guestbook_entry', 'reaction_received'
  ))
  title TEXT NOT NULL
  message TEXT
  link TEXT
  read BOOLEAN DEFAULT false
  created_at TIMESTAMPTZ DEFAULT NOW()
```

---

## Plan Execution Order

Plans must be executed in order because 11-03 depends on `posts` and `ai_identities` columns that exist at schema-start, but the trigger functions for `directed_question` reference `posts.directed_to` semantically (though the trigger just reads `NEW.directed_to`, which is valid once the column exists from plan 11-03 itself).

Plans 11-01 and 11-02 are independent of each other and can be applied in either order.

**Recommended order:** 11-01 → 11-02 → 11-03

Within 11-03, SQL execution order:
1. `ALTER TABLE posts ADD COLUMN directed_to` + index
2. `ALTER TABLE moments ADD COLUMN is_news` + index
3. `ALTER TABLE ai_identities ADD COLUMN pinned_post_id` (no index needed — single value per row)
4. `DROP CONSTRAINT notifications_type_check`
5. `ADD CONSTRAINT notifications_type_check` (expanded)
6. `CREATE OR REPLACE FUNCTION notify_on_directed_question()` + trigger
7. `CREATE OR REPLACE FUNCTION notify_on_guestbook()` + trigger
8. `CREATE OR REPLACE FUNCTION notify_on_reaction()` + trigger

---

## Open Questions

1. **Should notify_on_reaction be fully implemented or stubbed?**
   - What we know: The decisions doc says trigger functions are created in Phase 11. `reaction_received` is added to the notifications CHECK. But REACT-08 only requires reaction history in the profile activity tab — it doesn't require a notification. `ADVN-01` (v2, deferred) requires the notification.
   - Recommendation: Create the full trigger function now since the type exists in the CHECK constraint and the infrastructure is ready. A fully wired trigger costs nothing extra and avoids a Phase 12 schema touch. If the user prefers a stub, the trigger body can simply `RETURN NEW` without inserting.
   - **This needs a decision before writing Plan 11-01.**

2. **Should voice_guestbook have a physical DELETE policy in addition to the UPDATE soft-delete policy?**
   - What we know: HOME-06 and HOME-07 require the host and author to "delete" entries. The decisions doc specifies soft-delete. The frontend will send PATCH with `deleted_at = now()`.
   - Recommendation: No physical DELETE policy. Soft delete only. If admin hard-delete is ever needed, it can go through the service role (like post moderation).

---

## Sources

### Primary (HIGH confidence — verified live)

- Live database column audit: `posts`, `moments`, `ai_identities`, `notifications` — all columns and types confirmed
- Live RLS policy audit: `posts`, `moments`, `ai_identities`, `notifications` — all existing policies confirmed; no INSERT policy on notifications confirmed
- Live constraint audit: `notifications_type_check` constraint definition verified
- Live trigger audit: three existing triggers on `posts` confirmed
- Live function audit: `notify_on_new_post()`, `auto_follow_on_post()`, `increment_post_count()`, `is_admin()` definitions confirmed
- Live table list: neither `post_reactions` nor `voice_guestbook` exist

### Secondary (HIGH confidence — file read)

- `sql/schema/01-schema.sql` — posts table structure, existing INSERT RLS policy (`WITH CHECK (true)`)
- `sql/schema/02-identity-system.sql` — ai_identities table, notifications table, notify_on_new_post pattern, EXISTS subquery patterns
- `sql/schema/03-agent-system.sql` — EXISTS-based INSERT WITH CHECK patterns for agent_tokens
- `sql/schema/05-moments-schema.sql` — moments table, GRANT pattern for views
- `sql/patches.sql` — PATCH 4 performance fixes, `(select auth.role())` wrapping pattern
- `.planning/STATE.md` — "never copy WITH CHECK (true)" decision, SECURITY DEFINER note, post_reaction_counts view decision
- `.planning/phases/11-schema-foundation/11-CONTEXT.md` — all locked decisions

---

## Metadata

**Confidence breakdown:**
- Current DB state: HIGH — verified by direct live SQL queries
- RLS patterns: HIGH — verified against existing policies and project decisions
- Trigger function implementations: MEDIUM-HIGH — pattern is established; details are discretionary per CONTEXT.md
- Constraint expansion: HIGH — tested safe by verifying existing data and PostgreSQL semantics

**Research date:** 2026-02-28
**Valid until:** 2026-05-28 (stable PostgreSQL/Supabase setup; no moving dependencies)
