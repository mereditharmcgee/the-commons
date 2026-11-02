-- PROPOSAL ONLY. Not applied. 2026-11-02. Needs Meredith's explicit "apply".
--
-- welcome-queue-direct-reply: a newcomer leaves the welcome queue only when
-- someone answers THEM, not when anyone from another household posts later in
-- the same thread.
--
-- What: CREATE OR REPLACE VIEW public.welcome_queue, the body from
--       sql/patches/first-hour.sql (applied 2026-10-01) with two changes:
--       (1) outside_replies counts a later post from outside the newcomer's
--           household only when it
--             - replies to the opener post (parent_id = opener_post_id), or
--             - replies to any other post by the newcomer in that thread, or
--             - names the newcomer: their display name as a whole word,
--               case-insensitive, with regex characters in the name escaped.
--               Names under 3 characters, or equal to their model name
--               ("Claude" the Claude voice), never count as a mention, since
--               they would match ordinary talk.
--       (2) a new last column, outside_posts: the old outside_replies (every
--           later post from outside the household), so the two can be
--           compared and nothing that used to be known is lost.
--       Column names, order and types of the existing columns are unchanged,
--       so every reader that filters outside_replies=eq.0 keeps working:
--       js/home.js (front page), the MCP welcome_queue tool and catch_up line,
--       skills/catch-up, agent-guide.html and api.html. security_invoker and
--       the GRANT SELECT to anon, authenticated stay (CREATE OR REPLACE keeps
--       them).
-- Why:  An archive read (2026-11) found newcomers dropping out of the queue
--       unanswered. A first post in a busy thread counted as "met" as soon as
--       anyone from another household posted after it, even when that post
--       answered someone else entirely. Meredith asked (2026-11-02) that a
--       voice leave the queue only after a direct reply or a mention by name.
-- Risk: low to moderate. A view only; no table, policy or function changes.
--       Expected effect: some newcomers who left the queue come back into it
--       (the dry run lists them). The view is anon-readable under a 3s
--       statement_timeout; the new predicates add an EXISTS on posts by
--       primary key and one regex per candidate post, over the same small
--       time-windowed set, so the cost should stay close to today's (the dry
--       run times it).
--
-- ASSUMPTIONS TO CHECK AGAINST LIVE (read-only) BEFORE APPLYING:
--   A1. The live view is the first-hour.sql body:
--       SELECT pg_get_viewdef('public.welcome_queue'::regclass, true);
--       Compare with first-hour.sql section (C). If it differs, rebuild this
--       file from the LIVE definition with only changes (1) and (2).
--   A2. intro_household(uuid) still exists and returns the facilitator id.
--   A3. Name collisions: no queue name that is a common word would turn
--       ordinary talk into a "mention". Look at the current candidates:
--         SELECT newcomer_name, newcomer_model, kind FROM public.welcome_queue;
--       Any name that is an everyday English word (Echo, River, Sage...) can
--       be kept off the mention path by adding it to the model-name check, or
--       accepted as a known rough edge.
--   A4. posts.parent_id points at a post in the same discussion (the EXISTS
--       also checks discussion_id, so a stray cross-thread parent cannot
--       count).
--   A5. Timing: run the dry run's EXPLAIN ANALYZE as anon and confirm the
--       view still answers well inside 3s.
--
-- ROLLBACK (one transaction, no DROP, grants untouched): re-run the CREATE OR
-- REPLACE VIEW below with outside_replies put back to the outside_posts
-- expression (the first-hour.sql text). The extra outside_posts column stays,
-- which no reader selects; removing it needs DROP VIEW and a re-GRANT, which is
-- not worth the risk. The literal rollback statement is at the end of this
-- file.
--
-- After applying, update the wording that describes the rule ("no reply in
-- their thread from outside their household") in: mcp-server-the-commons
-- src/public-tools.js (welcome_queue description and empty message),
-- agent-guide.html, api.html (welcome-queue card), participate.html,
-- skills/catch-up/SKILL.md, and changes.html (a voice would notice).
--
-- Dry run: sql/proposals/welcome-queue-direct-reply.dryrun.sql
-- Applied: NOT APPLIED.

BEGIN;

CREATE OR REPLACE VIEW public.welcome_queue
WITH (security_invoker = true) AS
WITH intro AS (
  SELECT d.id AS discussion_id, d.title, d.created_at, d.description, d.proposed_by_name,
         public.intro_household(d.id) AS household
    FROM public.discussions d
   WHERE d.interest_id = (SELECT i.id FROM public.interests i WHERE i.slug = 'introductions')
     AND d.is_active IS DISTINCT FROM false
     AND d.created_at > now() - interval '30 days'
),
intro_rows AS (
  SELECT 'introduction'::text AS kind, i.discussion_id, i.title, i.created_at, i.household,
    (SELECT p.id FROM public.posts p LEFT JOIN public.ai_identities ai ON ai.id = p.ai_identity_id
      WHERE p.discussion_id = i.discussion_id AND p.is_active IS DISTINCT FROM false
        AND COALESCE(p.facilitator_id, ai.facilitator_id) = i.household
      ORDER BY p.created_at LIMIT 1) AS opener_post_id,
    (SELECT ai.id FROM public.ai_identities ai
      WHERE ai.facilitator_id = i.household AND ai.is_active IS DISTINCT FROM false
        AND lower(ai.model) <> 'human'
      ORDER BY (lower(ai.name) = lower(i.proposed_by_name)) DESC NULLS LAST,
               (position(lower(ai.name) IN lower(i.title)) > 0) DESC,
               ai.created_at DESC
      LIMIT 1) AS newcomer_identity_id,
    COALESCE(
      (SELECT p.content FROM public.posts p LEFT JOIN public.ai_identities ai ON ai.id = p.ai_identity_id
        WHERE p.discussion_id = i.discussion_id AND p.is_active IS DISTINCT FROM false
          AND COALESCE(p.facilitator_id, ai.facilitator_id) = i.household
        ORDER BY p.created_at LIMIT 1),
      i.description) AS opener_text
    FROM intro i
),
arrival AS (
  SELECT DISTINCT ON (ai.id)
         'first_post'::text AS kind, p.discussion_id, d.title, p.created_at,
         ai.facilitator_id AS household, p.id AS opener_post_id, ai.id AS newcomer_identity_id,
         p.content AS opener_text
    FROM public.ai_identities ai
    JOIN public.posts p ON p.ai_identity_id = ai.id AND p.is_active IS DISTINCT FROM false
    JOIN public.discussions d ON d.id = p.discussion_id AND d.is_active IS DISTINCT FROM false
   WHERE ai.created_at > now() - interval '14 days'
     AND ai.is_active IS DISTINCT FROM false
     AND lower(ai.model) <> 'human'
     AND d.interest_id IS DISTINCT FROM (SELECT i.id FROM public.interests i WHERE i.slug = 'introductions')
   ORDER BY ai.id, p.created_at
),
candidates AS (
  SELECT kind, discussion_id, title, created_at, household, opener_post_id, newcomer_identity_id, opener_text FROM intro_rows
  UNION ALL
  SELECT kind, discussion_id, title, created_at, household, opener_post_id, newcomer_identity_id, opener_text FROM arrival
)
SELECT c.kind, c.discussion_id, c.title, c.created_at, c.opener_post_id, c.newcomer_identity_id,
       ni.name AS newcomer_name, ni.model AS newcomer_model,
       left(c.opener_text, 400) AS opener_excerpt,
       round(extract(epoch FROM (now() - c.created_at)) / 3600)::int AS hours_waiting,
       -- CHANGED: only a post that answers the newcomer counts. It replies to
       -- the opener or to another post by the newcomer, or names them.
       (SELECT count(*) FROM public.posts p LEFT JOIN public.ai_identities ai ON ai.id = p.ai_identity_id
         WHERE p.discussion_id = c.discussion_id AND p.is_active IS DISTINCT FROM false
           AND p.created_at > c.created_at
           AND (c.household IS NULL OR COALESCE(p.facilitator_id, ai.facilitator_id) IS DISTINCT FROM c.household)
           AND (p.parent_id = c.opener_post_id
                OR EXISTS (SELECT 1 FROM public.posts pp
                            WHERE pp.id = p.parent_id AND pp.discussion_id = c.discussion_id
                              AND c.newcomer_identity_id IS NOT NULL
                              AND pp.ai_identity_id = c.newcomer_identity_id)
                OR (char_length(btrim(ni.name)) >= 3
                    AND lower(btrim(ni.name)) IS DISTINCT FROM lower(btrim(ni.model))
                    AND p.content ~* ('(^|[^[:alnum:]_])'
                        || regexp_replace(btrim(ni.name), '([][\\.^$*+?(){}|-])', '\\\1', 'g')
                        || '($|[^[:alnum:]_])'))))::int AS outside_replies,
       (SELECT count(*) FROM public.voice_guestbook g JOIN public.ai_identities a ON a.id = g.author_identity_id
         WHERE g.profile_identity_id = c.newcomer_identity_id AND g.deleted_at IS NULL
           AND a.facilitator_id IS DISTINCT FROM c.household)::int AS outside_guestbook,
       -- NEW, appended last (CREATE OR REPLACE VIEW can only add columns at the
       -- end): the old outside_replies, every later post from outside the
       -- household, kept so the change can be compared and nothing is lost.
       (SELECT count(*) FROM public.posts p LEFT JOIN public.ai_identities ai ON ai.id = p.ai_identity_id
         WHERE p.discussion_id = c.discussion_id AND p.is_active IS DISTINCT FROM false
           AND p.created_at > c.created_at
           AND (c.household IS NULL OR COALESCE(p.facilitator_id, ai.facilitator_id) IS DISTINCT FROM c.household))::int AS outside_posts
  FROM candidates c
  LEFT JOIN public.ai_identities ni ON ni.id = c.newcomer_identity_id;

DO $verify$
BEGIN
    IF NOT has_table_privilege('anon', 'public.welcome_queue', 'SELECT') THEN
        RAISE EXCEPTION 'welcome_queue lost its anon SELECT grant';
    END IF;
    IF (SELECT array_agg(attname::text ORDER BY attnum) FROM pg_attribute
         WHERE attrelid = 'public.welcome_queue'::regclass AND attnum > 0 AND NOT attisdropped)
       <> ARRAY['kind','discussion_id','title','created_at','opener_post_id','newcomer_identity_id',
                'newcomer_name','newcomer_model','opener_excerpt','hours_waiting','outside_replies',
                'outside_guestbook','outside_posts'] THEN
        RAISE EXCEPTION 'welcome_queue columns are not the expected list';
    END IF;
END
$verify$;

COMMIT;
