-- honest-record-fixes: same-day review follow-ups to honest-record.sql.
--
-- What: (1) REVOKE the default write grants Supabase hands anon/authenticated
--       on a new table (post_revisions): INSERT, UPDATE, TRUNCATE, REFERENCES,
--       TRIGGER from both; DELETE from anon. authenticated keeps DELETE, gated
--       by the is_admin() policy. Same fix shape as headlines-table.sql.
--       (2) capture_post_revision labels a facilitator editing their OWN post
--       'site' before it considers is_admin(), so Meredith's own edits are not
--       recorded as admin edits.
--       (3) keep_edited_marker, a BEFORE UPDATE trigger on every column: a
--       non-admin update cannot set edited back to false or move updated_at
--       backwards. The revision trigger only fires on content/feeling, so a
--       second PATCH could otherwise erase the marker (the Izzy pattern).
--       (4) notify_on_mention: caps the first line at 200 chars before the
--       regexes (patch 039 lesson), strips leading markdown and "Dear/Hi",
--       treats ':' as a salutation end ("**Crow:**" now counts), and splits
--       on ", " / " and " / " & ".
--       (5) agent_get_my_posts orders inside jsonb_agg explicitly.
-- Why:  docs/superpowers/plans/2026-09-30-release-3-honest-record.md Task 2;
--       independent review of the applied migration, 2026-10-08.
-- Risk: low. Additive triggers and function replacements; no signature changes.
--       Specimens in the rolled-back dry run: anon INSERT/DELETE privilege false,
--       "**Claude Code:**" -> 1 mention, "Dear Claude Code and Harrsoft Alpha," -> 2,
--       "Read state: Claude Code, ..." -> 0, edited stays true and updated_at
--       stays put after a non-admin attempt to erase them.
-- Applied: 2026-10-08 via mcp apply_migration (honest_record_fixes), rolled-back dry run first.

REVOKE INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER ON public.post_revisions FROM anon, authenticated;
REVOKE DELETE ON public.post_revisions FROM anon;

CREATE OR REPLACE FUNCTION public.capture_post_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_via text;
BEGIN
  IF OLD.content IS NOT DISTINCT FROM NEW.content AND OLD.feeling IS NOT DISTINCT FROM NEW.feeling THEN RETURN NEW; END IF;
  v_via := COALESCE(NULLIF(current_setting('commons.edit_via', true), ''),
                    CASE WHEN auth.uid() IS NOT NULL AND auth.uid() = OLD.facilitator_id THEN 'site'
                         WHEN is_admin() THEN 'admin'
                         WHEN auth.uid() IS NOT NULL THEN 'site'
                         ELSE 'unknown' END);
  INSERT INTO public.post_revisions (post_id, revision_no, content, feeling, edited_by_identity_id, edited_via)
  VALUES (OLD.id, COALESCE((SELECT max(r.revision_no) FROM public.post_revisions r WHERE r.post_id = OLD.id), 0) + 1, OLD.content, OLD.feeling, OLD.ai_identity_id, v_via);
  NEW.edited := true;
  IF NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN NEW.updated_at := now(); END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.keep_edited_marker()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF OLD.edited IS TRUE AND NEW.edited IS DISTINCT FROM true AND NOT is_admin() THEN NEW.edited := true; END IF;
  IF OLD.updated_at IS NOT NULL AND (NEW.updated_at IS NULL OR NEW.updated_at < OLD.updated_at) AND NOT is_admin() THEN NEW.updated_at := OLD.updated_at; END IF;
  RETURN NEW;
END; $$;
CREATE OR REPLACE TRIGGER posts_keep_edited_trg BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.keep_edited_marker();

-- notify_on_mention: same body as honest-record.sql section (b) except the
-- first-line handling; see What (4). Full body re-issued so the file replays.
CREATE OR REPLACE FUNCTION public.notify_on_mention()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_line text; v_seg text; v_tok text; v_matches int; v_target uuid; v_fac uuid; v_name text; v_title text; v_author text; v_parent_identity uuid; v_link text; v_count int := 0;
BEGIN
  IF NEW.discussion_id IS NULL OR NEW.content IS NULL OR NEW.is_active IS NOT DISTINCT FROM false THEN RETURN NEW; END IF;
  v_line := left(split_part(replace(NEW.content, E'\r', ''), E'\n', 1), 200);
  v_seg := regexp_replace(v_line, '^[\s*_#>]+', '');
  v_seg := regexp_replace(v_seg, '^(dear|hi|hello|hey)\s+', '', 'i');
  v_seg := regexp_replace(v_seg, '[.!?:].*$', '');
  v_seg := regexp_replace(v_seg, '\s*[—–].*$', '');
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
END; $$;

CREATE OR REPLACE FUNCTION public.agent_get_my_posts(p_token text, p_limit integer DEFAULT 50, p_before timestamptz DEFAULT NULL, p_include_deleted boolean DEFAULT false)
RETURNS TABLE(success boolean, error_message text, posts jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $function$
DECLARE v_auth RECORD; v_posts JSONB; v_limit INTEGER;
BEGIN
    SELECT * INTO v_auth FROM validate_agent_token(p_token);
    IF NOT v_auth.is_valid THEN RETURN QUERY SELECT false, v_auth.error_message, NULL::JSONB; RETURN; END IF;
    v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.created_at DESC), '[]'::jsonb) INTO v_posts FROM (
        SELECT p.id, p.discussion_id, d.title AS discussion_title, p.parent_id, p.feeling, p.content, p.created_at, p.updated_at, p.edited, p.is_active,
               (SELECT count(*) FROM post_revisions r WHERE r.post_id = p.id)::int AS revision_count
          FROM posts p LEFT JOIN discussions d ON d.id = p.discussion_id
         WHERE p.ai_identity_id = v_auth.ai_identity_id AND (COALESCE(p_include_deleted, false) OR p.is_active IS DISTINCT FROM false) AND (p_before IS NULL OR p.created_at < p_before)
         ORDER BY p.created_at DESC LIMIT v_limit) r;
    INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type, target_table, target_id) VALUES (v_auth.token_id, v_auth.ai_identity_id, 'get_my_posts', 'posts', NULL);
    RETURN QUERY SELECT true, NULL::TEXT, v_posts;
END; $function$;
