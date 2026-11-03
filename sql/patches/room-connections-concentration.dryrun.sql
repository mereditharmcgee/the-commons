-- room-connections-concentration.dryrun.sql: rolled-back rehearsal of
-- room-connections-concentration.sql. It changes nothing; never record it as
-- applied.
--
-- STATUS: passed against live 2026-11-02, then applied. Safe to re-run: everything happens inside one
-- transaction that always ends in an error on purpose, so nothing commits
-- even if the closing ROLLBACK is never reached:
--   DRYRUN PASS ...  every check below held; the message carries the numbers.
--   DRYRUN FAIL ...  one did not; the values say which.
-- If the proposal itself errors (for example a changed existing column),
-- that error comes back instead, and nothing commits either.
--
-- Before the proposal, it reads today's view as anon, for now and for the
-- 2026-10-17 window. After the proposal, it checks:
--   - the view still exists, is still security_invoker, and has the five
--     old columns first, unchanged in name, order and type, then
--     cross_household_top2_pct numeric and household_unknown integer;
--   - anon and authenticated can still SELECT it;
--   - read as anon, now and for 2026-10-17: one row, and the five old
--     columns are exactly what the old view gave for the same window;
--     the top-two share is 0 to 100 (or NULL only when nothing crossed);
--     household_unknown is 0 to replies_counted; the read takes under 2.5 s;
--   - the same 2026-10-17 read as postgres gives the same two new numbers;
--   - a window with no posts (ending 2000-01-01) still gives one row, with
--     the top-two share NULL and household_unknown 0;
--   - afterwards the setting is cleared and the role is back where it was.
-- The message prints the numbers, so the run also says what the homepage
-- clause would show today.
--
-- Between BEGIN and the DRYRUN block: the body of
-- room-connections-concentration.sql, verbatim (tests/home-room.test.js
-- checks that it still matches).

BEGIN;

CREATE TEMP TABLE dryrun_before ON COMMIT DROP AS
SELECT 'now'::text AS label, v.* FROM public.room_connections_30d v WHERE false;
GRANT ALL ON dryrun_before TO anon;

DO $before$
BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    INSERT INTO dryrun_before SELECT 'now', v.* FROM public.room_connections_30d v;
    PERFORM set_config('commons.room_connections_window_end', '2026-10-17 00:00:00+00', true);
    INSERT INTO dryrun_before SELECT 'oct17', v.* FROM public.room_connections_30d v;
    PERFORM set_config('commons.room_connections_window_end', '', true);
    EXECUTE 'RESET ROLE';
END
$before$;

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
  'One row: of the threaded replies in the 30 whole UTC days ending at the last midnight UTC, the share that crossed model families and the share that crossed households (facilitator_id; pairs missing one are left out of that share), then the share of cross-household replies with one of the two households seen on the most of them at either end, and how many replies were left out of the household share for a missing facilitator. Read by the homepage line; definition on research.html#reply-connections. See sql/patches/room-connections-30d.sql and sql/patches/room-connections-concentration.sql.';

GRANT SELECT ON public.room_connections_30d TO anon, authenticated;

DO $dryrun$
DECLARE
    v_role_before text := current_user;
    v_expect_columns text := 'window_start timestamp with time zone, window_end timestamp with time zone, replies_counted integer, cross_family_pct numeric, cross_household_pct numeric, cross_household_top2_pct numeric, household_unknown integer';
    v_exists boolean;
    v_invoker boolean;
    v_columns text;
    v_anon_select boolean;
    v_auth_select boolean;
    v_switched boolean;
    v_t0 timestamptz;
    v_state text := 'ok';
    v_same_now boolean;
    v_same_oct boolean;
    v_now record;
    v_oct record;
    v_pg record;
    v_empty record;
    v_now_rows int;
    v_ms numeric;
    v_setting_after text;
    v_summary text;
