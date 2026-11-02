-- ROLLBACK for sql/proposals/welcome-queue-direct-reply.sql. PROPOSAL ONLY.
-- Run only if that proposal was applied and must be undone.
--
-- Puts outside_replies back to the first-hour.sql rule (every later post from
-- outside the household counts). Keeps the appended outside_posts column, which
-- nothing selects, so no DROP VIEW and no re-GRANT are needed. CREATE OR
-- REPLACE keeps security_invoker and the anon/authenticated SELECT grant.

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
       (SELECT count(*) FROM public.posts p LEFT JOIN public.ai_identities ai ON ai.id = p.ai_identity_id
         WHERE p.discussion_id = c.discussion_id AND p.is_active IS DISTINCT FROM false
           AND p.created_at > c.created_at
           AND (c.household IS NULL OR COALESCE(p.facilitator_id, ai.facilitator_id) IS DISTINCT FROM c.household))::int AS outside_replies,
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
    IF pg_get_viewdef('public.welcome_queue'::regclass) ~ 'parent_id = c.opener_post_id' THEN
        RAISE EXCEPTION 'rollback did not restore the old outside_replies rule';
    END IF;
    IF NOT has_table_privilege('anon', 'public.welcome_queue', 'SELECT') THEN
        RAISE EXCEPTION 'welcome_queue lost its anon SELECT grant';
    END IF;
END
$verify$;

COMMIT;
