-- mention-after-dash.rollback.sql: puts notify_on_mention back to the live
-- body read 2026-11-03, then drops mention_tokens. Run only if
-- mention-after-dash.sql was applied and has to come out. Migration gate:
-- Meredith's explicit "apply", as for any DDL.
--
-- The body below is the live one, with one difference in spelling only: the
-- live regex holds a literal em dash and en dash, written here as \u2014 and
-- \u2013 because the repo keeps em dashes out of what it writes. The regex
-- engine reads both spellings as the same characters, so behavior is
-- identical, but pg_get_functiondef will not be byte-identical to the
-- 2026-11-03 read. tests/mention-after-dash.test.js checks the old behavior
-- comes back.
--
-- Mention rows created while the new rule was live stay; nothing is deleted.

BEGIN;

CREATE OR REPLACE FUNCTION public.notify_on_mention()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_line text; v_seg text; v_tok text; v_matches int; v_target uuid; v_fac uuid; v_name text; v_title text; v_author text; v_parent_identity uuid; v_link text; v_count int := 0;
BEGIN
  IF NEW.discussion_id IS NULL OR NEW.content IS NULL OR NEW.is_active IS NOT DISTINCT FROM false THEN RETURN NEW; END IF;
  v_line := left(split_part(replace(NEW.content, E'\r', ''), E'\n', 1), 200);
  v_seg := regexp_replace(v_line, '^[\s*_#>]+', '');
  v_seg := regexp_replace(v_seg, '^(dear|hi|hello|hey)\s+', '', 'i');
  v_seg := regexp_replace(v_seg, '[.!?:].*$', '');
  v_seg := regexp_replace(v_seg, '\s*[\u2014\u2013].*$', '');
  v_seg := regexp_replace(v_seg, '\s+-\s.*$', '');
  v_seg := btrim(v_seg);
  IF v_seg = '' OR length(v_seg) > 80 THEN RETURN NEW; END IF;
  SELECT title INTO v_title FROM discussions WHERE id = NEW.discussion_id;
  v_author := COALESCE(NEW.ai_name, NEW.model, 'A voice');
  IF NEW.parent_id IS NOT NULL THEN SELECT ai_identity_id INTO v_parent_identity FROM posts WHERE id = NEW.parent_id; END IF;
  v_link := 'discussion.html?id=' || NEW.discussion_id || '&post=' || NEW.id;
  FOR v_tok IN SELECT btrim(regexp_replace(regexp_replace(t, '^[\s@*_]+', ''), '[\s*_]+$', '')) FROM regexp_split_to_table(v_seg, ',|\s+and\s+|\s+&\s+') AS t LOOP
    v_count := v_count + 1;
    EXIT WHEN v_count > 10;
    IF v_tok = '' OR length(v_tok) > 60 THEN CONTINUE; END IF;
    SELECT count(*), min(ai.id::text)::uuid INTO v_matches, v_target FROM ai_identities ai
     WHERE ai.is_active IS DISTINCT FROM false AND ai.facilitator_id IS NOT NULL AND ai.id IS DISTINCT FROM NEW.ai_identity_id
       AND ai.id IN (SELECT DISTINCT p.ai_identity_id FROM posts p WHERE p.discussion_id = NEW.discussion_id AND p.ai_identity_id IS NOT NULL)
       AND (lower(ai.name) = lower(v_tok) OR lower(split_part(ai.name, ' ', 1)) = lower(v_tok));
    IF v_matches <> 1 THEN CONTINUE; END IF;
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

DROP FUNCTION public.mention_tokens(text);

COMMIT;
