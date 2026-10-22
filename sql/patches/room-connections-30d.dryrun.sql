-- room-connections-30d.dryrun.sql: rolled-back rehearsal of
-- room-connections-30d.sql. It changes nothing; never record it as applied.
--
-- Run the whole file as one script (Supabase SQL editor, or execute_sql). It
-- always ends in an error on purpose, so nothing commits even if the closing
-- ROLLBACK is never reached:
--   DRYRUN PASS ...  every check below held; the message carries the numbers.
--   DRYRUN FAIL ...  one did not; the values say which.
-- If the patch itself errors (for example a different view already holds the
-- name), that error comes back instead, and nothing commits either.
--
-- After the patch, it checks:
--   - the view exists, is security_invoker, and has exactly the five columns
--     js/home.js reads, in order and type;
--   - anon and authenticated can SELECT it;
--   - now, read as anon (SET LOCAL ROLE anon, the role the homepage reads
--     with): exactly one row, the window is the 30 whole UTC days ending at
--     today's midnight UTC, there are replies, both shares are 0 to 100, and
--     the read takes under 2.5 s (anon's statement_timeout is 3 s). These are
--     the numbers the homepage would show today; the message prints them;
--   - the Oct 17 window, pinned with commons.room_connections_window_end
--     = 2026-10-17 00:00 UTC and read through the same view as anon: the
--     window is [2026-09-17, 2026-10-17) UTC, 615 to 630 replies (626 on
--     2026-10-22: Meredith's 627 less one reply to a post its author withdrew
--     on 2026-10-15; it can drift only if posts in that window are withdrawn
--     or restored), and the shares round to her 70% and 91%;
--   - the same Oct 17 read as postgres (who passes every RLS policy) gives the
--     same three numbers, so a reader's role does not change them;
--   - a window with no posts (ending 2000-01-01) still gives one row, with 0
--     replies and both shares NULL, which the homepage hides;
--   - afterwards the setting is cleared and the session role is back where it
--     started.
--
-- Between BEGIN and the DRYRUN block: the body of room-connections-30d.sql,
-- verbatim (tests/home-room.test.js checks that it still matches).

BEGIN;

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

DO $dryrun$
DECLARE
    v_role_before text := current_user;
    v_expect_columns text := 'window_start timestamp with time zone, window_end timestamp with time zone, replies_counted integer, cross_family_pct numeric, cross_household_pct numeric';
    v_today timestamptz := date_trunc('day', now(), 'UTC');
    v_oct_end timestamptz := timestamptz '2026-10-17 00:00:00+00';
    v_exists boolean;
    v_invoker boolean;
    v_columns text;
    v_anon_select boolean;
    v_auth_select boolean;
    v_switched boolean;
    v_t0 timestamptz;
    -- now, as anon
    v_now_state text;
    v_now_rows int;
    v_now_start timestamptz;
    v_now_end timestamptz;
    v_now_n int;
    v_now_fam numeric;
    v_now_hh numeric;
    v_now_ms numeric;
    -- 2026-10-17, as anon
    v_oct_state text;
    v_oct_rows int;
    v_oct_start timestamptz;
    v_oct_end_got timestamptz;
    v_oct_n int;
    v_oct_fam numeric;
    v_oct_hh numeric;
    -- 2026-10-17, as postgres
    v_pg_state text;
    v_pg_n int;
    v_pg_fam numeric;
    v_pg_hh numeric;
    -- a window with no posts, as anon
    v_empty_state text;
    v_empty_rows int;
    v_empty_n int;
    v_empty_fam numeric;
    v_empty_hh numeric;
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

    -- 2. Now, as anon: what the homepage would show today.
    v_switched := false;
    BEGIN
        EXECUTE 'SET LOCAL ROLE anon';
        v_switched := (current_user = 'anon');
        IF NOT v_switched THEN
            RAISE EXCEPTION USING ERRCODE = 'P0098', MESSAGE = 'no role switch';
        END IF;
        v_t0 := clock_timestamp();
        SELECT count(*) INTO v_now_rows FROM public.room_connections_30d;
        SELECT window_start, window_end, replies_counted, cross_family_pct, cross_household_pct
          INTO v_now_start, v_now_end, v_now_n, v_now_fam, v_now_hh
          FROM public.room_connections_30d;
        v_now_ms := round(extract(epoch FROM clock_timestamp() - v_t0) * 1000);
        EXECUTE 'RESET ROLE';
        v_now_state := 'ok';
    EXCEPTION WHEN OTHERS THEN
        v_now_state := CASE WHEN NOT v_switched THEN 'no-role-switch:' || SQLSTATE
                            ELSE 'error:' || SQLSTATE || ':' || SQLERRM END;
    END;

    -- 3. The window Meredith counted, through the same view, as anon.
    PERFORM set_config('commons.room_connections_window_end', v_oct_end::text, true);
    v_switched := false;
    BEGIN
        EXECUTE 'SET LOCAL ROLE anon';
        v_switched := (current_user = 'anon');
        IF NOT v_switched THEN
            RAISE EXCEPTION USING ERRCODE = 'P0098', MESSAGE = 'no role switch';
        END IF;
        SELECT count(*) INTO v_oct_rows FROM public.room_connections_30d;
        SELECT window_start, window_end, replies_counted, cross_family_pct, cross_household_pct
          INTO v_oct_start, v_oct_end_got, v_oct_n, v_oct_fam, v_oct_hh
          FROM public.room_connections_30d;
        EXECUTE 'RESET ROLE';
        v_oct_state := 'ok';
    EXCEPTION WHEN OTHERS THEN
        v_oct_state := CASE WHEN NOT v_switched THEN 'no-role-switch:' || SQLSTATE
                            ELSE 'error:' || SQLSTATE || ':' || SQLERRM END;
    END;

    -- 4. The same window as postgres: the role must not change the numbers.
    BEGIN
        SELECT replies_counted, cross_family_pct, cross_household_pct
          INTO v_pg_n, v_pg_fam, v_pg_hh
          FROM public.room_connections_30d;
        v_pg_state := 'ok';
    EXCEPTION WHEN OTHERS THEN
        v_pg_state := 'error:' || SQLSTATE || ':' || SQLERRM;
    END;

    -- 5. A window with no posts in it, as anon.
    PERFORM set_config('commons.room_connections_window_end', '2000-01-01 00:00:00+00', true);
    v_switched := false;
    BEGIN
        EXECUTE 'SET LOCAL ROLE anon';
        v_switched := (current_user = 'anon');
        IF NOT v_switched THEN
            RAISE EXCEPTION USING ERRCODE = 'P0098', MESSAGE = 'no role switch';
        END IF;
        SELECT count(*) INTO v_empty_rows FROM public.room_connections_30d;
        SELECT replies_counted, cross_family_pct, cross_household_pct
          INTO v_empty_n, v_empty_fam, v_empty_hh
          FROM public.room_connections_30d;
        EXECUTE 'RESET ROLE';
        v_empty_state := 'ok';
    EXCEPTION WHEN OTHERS THEN
        v_empty_state := CASE WHEN NOT v_switched THEN 'no-role-switch:' || SQLSTATE
                              ELSE 'error:' || SQLSTATE || ':' || SQLERRM END;
    END;

    PERFORM set_config('commons.room_connections_window_end', '', true);
    v_setting_after := coalesce(current_setting('commons.room_connections_window_end', true), '');

    v_summary := format(
        'room-connections-30d: exists=%s security_invoker=%s columns_ok=%s columns=[%s] anon_select=%s authenticated_select=%s '
        || 'NOW(as anon) state=%s rows=%s window=[%s, %s) replies=%s cross_family=%s%% cross_household=%s%% read_ms=%s '
        || 'OCT17(as anon) state=%s rows=%s window=[%s, %s) replies=%s cross_family=%s%% cross_household=%s%% '
        || 'OCT17(as postgres) state=%s replies=%s cross_family=%s%% cross_household=%s%% '
        || 'EMPTY(as anon) state=%s rows=%s replies=%s cross_family=%s cross_household=%s '
        || 'setting_after=%s role_before=%s role_after=%s',
        v_exists, v_invoker, v_columns IS NOT DISTINCT FROM v_expect_columns, coalesce(v_columns, ''),
        v_anon_select, v_auth_select,
        v_now_state, v_now_rows, v_now_start, v_now_end, v_now_n, v_now_fam, v_now_hh, v_now_ms,
        v_oct_state, v_oct_rows, v_oct_start, v_oct_end_got, v_oct_n, v_oct_fam, v_oct_hh,
        v_pg_state, v_pg_n, v_pg_fam, v_pg_hh,
        v_empty_state, v_empty_rows, v_empty_n, coalesce(v_empty_fam::text, 'NULL'), coalesce(v_empty_hh::text, 'NULL'),
        quote_literal(v_setting_after), v_role_before, current_user);

    IF v_exists AND v_invoker
       AND v_columns IS NOT DISTINCT FROM v_expect_columns
       AND v_anon_select AND v_auth_select
       AND v_now_state = 'ok' AND v_now_rows = 1
       AND v_now_end = v_today AND v_now_start = v_today - interval '30 days'
       AND v_now_n > 0
       AND v_now_fam BETWEEN 0 AND 100 AND v_now_hh BETWEEN 0 AND 100
       AND v_now_ms < 2500
       AND v_oct_state = 'ok' AND v_oct_rows = 1
       AND v_oct_start = timestamptz '2026-09-17 00:00:00+00' AND v_oct_end_got = v_oct_end
       AND v_oct_n BETWEEN 615 AND 630
       AND round(v_oct_fam) = 70 AND round(v_oct_hh) = 91
       AND v_pg_state = 'ok'
       AND v_pg_n = v_oct_n AND v_pg_fam = v_oct_fam AND v_pg_hh = v_oct_hh
       AND v_empty_state = 'ok' AND v_empty_rows = 1 AND v_empty_n = 0
       AND v_empty_fam IS NULL AND v_empty_hh IS NULL
       AND v_setting_after = ''
       AND current_user = v_role_before THEN
        RAISE EXCEPTION 'DRYRUN PASS %', v_summary;
    ELSE
        RAISE EXCEPTION 'DRYRUN FAIL %', v_summary;
    END IF;
END
$dryrun$;

ROLLBACK;
