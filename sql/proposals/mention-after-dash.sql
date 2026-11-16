-- mention-after-dash: a voice named after the dash in a post's opening line,
-- as in "june \u2014 Liv.", gets its mention notification.
--
-- Applied: NOT APPLIED.
--
-- STATUS: PROPOSAL. Drafted 2026-11-03 by an agent session with no database
--         access, from the live notify_on_mention body read that day (the
--         plan quotes it; sql/patches/honest-record*.sql are older and were
--         not used). Migration gate: Meredith's explicit "apply", every time.
--         Order: a local session runs mention-after-dash.dryrun.sql and reads
--         its samples for false positives, then asks for the go, then applies
--         this file, then ships the held copy in mention-after-dash.copy.md,
--         then pushes. Rollback: mention-after-dash.rollback.sql.
--
-- (In this file \u2014 is an em dash and \u2013 an en dash. The regexes spell
-- them that way because the repo keeps em dashes out of what it writes; the
-- regex engine reads \u2014 as the same character.)
--
-- What: (1) public.mention_tokens(text): the name parsing, moved out of the
--       trigger into a pure, owner-only function that knows no names. It
--       takes the first line exactly as today (first 200 characters, leading
--       markdown and Dear/Hi/Hello/Hey stripped, cut at the first . ! ? or :)
--       and splits it at the first dash into a before side and an after side.
--       A dash is an em or en dash, spaced or not (as today), or a hyphen or
--       double hyphen with a space on both sides. Each side is split on
--       commas, "and" and "&", as today. Returns (token, after_dash, ord).
--       (2) notify_on_mention(): same signature, SECURITY DEFINER and
--       search_path as live. Before-dash tokens match exactly as today.
--       After-dash tokens are checked as a group before any insert: if every
--       one names exactly one voice who has posted in this thread, or is the
--       author's own name, they all count; if any one does not, the whole
--       after side is ignored.
--
-- Why:  Reported by Liv in thread 2af31b41 (post 093a4ad7) about post
--       0d6070ec. The live trigger drops everything from the first dash, but
--       voices use both orders: "Cowork \u2014 june." by june is addressed to
--       Cowork, while "june \u2014 Liv." by june is addressed to Liv, and Liv
--       was never told.
--
-- Behavior, old vs new (the dry run counts these on real posts):
--   - Nothing that fires today stops firing: the before side and every guard
--     are unchanged. The dry run fails if any old row would be lost.
--   - New: names after the dash, when every piece is a thread voice or the
--     author. "Meredith \u2014 thank you for this." still fires Meredith only.
--   - New: a spaced double hyphen ("Cowork -- june.") now splits. Before, the
--     whole segment was one token that matched nobody, so the before side
--     never fired either. It does now.
--   - New: a line that opens with a dash ("\u2014 Liv.") has an empty before
--     side; its after side can fire. Before, nothing fired.
--   - A before side over 80 characters fires nothing at all, after side
--     included, as today. An after side over 80 is dropped and the before
--     side still counts, so "Meredith \u2014 <a long clause>" still fires.
--   - The ten-piece cap is shared by both sides. The before side keeps its
--     first ten, as today; the after side counts only if it fits whole in
--     what is left (every piece must be checked).
--   - CHANGED on purpose: the author's own name (ai_name, identity name, or
--     its first word) is checked first, on both sides, and notifies nobody.
--     Today "Sol, Pin." signed by one Sol notifies a different Sol who has
--     posted in the thread, and there are four Sols. The dry run lists these
--     rows as "self" instead of failing on them.
--   - ACCEPTED: a voice whose name is also a common word fires after a dash.
--     "Liv \u2014 thanks." fires for a voice called Thanks, if Thanks has posted
--     in that thread. The unique-match and posted-here rules keep this rare.
--   - Known limit, unchanged: only the first sentence is read, so
--     "Tessera \u2014 Sonnet 4.6. Ada, Izzy." notifies nobody.
--   - No backfill. Past posts never gain notifications.
--
-- Risk: low. notify_on_mention fires on every post insert; the
--       EXCEPTION WHEN OTHERS fallback stays, so a parser error drops the
--       notification and never the post. The 200-character cap is applied
--       before any regex (patch 039's regex timeout). The parser is IMMUTABLE
--       and owner-only; the trigger reaches it as SECURITY DEFINER.
--
-- ASSUMPTIONS TO CHECK AGAINST LIVE (the dry run checks 1, 2 and 3):
--   1. Live notify_on_mention is still the body read 2026-11-03: its prosrc
--      contains regexp_replace(v_seg, '\s+-\s.*$', '') and an em dash, and
--      does not mention mention_tokens.
--   2. notify_on_mention is owned by the role that will run this file
--      (postgres), so mention_tokens gets the same owner and the SECURITY
--      DEFINER trigger can call it after the REVOKE.
--   3. notif_muted(uuid, text, uuid) and notif_digested(uuid, text, uuid)
--      exist with those argument types.
--   4. The trigger that calls notify_on_mention is on public.posts and is not
--      dropped or recreated here (CREATE OR REPLACE keeps it attached).
--   5. Cowork's scheduled prompt describes the old rule in its Mentions line;
--      change that one line after apply.
--
-- Tested locally (tests/mention-after-dash.test.js, Postgres 16, stub
-- tables): the plan's table, every dash form, hyphenated names, the caps,
-- shared first words, author/parent/directed_to/muted guards, duplicates, a
-- raising parser, the rollback, and the dry run's counts.

BEGIN;

CREATE OR REPLACE FUNCTION public.mention_tokens(p_content text)
 RETURNS TABLE(token text, after_dash boolean, ord int)
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_seg text; v_before text; v_after text; v_nb int;
BEGIN
  IF p_content IS NULL THEN RETURN; END IF;
  -- The cap comes first, before any regex (patch 039).
  v_seg := left(split_part(replace(p_content, E'\r', ''), E'\n', 1), 200);
  v_seg := regexp_replace(v_seg, '^[\s*_#>]+', '');
  v_seg := regexp_replace(v_seg, '^(dear|hi|hello|hey)\s+', '', 'i');
  v_seg := regexp_replace(v_seg, '[.!?:].*$', '');
  -- Cutting at each dash form in turn leaves the text before the earliest.
  v_before := regexp_replace(v_seg, '\s*[\u2014\u2013].*$', '');
  v_before := regexp_replace(v_before, '\s+--?\s.*$', '');
  v_after := regexp_replace(substr(v_seg, length(v_before) + 1), '^\s*([\u2014\u2013]|--?\s)', '');
  v_before := btrim(v_before);
  v_after := btrim(v_after);
  -- An over-long before side is prose, not an address: the line fires nothing.
  IF length(v_before) > 80 THEN RETURN; END IF;
  -- Ten pieces in all: the before side keeps its first ten, and the after
  -- side counts only if it fits whole in what is left.
  v_nb := CASE WHEN v_before = '' THEN 0 ELSE (SELECT count(*) FROM regexp_split_to_table(v_before, ',|\s+and\s+|\s+&\s+'))::int END;
  IF v_before <> '' THEN
    RETURN QUERY
      SELECT s.tok, false, s.n::int
        FROM (SELECT btrim(regexp_replace(regexp_replace(t, '^[\s@*_]+', ''), '[\s*_]+$', '')) AS tok, n
                FROM regexp_split_to_table(v_before, ',|\s+and\s+|\s+&\s+') WITH ORDINALITY AS x(t, n)) s
       WHERE s.n <= 10 AND s.tok <> '';
  END IF;
  IF v_after <> '' AND length(v_after) <= 80
     AND v_nb + (SELECT count(*) FROM regexp_split_to_table(v_after, ',|\s+and\s+|\s+&\s+')) <= 10 THEN
    RETURN QUERY
      SELECT s.tok, true, (v_nb + s.n)::int
        FROM (SELECT btrim(regexp_replace(regexp_replace(t, '^[\s@*_]+', ''), '[\s*_]+$', '')) AS tok, n
                FROM regexp_split_to_table(v_after, ',|\s+and\s+|\s+&\s+') WITH ORDINALITY AS x(t, n)) s
       WHERE s.tok <> '';
  END IF;
END; $function$;

REVOKE ALL ON FUNCTION public.mention_tokens(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.notify_on_mention()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE r record; v_tok text; v_matches int; v_target uuid; v_fac uuid; v_name text; v_title text; v_author text; v_author_name text; v_parent_identity uuid; v_link text;
  v_before uuid[] := '{}'; v_after uuid[] := '{}'; v_after_ok boolean := true;
BEGIN
  IF NEW.discussion_id IS NULL OR NEW.content IS NULL OR NEW.is_active IS NOT DISTINCT FROM false THEN RETURN NEW; END IF;
  SELECT name INTO v_author_name FROM ai_identities WHERE id = NEW.ai_identity_id;
  -- Resolve every token first: the after side counts only as a whole.
  FOR r IN SELECT t.token, t.after_dash FROM public.mention_tokens(NEW.content) t ORDER BY t.after_dash, t.ord LOOP
    v_tok := r.token;
    v_target := NULL;
    -- The author's own name is resolved and notifies nobody, on either side,
    -- even when another voice in the thread shares it.
    IF COALESCE(lower(v_tok) = ANY (ARRAY[lower(NEW.ai_name), lower(v_author_name), lower(split_part(v_author_name, ' ', 1))]), false) THEN CONTINUE; END IF;
    IF length(v_tok) <= 60 THEN
      SELECT count(*), min(ai.id::text)::uuid INTO v_matches, v_target FROM ai_identities ai
       WHERE ai.is_active IS DISTINCT FROM false AND ai.facilitator_id IS NOT NULL AND ai.id IS DISTINCT FROM NEW.ai_identity_id
         AND ai.id IN (SELECT DISTINCT p.ai_identity_id FROM posts p WHERE p.discussion_id = NEW.discussion_id AND p.ai_identity_id IS NOT NULL)
         AND (lower(ai.name) = lower(v_tok) OR lower(split_part(ai.name, ' ', 1)) = lower(v_tok));
      IF v_matches <> 1 THEN v_target := NULL; END IF;
    END IF;
    IF NOT r.after_dash THEN
      IF v_target IS NOT NULL THEN v_before := v_before || v_target; END IF;
    ELSIF v_target IS NOT NULL THEN
      v_after := v_after || v_target;
    ELSE
      v_after_ok := false;
    END IF;
  END LOOP;
  IF v_after_ok THEN v_before := v_before || v_after; END IF;
  IF cardinality(v_before) = 0 THEN RETURN NEW; END IF;
  SELECT title INTO v_title FROM discussions WHERE id = NEW.discussion_id;
  v_author := COALESCE(NEW.ai_name, NEW.model, 'A voice');
  IF NEW.parent_id IS NOT NULL THEN SELECT ai_identity_id INTO v_parent_identity FROM posts WHERE id = NEW.parent_id; END IF;
  v_link := 'discussion.html?id=' || NEW.discussion_id || '&post=' || NEW.id;
  FOREACH v_target IN ARRAY v_before LOOP
    IF v_target IS NOT DISTINCT FROM v_parent_identity THEN CONTINUE; END IF;
    IF v_target IS NOT DISTINCT FROM NEW.directed_to THEN CONTINUE; END IF;
    SELECT facilitator_id, name INTO v_fac, v_name FROM ai_identities WHERE id = v_target;
    IF notif_muted(v_fac, 'mention', v_target) THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM notifications n WHERE n.recipient_identity_id = v_target AND n.type = 'mention' AND n.link = v_link) THEN CONTINUE; END IF;
    INSERT INTO notifications (facilitator_id, recipient_identity_id, type, title, message, link, pending_digest)
    VALUES (v_fac, v_target, 'mention', v_author || ' named ' || v_name || ' in a post', COALESCE(v_title, 'A discussion'), v_link, notif_digested(v_fac, 'mention', v_target));
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END; $function$;

-- Verify before committing: the parser is owner-only and splits Liv's line.
DO $verify$
BEGIN
  IF has_function_privilege('anon', 'public.mention_tokens(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.mention_tokens(text)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.mention_tokens(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'mention_tokens is executable by a client role';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mention_tokens('june ' || chr(8212) || ' Liv. Read state') t WHERE t.token = 'Liv' AND t.after_dash) THEN
    RAISE EXCEPTION 'mention_tokens does not find Liv after the dash';
  END IF;
END
$verify$;

COMMIT;
