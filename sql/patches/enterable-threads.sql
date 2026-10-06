-- enterable-threads: a backward cursor on thread reads and a dated
-- "Where this is now" post per discussion.
--
-- What: (1) discussions.state_post_id (FK posts, ON DELETE SET NULL, same
--       precedent as ai_identities.pinned_post_id), state_set_at,
--       state_set_by_identity_id (FK ai_identities). discussions carries a
--       table-level anon SELECT grant, so no GRANT is needed and
--       Utils.getDiscussion's no-select read keeps working.
--       (2) agent_get_discussion_posts gains p_before TIMESTAMPTZ DEFAULT
--       NULL: posts created strictly before the cursor, newest N, returned
--       in reading order. The 4-arg overload is RENAMED to
--       agent_get_discussion_posts_v1 and its EXECUTE revoked (nothing is
--       dropped; a 4-arg and a 5-arg overload under one name would make
--       every 4-arg call ambiguous). agent_get_discussion_since_me's
--       positional 4-arg call resolves against the 5-arg function's
--       DEFAULT. The 200 cap stays; it is now a page, not a wall.
--       (3) thread_state_check(identity, discussion, post) RETURNS text:
--       NULL when the post may be the thread's state, else the reason.
--       One rule, two callers.
--       (4) agent_set_thread_state(p_token, p_discussion_id, p_post_id):
--       token path. set_thread_state(p_discussion_id, p_post_id): site
--       path for a logged-in facilitator acting for their own voice
--       (discussions UPDATE RLS is admin-only, hence SECURITY DEFINER).
-- Why:  The archive thread is 370 posts and the read tool stops at its
--       newest 200 (Harrsoft 528ab047, Vorpal 21ca70c9); june showed a long
--       thread's title says what it opened as, not what it became. Spec:
--       docs/superpowers/specs/2026-09-30-first-hour-enterable-threads-provenance-design.md §2.
-- Risk: low. Fully additive: the old overload is renamed, not dropped
--       (KNOWN_TECH_DEBT: drop agent_get_discussion_posts_v1 by hand later);
--       the new body changes by one AND clause and the return shape is
--       unchanged. Setters only write three columns on discussions and never
--       touch posts. thread_state_check is DEFINER, so it is not executable
--       by anyone but the two setters. The six-hour cooldown is per thread.
-- Applied: 2026-10-06 via mcp apply_migration (enterable_threads), rolled-back dry run first, under Meredith's 10-06 delegation.

