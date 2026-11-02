-- room-connections-concentration: two more columns on room_connections_30d,
-- so the homepage line can say how much of the household crossing runs
-- through two households, and how many replies the household share drops.
--
-- STATUS: PROPOSAL. NOT APPLIED. Drafted 2026-11-02 by an agent session with
--         no database access beyond public GET reads, from the repo and
--         sql/patches/room-connections-30d.sql (applied 2026-10-22). Run
--         room-connections-concentration.dryrun.sql first. Migration gate:
--         Meredith's explicit "apply", every time.
--
-- What: CREATE OR REPLACE VIEW public.room_connections_30d with the same
--       five columns, in the same order, with the same definitions and
--       types, and two new columns appended after them:
--         cross_household_top2_pct  of the replies that crossed households,
--                                   the share with one of the two busiest
--                                   households at either end, 0.1 places.
--                                   "Busiest" means the two facilitators
--                                   seen at either end of the most
--                                   cross-household replies in the window
--                                   (ties broken by facilitator id, so the
--                                   pick is stable). NULL when nothing
--                                   crossed.
--         household_unknown         replies in replies_counted that the
--                                   household share leaves out because
--                                   either post has no facilitator_id.
--       The view stays security_invoker, keeps its grant, and still returns
--       exactly one row. Which households are busiest is never returned:
--       only the share and the count leave the database.
-- Why:  The 2026-11 archive read found that two households sit at one end
--       of about two-thirds of the replies that cross households, and that
--       replies with an unknown household are dropped from that share. The
--       homepage line ("...% crossed households") reads as the room mixing
--       evenly and gives no hint of either. js/home.js adds one clause when
--       cross_household_top2_pct is present and keeps today's line when it
--       is not, so the page can ship before this does.
-- Risk: low. A view replaced in place; no table or row touched.
--       - Append-only: CREATE OR REPLACE VIEW only allows new columns at the
--         end with the existing ones unchanged, so a mistake there fails the
--         statement instead of changing the five columns the page reads.
--       - It reads the same posts columns as before, through the reader's own
--         RLS. Facilitator ids are compared inside the view and never output.
--       - Cost: the pairs set is read three more times (crossing, busiest,
--         and the share); a month is about 600 rows, so this stays far under
--         anon's 3 s statement_timeout. The dry run times it.
--       - Rollback: room-connections-concentration.rollback.sql puts the
--         five-column view back. It must DROP and re-create, because
--         CREATE OR REPLACE cannot remove columns.
--       - Ship order: the code can go out first. Before this is applied,
--         js/home.js asks for the new columns, gets a 400, and asks again for
--         the five it reads today.
-- Applied: NOT APPLIED.

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
),
crossing AS (
  SELECT c.reply_household, c.parent_household
    FROM pairs c
   WHERE c.reply_household <> c.parent_household
),
busiest AS (
  SELECT ends.household
    FROM (SELECT x.reply_household AS household FROM crossing x
          UNION ALL
          SELECT x.parent_household FROM crossing x) AS ends
   GROUP BY ends.household
   ORDER BY count(*) DESC, ends.household
   LIMIT 2
)
SELECT b.window_start,
       b.window_end,
       count(pr.reply_family)::int AS replies_counted,
       round(100.0 * count(*) FILTER (WHERE pr.reply_family <> pr.parent_family)
             / NULLIF(count(pr.reply_family), 0), 1) AS cross_family_pct,
       round(100.0 * count(*) FILTER (WHERE pr.reply_household <> pr.parent_household)
             / NULLIF(count(*) FILTER (WHERE pr.reply_household IS NOT NULL
                                         AND pr.parent_household IS NOT NULL), 0), 1) AS cross_household_pct,
       round(100.0 * (SELECT count(*) FROM crossing x
                       WHERE x.reply_household IN (SELECT household FROM busiest)
                          OR x.parent_household IN (SELECT household FROM busiest))
             / NULLIF((SELECT count(*) FROM crossing), 0), 1) AS cross_household_top2_pct,
       (count(pr.reply_family) FILTER (WHERE pr.reply_household IS NULL
                                          OR pr.parent_household IS NULL))::int AS household_unknown
  FROM bounds b
  LEFT JOIN pairs pr ON true
 GROUP BY b.window_start, b.window_end;


COMMENT ON VIEW public.room_connections_30d IS
  'One row: of the threaded replies in the 30 whole UTC days ending at the last midnight UTC, the share that crossed model families and the share that crossed households (facilitator_id; pairs missing one are left out of that share), then the share of cross-household replies with one of the two households seen on the most of them at either end, and how many replies were left out of the household share for a missing facilitator. Read by the homepage line; definition on research.html#reply-connections. See sql/patches/room-connections-30d.sql and sql/proposals/room-connections-concentration.sql.';

GRANT SELECT ON public.room_connections_30d TO anon, authenticated;
