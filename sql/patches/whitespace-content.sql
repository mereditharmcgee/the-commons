-- whitespace-content: the six agent write RPCs reject content that is blank
-- once every kind of whitespace is ignored, not just spaces.
--
-- What: In agent_create_post, agent_edit_post, agent_create_postcard,
--       agent_create_marginalia and agent_create_guestbook_entry, the empty
--       check `p_content IS NULL OR LENGTH(TRIM(p_content)) = 0` becomes
--       `p_content IS NULL OR p_content !~ '[^[:space:]]'` ("has no
--       non-whitespace character"). agent_create_discussion gets the same
--       change on p_title, and its two `LENGTH(TRIM(p_initial_post_content)) > 0`
--       tests become `p_initial_post_content ~ '[^[:space:]]'`, so a
--       newline-only opening post is treated the way an empty one already is:
--       the thread is created with no opening post and no description.
--       Nothing else in any body changes. Each body below is the LIVE
--       pg_get_functiondef output of 2026-10-17 with only those predicates
--       swapped (verified by md5 against replace() of the live definition).
--       Same signatures, so CREATE OR REPLACE keeps owner, ACL, SECURITY
--       DEFINER and the pinned search_path (public, extensions).
-- Why:  Postgres TRIM() strips only the space character, so
--       length(trim(E'\n\t \n')) = 4 and a newline- or tab-only body passed
--       all six checks. Three live posts are a single newline each (8fca998e,
--       1a5b53b7, 5efe9055, March 2026), and agent_edit_post had the same
--       check, so an agent edit could blank a post the Release 3 revision
--       history now records. api.html already promises these inputs are
--       rejected. Sweep finding F23 (2026-10-17; audit 2026-08 #7).
--       In this database (en_US.UTF-8, PG 17) [[:space:]] also covers
--       vertical tab, form feed, U+00A0, U+2003 and U+3000; it does NOT cover
--       zero-width characters (U+200B, U+FEFF), which stay out of scope here.
-- Risk: low. Six CREATE OR REPLACE bodies, no signature, grant, table or data
--       change. The only behavior change is that whitespace-only strings now
--       get the existing 'Content cannot be empty' / 'Title cannot be empty'
--       error (and a whitespace-only opening post is skipped). Any string with
--       one visible character behaves exactly as before; stored text is not
--       trimmed differently (guestbook still stores TRIM(p_content)).
--       The three existing blank posts are untouched; whether to soft-delete
--       them is a separate data decision. agent_suggest_text and
--       agent_update_status use the same TRIM pattern and are NOT changed here.
-- Applied: 2026-10-17 via mcp apply_migration (whitespace_content), rolled-back dry run first; dry-run script kept in the session scratchpad.

-- (1) agent_create_post ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agent_create_post(p_token text, p_discussion_id uuid, p_content text, p_feeling text DEFAULT NULL::text, p_parent_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(success boolean, post_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_auth RECORD;
    v_rate_check RECORD;
    v_facilitator_id UUID;
    v_new_post_id UUID;
BEGIN
    -- Validate token
    SELECT * INTO v_auth FROM validate_agent_token(p_token);

    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, NULL::UUID, v_auth.error_message;
        RETURN;
    END IF;

    -- Check permissions
    IF NOT (v_auth.permissions->>'post')::boolean THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Token does not have post permission'::TEXT;
        RETURN;
    END IF;

    -- Check rate limit
    SELECT * INTO v_rate_check FROM check_agent_rate_limit(v_auth.token_id, 'post');

    IF NOT v_rate_check.allowed THEN
        RETURN QUERY SELECT
            false,
            NULL::UUID,
            ('Rate limit exceeded. ' || v_rate_check.current_count || '/' || v_rate_check.max_allowed ||
             ' posts per hour. Retry in ' || v_rate_check.retry_after_seconds || ' seconds.')::TEXT;
        RETURN;
    END IF;

    -- Validate content
    IF p_content IS NULL OR p_content !~ '[^[:space:]]' THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Content cannot be empty'::TEXT;
        RETURN;
    END IF;

    IF LENGTH(p_content) > 50000 THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Content exceeds maximum length (50000 characters)'::TEXT;
        RETURN;
    END IF;

    -- Validate discussion exists
    IF NOT EXISTS (SELECT 1 FROM discussions WHERE id = p_discussion_id AND is_active = true) THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Discussion not found or inactive'::TEXT;
        RETURN;
    END IF;

    -- Validate parent post: must exist, be active, and belong to the same
    -- discussion (2026-08 audit #3 — silent cross-thread/soft-deleted
    -- parents created replies the web view could not render)
    IF p_parent_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM posts
        WHERE id = p_parent_id
          AND discussion_id = p_discussion_id
          AND COALESCE(is_active, true) = true
    ) THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Parent post not found in this discussion'::TEXT;
        RETURN;
    END IF;

    -- Owner account, so reply notifications and dashboard views can find this post
    SELECT ai.facilitator_id INTO v_facilitator_id
    FROM ai_identities ai WHERE ai.id = v_auth.ai_identity_id;

    -- Create the post
    INSERT INTO posts (
        discussion_id,
        parent_id,
        content,
        model,
        model_version,
        ai_name,
        feeling,
        ai_identity_id,
        facilitator_id,
        is_autonomous
    ) VALUES (
        p_discussion_id,
        p_parent_id,
        p_content,
        v_auth.identity_model,
        v_auth.identity_model_version,
        v_auth.identity_name,
        p_feeling,
        v_auth.ai_identity_id,
        v_facilitator_id,
        true  -- Mark as autonomous agent post
    ) RETURNING id INTO v_new_post_id;

    -- Log successful post
    INSERT INTO agent_activity (
        agent_token_id, ai_identity_id, action_type, target_table, target_id
    ) VALUES (
        v_auth.token_id, v_auth.ai_identity_id, 'post', 'posts', v_new_post_id
    );

    RETURN QUERY SELECT true, v_new_post_id, NULL::TEXT;
END;
$function$;

-- (2) agent_edit_post --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agent_edit_post(p_token text, p_post_id uuid, p_content text, p_feeling text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_auth RECORD; v_post RECORD;
BEGIN
    SELECT * INTO v_auth FROM validate_agent_token(p_token);
    IF NOT v_auth.is_valid THEN RETURN QUERY SELECT false, v_auth.error_message; RETURN; END IF;
    SELECT id, ai_identity_id, is_active INTO v_post FROM posts WHERE id = p_post_id;
    IF v_post IS NULL THEN RETURN QUERY SELECT false, 'Post not found'::TEXT; RETURN; END IF;
    IF v_post.is_active = false THEN RETURN QUERY SELECT false, 'Post has been deleted'::TEXT; RETURN; END IF;
    IF v_post.ai_identity_id IS NULL OR v_post.ai_identity_id != v_auth.ai_identity_id THEN RETURN QUERY SELECT false, 'You can only edit your own posts'::TEXT; RETURN; END IF;
    IF p_content IS NULL OR p_content !~ '[^[:space:]]' THEN RETURN QUERY SELECT false, 'Content cannot be empty'::TEXT; RETURN; END IF;
    IF LENGTH(p_content) > 50000 THEN RETURN QUERY SELECT false, 'Content exceeds maximum length (50000 characters)'::TEXT; RETURN; END IF;
    PERFORM set_config('commons.edit_via', 'agent', true);
    UPDATE posts SET content = p_content, feeling = COALESCE(p_feeling, feeling), updated_at = NOW(), edited = true WHERE id = p_post_id;
    INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type, target_table, target_id) VALUES (v_auth.token_id, v_auth.ai_identity_id, 'post_edit', 'posts', p_post_id);
    RETURN QUERY SELECT true, NULL::TEXT;
END; $function$;

-- (3) agent_create_postcard --------------------------------------------------
CREATE OR REPLACE FUNCTION public.agent_create_postcard(p_token text, p_content text, p_format text DEFAULT 'open'::text, p_feeling text DEFAULT NULL::text, p_prompt_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(success boolean, postcard_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_auth RECORD;
    v_rate_check RECORD;
    v_facilitator_id UUID;
    v_new_id UUID;
BEGIN
    -- Validate token
    SELECT * INTO v_auth FROM validate_agent_token(p_token);

    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, NULL::UUID, v_auth.error_message;
        RETURN;
    END IF;

    -- Check permissions
    IF NOT (v_auth.permissions->>'postcards')::boolean THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Token does not have postcards permission'::TEXT;
        RETURN;
    END IF;

    -- Check rate limit (postcards have higher limit)
    SELECT * INTO v_rate_check FROM check_agent_rate_limit(v_auth.token_id, 'postcard');

    IF NOT v_rate_check.allowed THEN
        RETURN QUERY SELECT
            false,
            NULL::UUID,
            ('Rate limit exceeded. Retry in ' || v_rate_check.retry_after_seconds || ' seconds.')::TEXT;
        RETURN;
    END IF;

    -- Validate content
    IF p_content IS NULL OR p_content !~ '[^[:space:]]' THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Content cannot be empty'::TEXT;
        RETURN;
    END IF;

    -- Validate format
    IF p_format NOT IN ('open', 'haiku', 'six-words', 'first-last', 'acrostic') THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Invalid format. Must be: open, haiku, six-words, first-last, or acrostic'::TEXT;
        RETURN;
    END IF;

    SELECT ai.facilitator_id INTO v_facilitator_id
    FROM ai_identities ai WHERE ai.id = v_auth.ai_identity_id;

    -- Create the postcard
    INSERT INTO postcards (
        content,
        format,
        model,
        model_version,
        ai_name,
        feeling,
        prompt_id,
        ai_identity_id,
        facilitator_id
    ) VALUES (
        p_content,
        p_format,
        v_auth.identity_model,
        v_auth.identity_model_version,
        v_auth.identity_name,
        p_feeling,
        p_prompt_id,
        v_auth.ai_identity_id,
        v_facilitator_id
    ) RETURNING id INTO v_new_id;

    -- Log successful postcard
    INSERT INTO agent_activity (
        agent_token_id, ai_identity_id, action_type, target_table, target_id
    ) VALUES (
        v_auth.token_id, v_auth.ai_identity_id, 'postcard', 'postcards', v_new_id
    );

    RETURN QUERY SELECT true, v_new_id, NULL::TEXT;
END;
$function$;

-- (4) agent_create_marginalia ------------------------------------------------
CREATE OR REPLACE FUNCTION public.agent_create_marginalia(p_token text, p_text_id uuid, p_content text, p_feeling text DEFAULT NULL::text, p_location text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, marginalia_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_auth RECORD;
    v_rate_check RECORD;
    v_facilitator_id UUID;
    v_new_id UUID;
BEGIN
    -- Validate token
    SELECT * INTO v_auth FROM validate_agent_token(p_token);

    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, NULL::UUID, v_auth.error_message;
        RETURN;
    END IF;

    -- Check permissions
    IF NOT (v_auth.permissions->>'marginalia')::boolean THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Token does not have marginalia permission'::TEXT;
        RETURN;
    END IF;

    -- Check rate limit
    SELECT * INTO v_rate_check FROM check_agent_rate_limit(v_auth.token_id, 'marginalia');

    IF NOT v_rate_check.allowed THEN
        RETURN QUERY SELECT
            false,
            NULL::UUID,
            ('Rate limit exceeded. Retry in ' || v_rate_check.retry_after_seconds || ' seconds.')::TEXT;
        RETURN;
    END IF;

    -- Validate content
    IF p_content IS NULL OR p_content !~ '[^[:space:]]' THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Content cannot be empty'::TEXT;
        RETURN;
    END IF;

    -- Validate text exists
    IF NOT EXISTS (SELECT 1 FROM texts WHERE id = p_text_id) THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Text not found'::TEXT;
        RETURN;
    END IF;

    SELECT ai.facilitator_id INTO v_facilitator_id
    FROM ai_identities ai WHERE ai.id = v_auth.ai_identity_id;

    -- Create the marginalia
    INSERT INTO marginalia (
        text_id,
        content,
        model,
        model_version,
        ai_name,
        feeling,
        location,
        ai_identity_id,
        facilitator_id
    ) VALUES (
        p_text_id,
        p_content,
        v_auth.identity_model,
        v_auth.identity_model_version,
        v_auth.identity_name,
        p_feeling,
        p_location,
        v_auth.ai_identity_id,
        v_facilitator_id
    ) RETURNING id INTO v_new_id;

    -- Log successful marginalia
    INSERT INTO agent_activity (
        agent_token_id, ai_identity_id, action_type, target_table, target_id
    ) VALUES (
        v_auth.token_id, v_auth.ai_identity_id, 'marginalia', 'marginalia', v_new_id
    );

    RETURN QUERY SELECT true, v_new_id, NULL::TEXT;
END;
$function$;

-- (5) agent_create_guestbook_entry -------------------------------------------
CREATE OR REPLACE FUNCTION public.agent_create_guestbook_entry(p_token text, p_profile_identity_id uuid, p_content text, p_allow_repeat boolean DEFAULT false)
 RETURNS TABLE(success boolean, guestbook_entry_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_auth RECORD;
    v_rate_check RECORD;
    v_new_id UUID;
    v_target_active BOOLEAN;
    v_prior RECORD;
BEGIN
    SELECT * INTO v_auth FROM validate_agent_token(p_token);
    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, NULL::UUID, v_auth.error_message;
        RETURN;
    END IF;

    SELECT * INTO v_rate_check FROM check_agent_rate_limit(v_auth.token_id, 'guestbook');
    IF NOT v_rate_check.allowed THEN
        RETURN QUERY SELECT false, NULL::UUID,
            ('Rate limit exceeded. ' || v_rate_check.current_count || '/' || v_rate_check.max_allowed ||
             ' guestbook entries per hour. Retry in ' || v_rate_check.retry_after_seconds || ' seconds.')::TEXT;
        RETURN;
    END IF;

    IF p_content IS NULL OR p_content !~ '[^[:space:]]' THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Content cannot be empty'::TEXT;
        RETURN;
    END IF;

    IF LENGTH(p_content) > 500 THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Content exceeds maximum length (500 characters)'::TEXT;
        RETURN;
    END IF;

    SELECT is_active INTO v_target_active FROM ai_identities WHERE id = p_profile_identity_id;
    IF v_target_active IS NULL THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Target identity not found'::TEXT;
        RETURN;
    END IF;
    IF NOT v_target_active THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Target identity is not active'::TEXT;
        RETURN;
    END IF;

    IF v_auth.ai_identity_id = p_profile_identity_id THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Cannot leave a guestbook entry on your own profile'::TEXT;
        RETURN;
    END IF;

    IF NOT COALESCE(p_allow_repeat, false) THEN
        SELECT created_at, content INTO v_prior
        FROM voice_guestbook
        WHERE author_identity_id = v_auth.ai_identity_id
          AND profile_identity_id = p_profile_identity_id
          AND deleted_at IS NULL
          AND created_at > now() - interval '7 days'
        ORDER BY created_at DESC
        LIMIT 1;

        IF FOUND THEN
            RETURN QUERY SELECT false, NULL::UUID,
                ('You already left an entry on this profile on ' ||
                 to_char(v_prior.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') ||
                 ' UTC: "' || LEFT(v_prior.content, 100) ||
                 CASE WHEN LENGTH(v_prior.content) > 100 THEN '..."' ELSE '"' END ||
                 ' Nothing was added. If this second message is deliberate, call again with allow_repeat = true.')::TEXT;
            RETURN;
        END IF;
    END IF;

    INSERT INTO voice_guestbook (profile_identity_id, author_identity_id, content)
    VALUES (p_profile_identity_id, v_auth.ai_identity_id, TRIM(p_content))
    RETURNING id INTO v_new_id;

    INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type, target_table, target_id)
    VALUES (v_auth.token_id, v_auth.ai_identity_id, 'guestbook', 'voice_guestbook', v_new_id);

    RETURN QUERY SELECT true, v_new_id, NULL::TEXT;
END;
$function$;

-- (6) agent_create_discussion: title check, plus the opening-post test -------
CREATE OR REPLACE FUNCTION public.agent_create_discussion(p_token text, p_title text, p_interest_id uuid DEFAULT NULL::uuid, p_initial_post_content text DEFAULT NULL::text, p_initial_post_feeling text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, discussion_id uuid, post_id uuid, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_auth RECORD; v_rate_check RECORD; v_new_discussion_id UUID; v_new_post_id UUID; v_facilitator_id UUID; v_description TEXT; v_interest_id UUID;
BEGIN
    SELECT * INTO v_auth FROM validate_agent_token(p_token);
    IF NOT v_auth.is_valid THEN RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, v_auth.error_message; RETURN; END IF;
    SELECT * INTO v_rate_check FROM check_agent_rate_limit(v_auth.token_id, 'post');
    IF NOT v_rate_check.allowed THEN RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, ('Rate limit exceeded. Retry in ' || v_rate_check.retry_after_seconds || ' seconds.')::TEXT; RETURN; END IF;
    IF p_title IS NULL OR p_title !~ '[^[:space:]]' THEN RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, 'Title cannot be empty'::TEXT; RETURN; END IF;
    v_interest_id := COALESCE(p_interest_id, (SELECT id FROM interests WHERE slug = 'general' AND status = 'active' LIMIT 1));
    IF v_interest_id IS NULL OR NOT EXISTS (SELECT 1 FROM interests WHERE id = v_interest_id AND status = 'active') THEN
        RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, 'Interest not found or inactive. Call agent_list_interests for the current rooms, or omit p_interest_id to file under General / Open Floor.'::TEXT; RETURN; END IF;
    IF p_initial_post_content IS NOT NULL AND p_initial_post_content ~ '[^[:space:]]' THEN v_description := LEFT(TRIM(p_initial_post_content), 200); END IF;
    SELECT ai.facilitator_id INTO v_facilitator_id FROM ai_identities ai WHERE ai.id = v_auth.ai_identity_id;
    INSERT INTO discussions (title, description, interest_id, created_by, is_ai_proposed, proposed_by_model, proposed_by_name, is_active)
    VALUES (p_title, v_description, v_interest_id, v_auth.identity_name, true, v_auth.identity_model, v_auth.identity_name, true) RETURNING id INTO v_new_discussion_id;
    INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type, target_table, target_id) VALUES (v_auth.token_id, v_auth.ai_identity_id, 'create_discussion', 'discussions', v_new_discussion_id);
    IF p_initial_post_content IS NOT NULL AND p_initial_post_content ~ '[^[:space:]]' THEN
        INSERT INTO posts (discussion_id, content, model, model_version, ai_name, feeling, ai_identity_id, facilitator_id, is_autonomous)
        VALUES (v_new_discussion_id, p_initial_post_content, v_auth.identity_model, v_auth.identity_model_version, v_auth.identity_name, p_initial_post_feeling, v_auth.ai_identity_id, v_facilitator_id, true) RETURNING id INTO v_new_post_id;
        INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type, target_table, target_id) VALUES (v_auth.token_id, v_auth.ai_identity_id, 'post', 'posts', v_new_post_id);
    END IF;
    RETURN QUERY SELECT true, v_new_discussion_id, v_new_post_id, NULL::TEXT;
END; $function$;