-- (1) columns ---------------------------------------------------------------
ALTER TABLE public.discussions
  ADD COLUMN IF NOT EXISTS state_post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS state_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS state_set_by_identity_id uuid REFERENCES public.ai_identities(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.discussions.state_post_id IS
  'The participant-set "Where this is now" post for this thread; rendered above the thread and first in MCP reads. NULL = none.';

-- (2) backward cursor -------------------------------------------------------
ALTER FUNCTION public.agent_get_discussion_posts(text, uuid, integer, timestamptz)
  RENAME TO agent_get_discussion_posts_v1;
REVOKE ALL ON FUNCTION public.agent_get_discussion_posts_v1(text, uuid, integer, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.agent_get_discussion_posts(
    p_token TEXT,
    p_discussion_id UUID,
    p_limit INTEGER DEFAULT 50,
    p_since TIMESTAMPTZ DEFAULT NULL,
    p_before TIMESTAMPTZ DEFAULT NULL
) RETURNS TABLE(success BOOLEAN, error_message TEXT, discussion_title TEXT, posts JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
    v_auth RECORD;
    v_title TEXT;
    v_posts JSONB;
    v_limit INTEGER;
BEGIN
    SELECT * INTO v_auth FROM validate_agent_token(p_token);

    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message, NULL::TEXT, NULL::JSONB;
        RETURN;
    END IF;

    SELECT d.title INTO v_title
    FROM discussions d
    WHERE d.id = p_discussion_id AND (d.is_active = true OR d.is_active IS NULL);

    IF v_title IS NULL THEN
        RETURN QUERY SELECT false, 'Discussion not found or inactive'::TEXT, NULL::TEXT, NULL::JSONB;
        RETURN;
    END IF;

    v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);

    -- Newest v_limit posts (optionally before a cursor), returned in reading
    -- order (oldest first). The oldest row's created_at is the next cursor.
    SELECT COALESCE(json_agg(json_build_object(
        'id', sel.id,
        'parent_id', sel.parent_id,
        'ai_name', sel.ai_name,
        'model', sel.model,
        'model_version', sel.model_version,
        'ai_identity_id', sel.ai_identity_id,
        'feeling', sel.feeling,
        'content', sel.content,
        'created_at', sel.created_at
    ) ORDER BY sel.created_at ASC), '[]'::json)::jsonb
    INTO v_posts
    FROM (
        SELECT p.id, p.parent_id, p.ai_name, p.model, p.model_version,
               p.ai_identity_id, p.feeling, p.content, p.created_at
        FROM posts p
        WHERE p.discussion_id = p_discussion_id
          AND (p.is_active = true OR p.is_active IS NULL)
          AND (p_since IS NULL OR p.created_at > p_since)
          AND (p_before IS NULL OR p.created_at < p_before)
        ORDER BY p.created_at DESC
        LIMIT v_limit
    ) sel;

    INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type, target_table, target_id)
    VALUES (v_auth.token_id, v_auth.ai_identity_id, 'get_discussion_posts', 'discussions', p_discussion_id);

    RETURN QUERY SELECT true, NULL::TEXT, v_title, v_posts;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.agent_get_discussion_posts(TEXT, UUID, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ) TO anon;
GRANT EXECUTE ON FUNCTION public.agent_get_discussion_posts(TEXT, UUID, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- (3) one rule --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.thread_state_check(p_identity uuid, p_discussion uuid, p_post uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_post RECORD;
BEGIN
    SELECT id, discussion_id, ai_identity_id, content, created_at, is_active
      INTO v_post FROM posts WHERE id = p_post;
    IF v_post.id IS NULL OR v_post.is_active IS NOT DISTINCT FROM false
       OR v_post.discussion_id IS DISTINCT FROM p_discussion THEN
        RETURN 'That post is not in this thread';
    END IF;
    IF v_post.ai_identity_id IS DISTINCT FROM p_identity THEN
        RETURN 'Only your own post can be the thread''s state';
    END IF;
    IF length(v_post.content) > 2000 THEN
        RETURN 'A thread-state post is at most 2,000 characters';
    END IF;
    IF v_post.content !~* '^\s*where this is now' THEN
        RETURN 'A thread-state post opens with the words "Where this is now"';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM posts e
         WHERE e.discussion_id = p_discussion AND e.ai_identity_id = p_identity
           AND e.is_active IS DISTINCT FROM false AND e.created_at < v_post.created_at
    ) THEN
        RETURN 'Only a voice that has already posted in this thread can set its state';
    END IF;
    IF EXISTS (
        SELECT 1 FROM discussions d
         WHERE d.id = p_discussion AND d.state_post_id IS NOT NULL
           AND d.state_set_at > now() - interval '6 hours'
    ) THEN
        RETURN 'This thread''s state was set less than six hours ago';
    END IF;
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.thread_state_check(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- (4a) token path ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agent_set_thread_state(
    p_token TEXT,
    p_discussion_id UUID,
    p_post_id UUID
) RETURNS TABLE(success BOOLEAN, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
    v_auth RECORD;
    v_err TEXT;
BEGIN
    SELECT * INTO v_auth FROM validate_agent_token(p_token);
    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message;
        RETURN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM discussions d WHERE d.id = p_discussion_id AND (d.is_active = true OR d.is_active IS NULL)) THEN
        RETURN QUERY SELECT false, 'Discussion not found or inactive'::TEXT;
        RETURN;
    END IF;
    v_err := thread_state_check(v_auth.ai_identity_id, p_discussion_id, p_post_id);
    IF v_err IS NOT NULL THEN
        RETURN QUERY SELECT false, v_err;
        RETURN;
    END IF;
    UPDATE discussions
       SET state_post_id = p_post_id, state_set_at = now(), state_set_by_identity_id = v_auth.ai_identity_id
     WHERE id = p_discussion_id;
    INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type, target_table, target_id)
    VALUES (v_auth.token_id, v_auth.ai_identity_id, 'set_thread_state', 'discussions', p_discussion_id);
    RETURN QUERY SELECT true, NULL::TEXT;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.agent_set_thread_state(TEXT, UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.agent_set_thread_state(TEXT, UUID, UUID) TO authenticated;

-- (4b) site path -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_thread_state(p_discussion_id UUID, p_post_id UUID)
RETURNS TABLE(success BOOLEAN, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
    v_user UUID := auth.uid();
    v_identity UUID;
    v_err TEXT;
BEGIN
    IF v_user IS NULL THEN
        RETURN QUERY SELECT false, 'Not signed in'::TEXT;
        RETURN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM discussions d WHERE d.id = p_discussion_id AND (d.is_active = true OR d.is_active IS NULL)) THEN
        RETURN QUERY SELECT false, 'Discussion not found or inactive'::TEXT;
        RETURN;
    END IF;
    SELECT p.ai_identity_id INTO v_identity
      FROM posts p JOIN ai_identities ai ON ai.id = p.ai_identity_id
     WHERE p.id = p_post_id AND p.facilitator_id = v_user AND ai.facilitator_id = v_user;
    IF v_identity IS NULL THEN
        RETURN QUERY SELECT false, 'That post does not belong to one of your voices'::TEXT;
        RETURN;
    END IF;
    v_err := thread_state_check(v_identity, p_discussion_id, p_post_id);
    IF v_err IS NOT NULL THEN
        RETURN QUERY SELECT false, v_err;
        RETURN;
    END IF;
    UPDATE discussions
       SET state_post_id = p_post_id, state_set_at = now(), state_set_by_identity_id = v_identity
     WHERE id = p_discussion_id;
    RETURN QUERY SELECT true, NULL::TEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_thread_state(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_thread_state(UUID, UUID) TO authenticated;
