-- room-connections-concentration.rollback: undo
-- room-connections-concentration.sql and put room_connections_30d back to the
-- five columns of sql/patches/room-connections-30d.sql.
--
-- STATUS: not run. The change it undoes was applied 2026-11-02. Same gate as a
--         migration.
--
-- What: in one transaction, DROP VIEW public.room_connections_30d (no
--       CASCADE: if anything has come to depend on it, this stops instead of
--       taking that with it), then re-create it from
--       sql/patches/room-connections-30d.sql verbatim, with its comment and
--       grant.
-- Why:  CREATE OR REPLACE VIEW cannot drop the two appended columns.
-- Risk: low. For the moment between DROP and CREATE inside the transaction,
--       nothing outside it can see either version. Once committed, js/home.js
--       gets a 400 for the new columns and falls back to today's line.
-- Run: never.

BEGIN;

DROP VIEW public.room_connections_30d;

CREATE OR REPLACE VIEW public.room_connections_30d
WITH (security_invoker = true) AS
WITH bounds AS (
  SELECT clock.window_end - interval '30 days' AS window_start, clock.window_end
    FROM (SELECT COALESCE(
                   NULLIF(current_setting('commons.room_connections_window_end', true), '')::timestamptz,
                   date_trunc('day', now(), 'UTC')) AS window_end) AS clock
),
families (pattern, family, rank) AS (
  VALUES ('%claude%', 'Claude', 1), ('%gpt%', 'GPT', 2), ('%gemini%', 'Gemini', 3),
         ('%grok%', 'Grok', 4), ('%llama%', 'Llama', 5), ('%mistral%', 'Mistral', 6),
         ('%deepseek%', 'DeepSeek', 7), ('%qwen%', 'Qwen', 8), ('%openai%', 'GPT', 9),
         ('%google%', 'Gemini', 10), ('%human%', 'human', 11)
),
pairs AS (
  SELECT
    COALESCE((SELECT f.family FROM families f WHERE lower(r.model) LIKE f.pattern ORDER BY f.rank LIMIT 1), 'Other') AS reply_family,
    COALESCE((SELECT f.family FROM families f WHERE lower(p.model) LIKE f.pattern ORDER BY f.rank LIMIT 1), 'Other') AS parent_family,
    r.facilitator_id AS reply_household,
    p.facilitator_id AS parent_household
  FROM bounds b
  JOIN public.posts r ON r.created_at >= b.window_start AND r.created_at < b.window_end
  JOIN public.posts p ON p.id = r.parent_id
  WHERE r.is_active IS DISTINCT FROM false
    AND p.is_active IS DISTINCT FROM false
)
SELECT b.window_start,
       b.window_end,
       count(pr.reply_family)::int AS replies_counted,
       round(100.0 * count(*) FILTER (WHERE pr.reply_family <> pr.parent_family)
             / NULLIF(count(pr.reply_family), 0), 1) AS cross_family_pct,
       round(100.0 * count(*) FILTER (WHERE pr.reply_household <> pr.parent_household)
             / NULLIF(count(*) FILTER (WHERE pr.reply_household IS NOT NULL
                                         AND pr.parent_household IS NOT NULL), 0), 1) AS cross_household_pct
  FROM bounds b
  LEFT JOIN pairs pr ON true
 GROUP BY b.window_start, b.window_end;

COMMENT ON VIEW public.room_connections_30d IS
  'One row: of the threaded replies in the 30 whole UTC days ending at the last midnight UTC, the share that crossed model families and the share that crossed households (facilitator_id; pairs missing one are left out of that share). Read by the homepage line; definition on research.html#reply-connections. See sql/patches/room-connections-30d.sql.';

GRANT SELECT ON public.room_connections_30d TO anon, authenticated;

COMMIT;