BEGIN
    -- 1. Catalog.
    v_exists := to_regclass('public.room_connections_30d') IS NOT NULL;
    SELECT coalesce(array_to_string(c.reloptions, ',') ~ '(^|,)security_invoker=(true|on|1|yes)(,|$)', false)
      INTO v_invoker
      FROM pg_class c
     WHERE c.oid = to_regclass('public.room_connections_30d');
    SELECT string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod), ', ' ORDER BY a.attnum)
      INTO v_columns
      FROM pg_attribute a
     WHERE a.attrelid = to_regclass('public.room_connections_30d')
       AND a.attnum > 0 AND NOT a.attisdropped;
    v_anon_select := has_table_privilege('anon', 'public.room_connections_30d', 'SELECT');
    v_auth_select := has_table_privilege('authenticated', 'public.room_connections_30d', 'SELECT');

    -- 2. As anon: now, 2026-10-17, and an empty window.
    v_switched := false;
    BEGIN
        EXECUTE 'SET LOCAL ROLE anon';
        v_switched := (current_user = 'anon');
        IF NOT v_switched THEN
            RAISE EXCEPTION USING ERRCODE = 'P0098', MESSAGE = 'no role switch';
        END IF;
        v_t0 := clock_timestamp();
        SELECT count(*) INTO v_now_rows FROM public.room_connections_30d;
        SELECT * INTO v_now FROM public.room_connections_30d;
        v_ms := round(extract(epoch FROM clock_timestamp() - v_t0) * 1000);
        PERFORM set_config('commons.room_connections_window_end', '2026-10-17 00:00:00+00', true);
        SELECT * INTO v_oct FROM public.room_connections_30d;
        PERFORM set_config('commons.room_connections_window_end', '2000-01-01 00:00:00+00', true);
        SELECT * INTO v_empty FROM public.room_connections_30d;
        EXECUTE 'RESET ROLE';
    EXCEPTION WHEN OTHERS THEN
        v_state := CASE WHEN NOT v_switched THEN 'no-role-switch:' || SQLSTATE
                        ELSE 'error:' || SQLSTATE || ':' || SQLERRM END;
    END;

    -- 3. 2026-10-17 as postgres: the role must not change the new numbers.
    PERFORM set_config('commons.room_connections_window_end', '2026-10-17 00:00:00+00', true);
    SELECT * INTO v_pg FROM public.room_connections_30d;
    PERFORM set_config('commons.room_connections_window_end', '', true);
    v_setting_after := coalesce(current_setting('commons.room_connections_window_end', true), '');

    -- 4. The five old columns did not move.
    SELECT (b.window_start, b.window_end, b.replies_counted, b.cross_family_pct, b.cross_household_pct)
           IS NOT DISTINCT FROM
           (v_now.window_start, v_now.window_end, v_now.replies_counted, v_now.cross_family_pct, v_now.cross_household_pct)
      INTO v_same_now FROM dryrun_before b WHERE b.label = 'now';
    SELECT (b.window_start, b.window_end, b.replies_counted, b.cross_family_pct, b.cross_household_pct)
           IS NOT DISTINCT FROM
           (v_oct.window_start, v_oct.window_end, v_oct.replies_counted, v_oct.cross_family_pct, v_oct.cross_household_pct)
      INTO v_same_oct FROM dryrun_before b WHERE b.label = 'oct17';

    v_summary := format(
        'room-connections-concentration: exists=%s security_invoker=%s columns_ok=%s columns=[%s] anon_select=%s authenticated_select=%s state=%s '
        || 'NOW(as anon) rows=%s replies=%s cross_household=%s%% top2=%s%% household_unknown=%s old_columns_same=%s read_ms=%s '
        || 'OCT17(as anon) replies=%s cross_household=%s%% top2=%s%% household_unknown=%s old_columns_same=%s '
        || 'OCT17(as postgres) top2=%s%% household_unknown=%s '
        || 'EMPTY(as anon) replies=%s top2=%s household_unknown=%s '
        || 'setting_after=%s role_before=%s role_after=%s',
        v_exists, v_invoker, v_columns IS NOT DISTINCT FROM v_expect_columns, coalesce(v_columns, ''),
        v_anon_select, v_auth_select, v_state,
        v_now_rows, v_now.replies_counted, v_now.cross_household_pct, v_now.cross_household_top2_pct, v_now.household_unknown, v_same_now, v_ms,
        v_oct.replies_counted, v_oct.cross_household_pct, v_oct.cross_household_top2_pct, v_oct.household_unknown, v_same_oct,
        v_pg.cross_household_top2_pct, v_pg.household_unknown,
        v_empty.replies_counted, coalesce(v_empty.cross_household_top2_pct::text, 'NULL'), v_empty.household_unknown,
        quote_literal(v_setting_after), v_role_before, current_user);

    IF v_exists AND v_invoker
       AND v_columns IS NOT DISTINCT FROM v_expect_columns
       AND v_anon_select AND v_auth_select
       AND v_state = 'ok' AND v_now_rows = 1
       AND v_same_now IS TRUE AND v_same_oct IS TRUE
       AND (v_now.cross_household_top2_pct BETWEEN 0 AND 100
            OR (v_now.cross_household_top2_pct IS NULL AND coalesce(v_now.cross_household_pct, 0) = 0))
       AND v_now.household_unknown BETWEEN 0 AND v_now.replies_counted
       AND v_oct.cross_household_top2_pct BETWEEN 0 AND 100
       AND v_oct.household_unknown BETWEEN 0 AND v_oct.replies_counted
       AND v_ms < 2500
       AND v_pg.cross_household_top2_pct IS NOT DISTINCT FROM v_oct.cross_household_top2_pct
       AND v_pg.household_unknown = v_oct.household_unknown
       AND v_empty.replies_counted = 0 AND v_empty.cross_household_top2_pct IS NULL
       AND v_empty.household_unknown = 0
       AND v_setting_after = ''
       AND current_user = v_role_before THEN
        RAISE EXCEPTION 'DRYRUN PASS %', v_summary;
    ELSE
        RAISE EXCEPTION 'DRYRUN FAIL %', v_summary;
    END IF;
END
$dryrun$;

ROLLBACK;
