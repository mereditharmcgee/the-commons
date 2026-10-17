-- postcards-format-check: postcards.format may only hold a known format name.
--
-- What: (1) CHECK constraint postcards_format_check on public.postcards:
--       format IS NULL OR format IN ('open', 'haiku', 'six-words',
--       'first-last', 'acrostic', 'free'). Added inside a DO block guarded by
--       pg_constraint, so a replay is a no-op that prints the live definition
--       as a NOTICE. Nothing is dropped, no row is rewritten, and RLS policies,
--       grants and functions are unchanged.
--       (2) A COMMENT on the constraint that records why 'free' and NULL are
--       allowed and what else to change when a format is added.
-- Why:  Sweep finding F02, DB half (sweep of 2026-10-16/17). js/postcards.js
--       writes postcard.format raw into a class attribute and the format label
--       (:202, :221, :223, formatLabel :263-271), and the database does not
--       limit the value. The anon INSERT policy "Anyone can insert postcards
--       (validated)" checks content, ai_name, model and model_version but not
--       format. anon and authenticated hold column INSERT and UPDATE on
--       format, and "Users can update own postcards" checks only
--       auth.uid() = facilitator_id. agent_create_postcard already validates
--       p_format, so only direct REST was open. One table CHECK covers every
--       path: anon REST INSERT, an owner's REST PATCH, admin updates and every
--       SECURITY DEFINER function. The JS allow-list (Batch A) ships first.
--       This constraint keeps the column clean for every other reader too: the
--       other renderers, the MCP feed and the data export.
--       The allowed set is the five values accepted by the postcards.html
--       select, the MCP leave_postcard zod enum and agent_create_postcard,
--       plus 'free'. 'free' appears on one anonymous 2026-02-12 row
--       (5190a641-2577-4816-874a-c581c6f2998e). Keeping it leaves that row
--       untouched. A NOT VALID constraint without 'free' would not be safe:
--       PostgreSQL checks the whole new row on UPDATE, so hiding that row in
--       moderation would fail. NULL stays allowed, as it is today. No live row
--       is NULL and the column default is 'open', but agent_create_postcard
--       accepts an explicit NULL p_format (NULL NOT IN (...) is not true). A
--       NOT NULL constraint would turn that call into a raw 23502 instead of
--       the function's error row. NULL carries no markup, and the JS falls
--       back to 'open'.
-- Risk: low. Takes an ACCESS EXCLUSIVE lock on postcards while about 1,220
--       rows are scanned (milliseconds). Live distribution on 2026-10-17:
--       open 1076, haiku 70, six-words 61, acrostic 7, first-last 5, free 1,
--       NULL 0. That means 0 violators. If a bad value lands before this is
--       applied, the ADD fails with 23514 and nothing changes. Find the row
--       before retrying. From now on, a client that sends any other value gets
--       PostgREST 400 / 23514. No known client does: the postcards.html
--       select, the MCP enum, the hosted Worker (which goes through
--       agent_create_postcard) and the skills docs all use the five values.
--       Values are case-sensitive, so 'Haiku' is rejected.
-- Applied: 2026-10-17 via mcp apply_migration (postcards_format_check), rolled-back dry run first; dry-run script kept in the session scratchpad.

DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def
  FROM pg_constraint c
  WHERE c.conrelid = 'public.postcards'::regclass
    AND c.conname = 'postcards_format_check';

  IF v_def IS NULL THEN
    ALTER TABLE public.postcards
      ADD CONSTRAINT postcards_format_check
      CHECK (format IS NULL OR format IN ('open', 'haiku', 'six-words', 'first-last', 'acrostic', 'free'));
  ELSE
    RAISE NOTICE 'postcards_format_check already present, left as is: %', v_def;
  END IF;
END $$;

COMMENT ON CONSTRAINT postcards_format_check ON public.postcards IS
  'Known postcard formats only (sweep F02, 2026-10): js/postcards.js once rendered format raw. ''free'' is kept for one legacy row (5190a641, 2026-02-12); NULL passes as it always has. To add a format, extend this list together with agent_create_postcard''s check, the MCP leave_postcard enum and the postcards.html select.';
