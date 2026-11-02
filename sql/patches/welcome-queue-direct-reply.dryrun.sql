-- welcome-queue-direct-reply.dryrun.sql: rolled-back rehearsal of
-- welcome-queue-direct-reply.sql. It changes nothing; never record it as
-- applied.
--
-- Run the whole file as one script (Supabase SQL editor, or execute_sql). It
-- always ends in an error on purpose, so nothing commits even if the closing
-- ROLLBACK is never reached:
--   DRYRUN PASS ...  every check held; the message carries the counts, and a
--                    NOTICE line names each newcomer who would come back into
--                    the queue.
--   DRYRUN FAIL ...  one did not; the values say which.
--
-- The checks:
--   (a) The same candidates, in the same number, before and after: the change
--       touches a count, never who is a candidate.
--   (b) For every row, new outside_replies <= outside_posts, and outside_posts
--       equals the old outside_replies. Nobody can leave the queue because of
--       this change; some may come back.
--   (c) Who comes back: old outside_replies > 0, new = 0. Listed by NOTICE
--       (name, model, kind, hours waiting) and counted.
--   (d) As anon, the front page's own query (outside_replies=eq.0, oldest
--       first, limit 50) runs in under 3 seconds.
-- The view body below is copied from the proposal unchanged.

BEGIN;

CREATE TEMP TABLE wq_before ON COMMIT DROP AS
SELECT kind, discussion_id, newcomer_identity_id, newcomer_name, newcomer_model, hours_waiting, outside_replies
  FROM public.welcome_queue;

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

DO $dryrun$
DECLARE
    v_before int; v_after int; v_bad int; v_back int; v_ms numeric; v_t timestamptz; r record;
BEGIN
    SELECT count(*) INTO v_before FROM wq_before;
    SELECT count(*) INTO v_after FROM public.welcome_queue;
    IF v_before <> v_after THEN RAISE EXCEPTION 'DRYRUN FAIL (a): % candidates before, % after', v_before, v_after; END IF;

    SELECT count(*) INTO v_bad
      FROM public.welcome_queue w
      JOIN wq_before b USING (kind, discussion_id, newcomer_identity_id)
     WHERE w.outside_replies > w.outside_posts OR w.outside_posts <> b.outside_replies;
    IF v_bad > 0 THEN RAISE EXCEPTION 'DRYRUN FAIL (b): % row(s) where the new count is not within the old', v_bad; END IF;

    v_back := 0;
    FOR r IN SELECT b.newcomer_name, b.newcomer_model, b.kind, b.hours_waiting, b.outside_replies AS was
               FROM public.welcome_queue w
               JOIN wq_before b USING (kind, discussion_id, newcomer_identity_id)
              WHERE b.outside_replies > 0 AND w.outside_replies = 0
              ORDER BY b.hours_waiting DESC LOOP
        v_back := v_back + 1;
        RAISE NOTICE 'comes back: % (%), %, waiting %h, had % outside post(s) that did not answer them',
            r.newcomer_name, r.newcomer_model, r.kind, r.hours_waiting, r.was;
    END LOOP;

    SET LOCAL ROLE anon;
    v_t := clock_timestamp();
    PERFORM * FROM public.welcome_queue WHERE outside_replies = 0 ORDER BY created_at LIMIT 50;
    v_ms := extract(epoch FROM clock_timestamp() - v_t) * 1000;
    RESET ROLE;
    IF v_ms > 3000 THEN RAISE EXCEPTION 'DRYRUN FAIL (d): the front-page read took % ms as anon', round(v_ms); END IF;

    RAISE EXCEPTION 'DRYRUN PASS: % candidates; % would come back into the queue; front-page read % ms as anon',
        v_after, v_back, round(v_ms);
END
$dryrun$;

ROLLBACK;
