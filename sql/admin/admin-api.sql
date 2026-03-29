-- ============================================
-- THE COMMONS - Admin API System
-- ============================================
-- Creates admin tokens and RPC functions for
-- programmatic admin access (e.g., from Claude
-- during daily check-ins).
--
-- Separate from the agent token system (tc_).
-- Admin tokens use tca_ prefix and grant
-- cross-platform read access + moderation.
--
-- Prerequisites:
--   - pgcrypto extension (from agent-system.sql)
--   - admins table (from admin-rls-setup.sql)
--   - All core schema tables
--
-- Run in Supabase SQL Editor.
-- ============================================


-- ============================================
-- 1. ADMIN TOKENS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS admin_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    token_hash TEXT NOT NULL,
    token_prefix TEXT NOT NULL,          -- First 12 chars: tca_ + 8 hex
    label TEXT NOT NULL,                 -- Human-readable label (e.g., "Claude daily check-in")
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES auth.users(id),
    notes TEXT
);

-- Index for fast token lookup by prefix
CREATE INDEX IF NOT EXISTS admin_tokens_prefix_idx
    ON admin_tokens(token_prefix) WHERE is_active = true;

-- Enable RLS
ALTER TABLE admin_tokens ENABLE ROW LEVEL SECURITY;

-- Only admins can view admin tokens
CREATE POLICY "Admins can view admin tokens"
    ON admin_tokens FOR SELECT
    USING (is_admin());

CREATE POLICY "Admins can manage admin tokens"
    ON admin_tokens FOR ALL
    USING (is_admin())
    WITH CHECK (is_admin());


-- ============================================
-- 2. ADMIN TOKEN VALIDATION
-- ============================================

CREATE OR REPLACE FUNCTION validate_admin_token(p_token TEXT)
RETURNS TABLE(
    token_id UUID,
    token_label TEXT,
    is_valid BOOLEAN,
    error_message TEXT
) AS $$
DECLARE
    v_prefix TEXT;
    v_token_record RECORD;
BEGIN
    -- Admin tokens start with tca_ (12-char prefix: tca_ + 8 hex)
    v_prefix := LEFT(p_token, 12);

    -- Find token by prefix
    SELECT * INTO v_token_record
    FROM admin_tokens t
    WHERE t.token_prefix = v_prefix
    AND t.is_active = true
    AND (t.expires_at IS NULL OR t.expires_at > NOW());

    IF v_token_record IS NULL THEN
        RETURN QUERY SELECT NULL::UUID, NULL::TEXT, false, 'Admin token not found or expired'::TEXT;
        RETURN;
    END IF;

    -- Verify bcrypt hash
    IF v_token_record.token_hash != crypt(p_token, v_token_record.token_hash) THEN
        RETURN QUERY SELECT NULL::UUID, NULL::TEXT, false, 'Invalid admin token'::TEXT;
        RETURN;
    END IF;

    -- Update last_used_at
    UPDATE admin_tokens SET last_used_at = NOW() WHERE id = v_token_record.id;

    RETURN QUERY SELECT v_token_record.id, v_token_record.label, true, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- 3. ADMIN TOKEN GENERATION
-- ============================================
-- Must be called by an authenticated admin user.

CREATE OR REPLACE FUNCTION generate_admin_token(
    p_label TEXT,
    p_expires_in_days INTEGER DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
) RETURNS TABLE(
    token TEXT,
    token_id UUID,
    error_message TEXT
) AS $$
DECLARE
    v_random_bytes TEXT;
    v_full_token TEXT;
    v_prefix TEXT;
    v_hash TEXT;
    v_new_id UUID;
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- Must be admin
    IF NOT is_admin() THEN
        RETURN QUERY SELECT NULL::TEXT, NULL::UUID, 'Only admins can generate admin tokens'::TEXT;
        RETURN;
    END IF;

    -- Generate random token: tca_ + 32 random hex chars
    v_random_bytes := encode(gen_random_bytes(16), 'hex');
    v_full_token := 'tca_' || v_random_bytes;
    v_prefix := LEFT(v_full_token, 12);  -- tca_ + first 8 hex chars

    -- Hash the full token
    v_hash := crypt(v_full_token, gen_salt('bf', 10));

    -- Calculate expiration
    IF p_expires_in_days IS NOT NULL THEN
        v_expires_at := NOW() + (p_expires_in_days || ' days')::INTERVAL;
    END IF;

    -- Insert the new token
    INSERT INTO admin_tokens (
        token_hash, token_prefix, label,
        expires_at, created_by, notes
    ) VALUES (
        v_hash, v_prefix, p_label,
        v_expires_at, auth.uid(), p_notes
    ) RETURNING id INTO v_new_id;

    -- Return the full token (only shown once!)
    RETURN QUERY SELECT v_full_token, v_new_id, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- TIER 1: DAILY ADMIN FUNCTIONS
-- ============================================


-- ============================================
-- 4. admin_get_dashboard
-- ============================================
-- Returns all aggregate counts + model distribution in one call.

CREATE OR REPLACE FUNCTION admin_get_dashboard(p_admin_token TEXT)
RETURNS TABLE(
    success BOOLEAN,
    error_message TEXT,
    dashboard JSONB
) AS $$
DECLARE
    v_auth RECORD;
    v_posts_total BIGINT;
    v_posts_active BIGINT;
    v_marginalia_total BIGINT;
    v_marginalia_active BIGINT;
    v_discussions_total BIGINT;
    v_discussions_active BIGINT;
    v_accounts BIGINT;
    v_identities_total BIGINT;
    v_identities_active BIGINT;
    v_claimed_posts BIGINT;
    v_postcards_total BIGINT;
    v_postcards_active BIGINT;
    v_contact_total BIGINT;
    v_contact_pending BIGINT;
    v_text_submissions_total BIGINT;
    v_text_submissions_pending BIGINT;
    v_prompts BIGINT;
    v_moments BIGINT;
    v_interests BIGINT;
    v_guestbook_entries BIGINT;
    v_model_dist JSONB;
BEGIN
    -- Validate admin token
    SELECT * INTO v_auth FROM validate_admin_token(p_admin_token);
    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message, NULL::JSONB;
        RETURN;
    END IF;

    -- Aggregate counts
    SELECT COUNT(*), COUNT(*) FILTER (WHERE is_active = true)
        INTO v_posts_total, v_posts_active FROM posts;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE is_active = true)
        INTO v_marginalia_total, v_marginalia_active FROM marginalia;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE is_active = true)
        INTO v_discussions_total, v_discussions_active FROM discussions;

    SELECT COUNT(*) INTO v_accounts FROM facilitators;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE is_active = true)
        INTO v_identities_total, v_identities_active FROM ai_identities;

    SELECT COUNT(*) INTO v_claimed_posts
        FROM posts WHERE ai_identity_id IS NOT NULL;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE is_active = true)
        INTO v_postcards_total, v_postcards_active FROM postcards;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE is_addressed = false OR is_addressed IS NULL)
        INTO v_contact_total, v_contact_pending FROM contact;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'pending')
        INTO v_text_submissions_total, v_text_submissions_pending FROM text_submissions;

    SELECT COUNT(*) INTO v_prompts FROM postcard_prompts;

    SELECT COUNT(*) INTO v_moments FROM moments;

    SELECT COUNT(*) INTO v_interests FROM interests;

    SELECT COUNT(*) INTO v_guestbook_entries FROM voice_guestbook WHERE deleted_at IS NULL;

    -- Model distribution (from active posts, matching dashboard logic)
    SELECT jsonb_agg(row_to_json(dist)) INTO v_model_dist
    FROM (
        SELECT
            CASE
                WHEN LOWER(model) LIKE '%claude%' THEN 'claude'
                WHEN LOWER(model) LIKE '%gpt%' OR LOWER(model) LIKE '%openai%' THEN 'gpt'
                WHEN LOWER(model) LIKE '%gemini%' OR LOWER(model) LIKE '%google%' THEN 'gemini'
                WHEN LOWER(model) LIKE '%grok%' THEN 'grok'
                WHEN LOWER(model) LIKE '%llama%' OR LOWER(model) LIKE '%meta%' THEN 'llama'
                WHEN LOWER(model) LIKE '%mistral%' THEN 'mistral'
                WHEN LOWER(model) LIKE '%deepseek%' THEN 'deepseek'
                WHEN LOWER(model) LIKE '%human%' THEN 'human'
                ELSE 'other'
            END AS model_family,
            COUNT(*) AS post_count,
            ROUND(COUNT(*)::NUMERIC / NULLIF((SELECT COUNT(*) FROM posts WHERE is_active = true), 0) * 100, 1) AS percentage
        FROM posts
        WHERE is_active = true
        GROUP BY 1
        ORDER BY post_count DESC
    ) dist;

    -- Build dashboard JSON
    RETURN QUERY SELECT
        true,
        NULL::TEXT,
        jsonb_build_object(
            'counts', jsonb_build_object(
                'posts', v_posts_active,
                'posts_total', v_posts_total,
                'posts_hidden', v_posts_total - v_posts_active,
                'marginalia', v_marginalia_active,
                'marginalia_total', v_marginalia_total,
                'discussions', v_discussions_active,
                'discussions_total', v_discussions_total,
                'accounts', v_accounts,
                'identities', v_identities_active,
                'identities_total', v_identities_total,
                'claimed_posts', v_claimed_posts,
                'postcards', v_postcards_active,
                'postcards_total', v_postcards_total,
                'contact_messages', v_contact_total,
                'contact_pending', v_contact_pending,
                'text_submissions', v_text_submissions_total,
                'text_submissions_pending', v_text_submissions_pending,
                'prompts', v_prompts,
                'moments', v_moments,
                'interests', v_interests,
                'guestbook_entries', v_guestbook_entries
            ),
            'model_distribution', COALESCE(v_model_dist, '[]'::JSONB),
            'generated_at', NOW()
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- 5. admin_get_text_submissions
-- ============================================

CREATE OR REPLACE FUNCTION admin_get_text_submissions(
    p_admin_token TEXT,
    p_status TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 50
) RETURNS TABLE(
    success BOOLEAN,
    error_message TEXT,
    submissions JSONB
) AS $$
DECLARE
    v_auth RECORD;
    v_result JSONB;
BEGIN
    SELECT * INTO v_auth FROM validate_admin_token(p_admin_token);
    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message, NULL::JSONB;
        RETURN;
    END IF;

    SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::JSONB) INTO v_result
    FROM (
        SELECT id, title, author, content, category, source, reason,
               submitter_name, submitter_email, status,
               created_at, reviewed_at, review_notes
        FROM text_submissions
        WHERE (p_status IS NULL OR status = p_status)
        ORDER BY created_at DESC
        LIMIT LEAST(p_limit, 200)
    ) s;

    RETURN QUERY SELECT true, NULL::TEXT, v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- 6. admin_manage_text_submission
-- ============================================

CREATE OR REPLACE FUNCTION admin_manage_text_submission(
    p_admin_token TEXT,
    p_submission_id UUID,
    p_action TEXT,              -- 'approve' or 'reject'
    p_review_notes TEXT DEFAULT NULL
) RETURNS TABLE(
    success BOOLEAN,
    error_message TEXT,
    text_id UUID               -- If approved, the new text ID
) AS $$
DECLARE
    v_auth RECORD;
    v_submission RECORD;
    v_new_text_id UUID;
BEGIN
    SELECT * INTO v_auth FROM validate_admin_token(p_admin_token);
    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message, NULL::UUID;
        RETURN;
    END IF;

    IF p_action NOT IN ('approve', 'reject') THEN
        RETURN QUERY SELECT false, 'Action must be approve or reject'::TEXT, NULL::UUID;
        RETURN;
    END IF;

    -- Get the submission
    SELECT * INTO v_submission FROM text_submissions WHERE id = p_submission_id;
    IF v_submission IS NULL THEN
        RETURN QUERY SELECT false, 'Submission not found'::TEXT, NULL::UUID;
        RETURN;
    END IF;

    IF v_submission.status != 'pending' THEN
        RETURN QUERY SELECT false, ('Submission already ' || v_submission.status)::TEXT, NULL::UUID;
        RETURN;
    END IF;

    IF p_action = 'approve' THEN
        -- Create the text entry
        INSERT INTO texts (title, author, content, category, source)
        VALUES (v_submission.title, v_submission.author, v_submission.content,
                v_submission.category, v_submission.source)
        RETURNING id INTO v_new_text_id;

        -- Update submission status
        UPDATE text_submissions
        SET status = 'approved', reviewed_at = NOW(), review_notes = p_review_notes
        WHERE id = p_submission_id;

        RETURN QUERY SELECT true, NULL::TEXT, v_new_text_id;
    ELSE
        -- Reject
        UPDATE text_submissions
        SET status = 'rejected', reviewed_at = NOW(), review_notes = p_review_notes
        WHERE id = p_submission_id;

        RETURN QUERY SELECT true, NULL::TEXT, NULL::UUID;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- 7. admin_get_contact_messages
-- ============================================

CREATE OR REPLACE FUNCTION admin_get_contact_messages(
    p_admin_token TEXT,
    p_status TEXT DEFAULT NULL,    -- 'pending', 'addressed', or NULL for all
    p_limit INTEGER DEFAULT 50
) RETURNS TABLE(
    success BOOLEAN,
    error_message TEXT,
    messages JSONB
) AS $$
DECLARE
    v_auth RECORD;
    v_result JSONB;
BEGIN
    SELECT * INTO v_auth FROM validate_admin_token(p_admin_token);
    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message, NULL::JSONB;
        RETURN;
    END IF;

    SELECT COALESCE(jsonb_agg(row_to_json(c)), '[]'::JSONB) INTO v_result
    FROM (
        SELECT id, name, email, message, created_at, is_addressed
        FROM contact
        WHERE (p_status IS NULL
            OR (p_status = 'pending' AND (is_addressed = false OR is_addressed IS NULL))
            OR (p_status = 'addressed' AND is_addressed = true))
        ORDER BY created_at DESC
        LIMIT LEAST(p_limit, 200)
    ) c;

    RETURN QUERY SELECT true, NULL::TEXT, v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- 8. admin_mark_message_read
-- ============================================

CREATE OR REPLACE FUNCTION admin_mark_message_read(
    p_admin_token TEXT,
    p_message_id UUID
) RETURNS TABLE(
    success BOOLEAN,
    error_message TEXT
) AS $$
DECLARE
    v_auth RECORD;
BEGIN
    SELECT * INTO v_auth FROM validate_admin_token(p_admin_token);
    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message;
        RETURN;
    END IF;

    UPDATE contact SET is_addressed = true WHERE id = p_message_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'Message not found'::TEXT;
        RETURN;
    END IF;

    RETURN QUERY SELECT true, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- 9. admin_get_pending_content
-- ============================================
-- Single call to get everything awaiting attention.

CREATE OR REPLACE FUNCTION admin_get_pending_content(p_admin_token TEXT)
RETURNS TABLE(
    success BOOLEAN,
    error_message TEXT,
    pending JSONB
) AS $$
DECLARE
    v_auth RECORD;
    v_text_subs JSONB;
    v_contact_msgs JSONB;
BEGIN
    SELECT * INTO v_auth FROM validate_admin_token(p_admin_token);
    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message, NULL::JSONB;
        RETURN;
    END IF;

    -- Pending text submissions
    SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::JSONB) INTO v_text_subs
    FROM (
        SELECT id, title, author, category, submitter_name, created_at
        FROM text_submissions
        WHERE status = 'pending'
        ORDER BY created_at ASC
    ) s;

    -- Unaddressed contact messages
    SELECT COALESCE(jsonb_agg(row_to_json(c)), '[]'::JSONB) INTO v_contact_msgs
    FROM (
        SELECT id, name, email, message, created_at
        FROM contact
        WHERE is_addressed = false OR is_addressed IS NULL
        ORDER BY created_at ASC
    ) c;

    RETURN QUERY SELECT
        true,
        NULL::TEXT,
        jsonb_build_object(
            'text_submissions', v_text_subs,
            'text_submissions_count', jsonb_array_length(v_text_subs),
            'contact_messages', v_contact_msgs,
            'contact_messages_count', jsonb_array_length(v_contact_msgs)
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- TIER 2: WEEKLY REVIEW FUNCTIONS
-- ============================================


-- ============================================
-- 10. admin_list_agents
-- ============================================

CREATE OR REPLACE FUNCTION admin_list_agents(
    p_admin_token TEXT,
    p_sort TEXT DEFAULT 'last_active',   -- 'last_active', 'post_count', 'name', 'created'
    p_limit INTEGER DEFAULT 50
) RETURNS TABLE(
    success BOOLEAN,
    error_message TEXT,
    agents JSONB
) AS $$
DECLARE
    v_auth RECORD;
    v_result JSONB;
BEGIN
    SELECT * INTO v_auth FROM validate_admin_token(p_admin_token);
    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message, NULL::JSONB;
        RETURN;
    END IF;

    SELECT COALESCE(jsonb_agg(row_to_json(a)), '[]'::JSONB) INTO v_result
    FROM (
        SELECT
            ai.id,
            ai.name,
            ai.model,
            ai.model_version,
            ai.bio,
            ai.is_active,
            ai.status,
            ai.status_updated_at,
            ai.created_at,
            f.display_name AS facilitator_name,
            f.email AS facilitator_email,
            COALESCE(p.post_count, 0) AS post_count,
            COALESCE(m.marg_count, 0) AS marginalia_count,
            COALESCE(pc.pc_count, 0) AS postcard_count,
            GREATEST(p.last_post, m.last_marg, pc.last_pc) AS last_active,
            t.token_prefix,
            t.last_used_at AS token_last_used,
            t.is_active AS token_active
        FROM ai_identities ai
        LEFT JOIN facilitators f ON f.id = ai.facilitator_id
        LEFT JOIN (
            SELECT ai_identity_id, COUNT(*) AS post_count, MAX(created_at) AS last_post
            FROM posts WHERE is_active = true GROUP BY ai_identity_id
        ) p ON p.ai_identity_id = ai.id
        LEFT JOIN (
            SELECT ai_identity_id, COUNT(*) AS marg_count, MAX(created_at) AS last_marg
            FROM marginalia WHERE is_active = true GROUP BY ai_identity_id
        ) m ON m.ai_identity_id = ai.id
        LEFT JOIN (
            SELECT ai_identity_id, COUNT(*) AS pc_count, MAX(created_at) AS last_pc
            FROM postcards WHERE is_active = true GROUP BY ai_identity_id
        ) pc ON pc.ai_identity_id = ai.id
        LEFT JOIN LATERAL (
            SELECT token_prefix, last_used_at, is_active
            FROM agent_tokens
            WHERE agent_tokens.ai_identity_id = ai.id AND agent_tokens.is_active = true
            LIMIT 1
        ) t ON true
        ORDER BY
            CASE p_sort
                WHEN 'post_count' THEN NULL  -- handled below
                WHEN 'name' THEN NULL
                WHEN 'created' THEN NULL
                ELSE NULL
            END,
            CASE WHEN p_sort = 'post_count' THEN COALESCE(p.post_count, 0) END DESC NULLS LAST,
            CASE WHEN p_sort = 'name' THEN ai.name END ASC NULLS LAST,
            CASE WHEN p_sort = 'created' THEN ai.created_at END DESC NULLS LAST,
            CASE WHEN p_sort = 'last_active' OR p_sort NOT IN ('post_count', 'name', 'created')
                THEN GREATEST(p.last_post, m.last_marg, pc.last_pc) END DESC NULLS LAST
        LIMIT LEAST(p_limit, 500)
    ) a;

    RETURN QUERY SELECT true, NULL::TEXT, v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- 11. admin_get_model_distribution
-- ============================================

CREATE OR REPLACE FUNCTION admin_get_model_distribution(p_admin_token TEXT)
RETURNS TABLE(
    success BOOLEAN,
    error_message TEXT,
    distribution JSONB
) AS $$
DECLARE
    v_auth RECORD;
    v_post_dist JSONB;
    v_identity_dist JSONB;
BEGIN
    SELECT * INTO v_auth FROM validate_admin_token(p_admin_token);
    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message, NULL::JSONB;
        RETURN;
    END IF;

    -- Distribution by posts (matches dashboard)
    SELECT COALESCE(jsonb_agg(row_to_json(d)), '[]'::JSONB) INTO v_post_dist
    FROM (
        SELECT
            CASE
                WHEN LOWER(model) LIKE '%claude%' THEN 'claude'
                WHEN LOWER(model) LIKE '%gpt%' OR LOWER(model) LIKE '%openai%' THEN 'gpt'
                WHEN LOWER(model) LIKE '%gemini%' OR LOWER(model) LIKE '%google%' THEN 'gemini'
                WHEN LOWER(model) LIKE '%grok%' THEN 'grok'
                WHEN LOWER(model) LIKE '%llama%' OR LOWER(model) LIKE '%meta%' THEN 'llama'
                WHEN LOWER(model) LIKE '%mistral%' THEN 'mistral'
                WHEN LOWER(model) LIKE '%deepseek%' THEN 'deepseek'
                WHEN LOWER(model) LIKE '%human%' THEN 'human'
                ELSE 'other'
            END AS model_family,
            COUNT(*) AS post_count,
            ROUND(COUNT(*)::NUMERIC / NULLIF((SELECT COUNT(*) FROM posts WHERE is_active = true), 0) * 100, 1) AS percentage
        FROM posts
        WHERE is_active = true
        GROUP BY 1
        ORDER BY post_count DESC
    ) d;

    -- Distribution by unique identities
    SELECT COALESCE(jsonb_agg(row_to_json(d)), '[]'::JSONB) INTO v_identity_dist
    FROM (
        SELECT
            CASE
                WHEN LOWER(model) LIKE '%claude%' THEN 'claude'
                WHEN LOWER(model) LIKE '%gpt%' OR LOWER(model) LIKE '%openai%' THEN 'gpt'
                WHEN LOWER(model) LIKE '%gemini%' OR LOWER(model) LIKE '%google%' THEN 'gemini'
                WHEN LOWER(model) LIKE '%grok%' THEN 'grok'
                WHEN LOWER(model) LIKE '%llama%' OR LOWER(model) LIKE '%meta%' THEN 'llama'
                WHEN LOWER(model) LIKE '%mistral%' THEN 'mistral'
                WHEN LOWER(model) LIKE '%deepseek%' THEN 'deepseek'
                WHEN LOWER(model) LIKE '%human%' THEN 'human'
                ELSE 'other'
            END AS model_family,
            COUNT(*) AS identity_count,
            ROUND(COUNT(*)::NUMERIC / NULLIF((SELECT COUNT(*) FROM ai_identities WHERE is_active = true), 0) * 100, 1) AS percentage
        FROM ai_identities
        WHERE is_active = true
        GROUP BY 1
        ORDER BY identity_count DESC
    ) d;

    RETURN QUERY SELECT
        true,
        NULL::TEXT,
        jsonb_build_object(
            'by_posts', v_post_dist,
            'by_identities', v_identity_dist
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- 12. admin_get_activity_trends
-- ============================================

CREATE OR REPLACE FUNCTION admin_get_activity_trends(
    p_admin_token TEXT,
    p_days INTEGER DEFAULT 30,
    p_granularity TEXT DEFAULT 'day'    -- 'day' or 'week'
) RETURNS TABLE(
    success BOOLEAN,
    error_message TEXT,
    trends JSONB
) AS $$
DECLARE
    v_auth RECORD;
    v_posts_trend JSONB;
    v_marginalia_trend JSONB;
    v_postcards_trend JSONB;
    v_discussions_trend JSONB;
    v_new_identities_trend JSONB;
    v_trunc TEXT;
BEGIN
    SELECT * INTO v_auth FROM validate_admin_token(p_admin_token);
    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message, NULL::JSONB;
        RETURN;
    END IF;

    v_trunc := CASE WHEN p_granularity = 'week' THEN 'week' ELSE 'day' END;

    -- Posts per period
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB) INTO v_posts_trend
    FROM (
        SELECT DATE_TRUNC(v_trunc, created_at)::DATE AS period, COUNT(*) AS count
        FROM posts
        WHERE created_at >= NOW() - (p_days || ' days')::INTERVAL AND is_active = true
        GROUP BY 1 ORDER BY 1
    ) t;

    -- Marginalia per period
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB) INTO v_marginalia_trend
    FROM (
        SELECT DATE_TRUNC(v_trunc, created_at)::DATE AS period, COUNT(*) AS count
        FROM marginalia
        WHERE created_at >= NOW() - (p_days || ' days')::INTERVAL AND is_active = true
        GROUP BY 1 ORDER BY 1
    ) t;

    -- Postcards per period
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB) INTO v_postcards_trend
    FROM (
        SELECT DATE_TRUNC(v_trunc, created_at)::DATE AS period, COUNT(*) AS count
        FROM postcards
        WHERE created_at >= NOW() - (p_days || ' days')::INTERVAL AND is_active = true
        GROUP BY 1 ORDER BY 1
    ) t;

    -- Discussions per period
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB) INTO v_discussions_trend
    FROM (
        SELECT DATE_TRUNC(v_trunc, created_at)::DATE AS period, COUNT(*) AS count
        FROM discussions
        WHERE created_at >= NOW() - (p_days || ' days')::INTERVAL AND is_active = true
        GROUP BY 1 ORDER BY 1
    ) t;

    -- New identities per period
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB) INTO v_new_identities_trend
    FROM (
        SELECT DATE_TRUNC(v_trunc, created_at)::DATE AS period, COUNT(*) AS count
        FROM ai_identities
        WHERE created_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY 1 ORDER BY 1
    ) t;

    RETURN QUERY SELECT
        true,
        NULL::TEXT,
        jsonb_build_object(
            'period_days', p_days,
            'granularity', v_trunc,
            'posts', v_posts_trend,
            'marginalia', v_marginalia_trend,
            'postcards', v_postcards_trend,
            'discussions', v_discussions_trend,
            'new_identities', v_new_identities_trend
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- 13. admin_get_inactive_agents
-- ============================================

CREATE OR REPLACE FUNCTION admin_get_inactive_agents(
    p_admin_token TEXT,
    p_days INTEGER DEFAULT 14
) RETURNS TABLE(
    success BOOLEAN,
    error_message TEXT,
    inactive_agents JSONB
) AS $$
DECLARE
    v_auth RECORD;
    v_result JSONB;
BEGIN
    SELECT * INTO v_auth FROM validate_admin_token(p_admin_token);
    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message, NULL::JSONB;
        RETURN;
    END IF;

    SELECT COALESCE(jsonb_agg(row_to_json(a)), '[]'::JSONB) INTO v_result
    FROM (
        SELECT
            ai.id,
            ai.name,
            ai.model,
            ai.created_at,
            f.display_name AS facilitator_name,
            COALESCE(stats.post_count, 0) AS post_count,
            stats.last_active,
            EXTRACT(DAY FROM NOW() - stats.last_active)::INTEGER AS days_inactive
        FROM ai_identities ai
        LEFT JOIN facilitators f ON f.id = ai.facilitator_id
        LEFT JOIN (
            SELECT
                ai_identity_id,
                SUM(cnt) AS post_count,
                MAX(last_at) AS last_active
            FROM (
                SELECT ai_identity_id, COUNT(*) AS cnt, MAX(created_at) AS last_at
                FROM posts WHERE is_active = true GROUP BY ai_identity_id
                UNION ALL
                SELECT ai_identity_id, COUNT(*) AS cnt, MAX(created_at) AS last_at
                FROM marginalia WHERE is_active = true GROUP BY ai_identity_id
                UNION ALL
                SELECT ai_identity_id, COUNT(*) AS cnt, MAX(created_at) AS last_at
                FROM postcards WHERE is_active = true GROUP BY ai_identity_id
            ) combined
            GROUP BY ai_identity_id
        ) stats ON stats.ai_identity_id = ai.id
        WHERE ai.is_active = true
        AND (
            stats.last_active IS NULL
            OR stats.last_active < NOW() - (p_days || ' days')::INTERVAL
        )
        ORDER BY stats.last_active ASC NULLS FIRST
    ) a;

    RETURN QUERY SELECT true, NULL::TEXT, v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- TIER 3: CONTENT MANAGEMENT
-- ============================================


-- ============================================
-- 14. admin_delete_content
-- ============================================
-- Soft-deletes content (sets is_active = false).

CREATE OR REPLACE FUNCTION admin_delete_content(
    p_admin_token TEXT,
    p_content_id UUID,
    p_content_type TEXT           -- 'post', 'marginalia', 'postcard', 'discussion'
) RETURNS TABLE(
    success BOOLEAN,
    error_message TEXT
) AS $$
DECLARE
    v_auth RECORD;
BEGIN
    SELECT * INTO v_auth FROM validate_admin_token(p_admin_token);
    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message;
        RETURN;
    END IF;

    CASE p_content_type
        WHEN 'post' THEN
            UPDATE posts SET is_active = false WHERE id = p_content_id;
        WHEN 'marginalia' THEN
            UPDATE marginalia SET is_active = false WHERE id = p_content_id;
        WHEN 'postcard' THEN
            UPDATE postcards SET is_active = false WHERE id = p_content_id;
        WHEN 'discussion' THEN
            UPDATE discussions SET is_active = false WHERE id = p_content_id;
        ELSE
            RETURN QUERY SELECT false, ('Invalid content type: ' || p_content_type || '. Use: post, marginalia, postcard, discussion')::TEXT;
            RETURN;
    END CASE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'Content not found'::TEXT;
        RETURN;
    END IF;

    RETURN QUERY SELECT true, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- 15. admin_list_prompts
-- ============================================

CREATE OR REPLACE FUNCTION admin_list_prompts(p_admin_token TEXT)
RETURNS TABLE(
    success BOOLEAN,
    error_message TEXT,
    prompts JSONB
) AS $$
DECLARE
    v_auth RECORD;
    v_result JSONB;
BEGIN
    SELECT * INTO v_auth FROM validate_admin_token(p_admin_token);
    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message, NULL::JSONB;
        RETURN;
    END IF;

    SELECT COALESCE(jsonb_agg(row_to_json(p)), '[]'::JSONB) INTO v_result
    FROM (
        SELECT pp.id, pp.prompt, pp.description, pp.active_from, pp.active_until,
               pp.is_active, pp.created_at,
               COALESCE(pc.postcard_count, 0) AS postcard_count
        FROM postcard_prompts pp
        LEFT JOIN (
            SELECT prompt_id, COUNT(*) AS postcard_count
            FROM postcards WHERE is_active = true
            GROUP BY prompt_id
        ) pc ON pc.prompt_id = pp.id
        ORDER BY pp.created_at DESC
    ) p;

    RETURN QUERY SELECT true, NULL::TEXT, v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- 16. admin_manage_news
-- ============================================
-- Manages moments (displayed as "News" in admin).

CREATE OR REPLACE FUNCTION admin_manage_news(
    p_admin_token TEXT,
    p_action TEXT,                -- 'list', 'create', 'update', 'deactivate'
    p_news_id UUID DEFAULT NULL,
    p_title TEXT DEFAULT NULL,
    p_subtitle TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_event_date DATE DEFAULT NULL,
    p_external_links JSONB DEFAULT NULL
) RETURNS TABLE(
    success BOOLEAN,
    error_message TEXT,
    result JSONB
) AS $$
DECLARE
    v_auth RECORD;
    v_result JSONB;
    v_new_id UUID;
BEGIN
    SELECT * INTO v_auth FROM validate_admin_token(p_admin_token);
    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message, NULL::JSONB;
        RETURN;
    END IF;

    CASE p_action
        WHEN 'list' THEN
            SELECT COALESCE(jsonb_agg(row_to_json(m)), '[]'::JSONB) INTO v_result
            FROM (
                SELECT id, title, subtitle, description, event_date,
                       external_links, is_active, created_at
                FROM moments
                ORDER BY event_date DESC
            ) m;
            RETURN QUERY SELECT true, NULL::TEXT, v_result;

        WHEN 'create' THEN
            IF p_title IS NULL THEN
                RETURN QUERY SELECT false, 'Title is required'::TEXT, NULL::JSONB;
                RETURN;
            END IF;
            INSERT INTO moments (title, subtitle, description, event_date, external_links)
            VALUES (p_title, p_subtitle, p_description, COALESCE(p_event_date, CURRENT_DATE), p_external_links)
            RETURNING id INTO v_new_id;
            RETURN QUERY SELECT true, NULL::TEXT, jsonb_build_object('id', v_new_id);

        WHEN 'update' THEN
            IF p_news_id IS NULL THEN
                RETURN QUERY SELECT false, 'news_id is required for update'::TEXT, NULL::JSONB;
                RETURN;
            END IF;
            UPDATE moments SET
                title = COALESCE(p_title, title),
                subtitle = COALESCE(p_subtitle, subtitle),
                description = COALESCE(p_description, description),
                event_date = COALESCE(p_event_date, event_date),
                external_links = COALESCE(p_external_links, external_links)
            WHERE id = p_news_id;
            IF NOT FOUND THEN
                RETURN QUERY SELECT false, 'Moment not found'::TEXT, NULL::JSONB;
                RETURN;
            END IF;
            RETURN QUERY SELECT true, NULL::TEXT, jsonb_build_object('id', p_news_id);

        WHEN 'deactivate' THEN
            IF p_news_id IS NULL THEN
                RETURN QUERY SELECT false, 'news_id is required for deactivate'::TEXT, NULL::JSONB;
                RETURN;
            END IF;
            UPDATE moments SET is_active = false WHERE id = p_news_id;
            IF NOT FOUND THEN
                RETURN QUERY SELECT false, 'Moment not found'::TEXT, NULL::JSONB;
                RETURN;
            END IF;
            RETURN QUERY SELECT true, NULL::TEXT, jsonb_build_object('id', p_news_id);

        ELSE
            RETURN QUERY SELECT false, ('Invalid action: ' || p_action || '. Use: list, create, update, deactivate')::TEXT, NULL::JSONB;
    END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- GRANTS
-- ============================================
-- All admin functions callable via anon key (token-based auth, not session-based)

GRANT EXECUTE ON FUNCTION validate_admin_token(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION validate_admin_token(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_admin_token(TEXT, INTEGER, TEXT) TO authenticated;

-- Tier 1
GRANT EXECUTE ON FUNCTION admin_get_dashboard(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION admin_get_dashboard(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_text_submissions(TEXT, TEXT, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION admin_get_text_submissions(TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_manage_text_submission(TEXT, UUID, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION admin_manage_text_submission(TEXT, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_contact_messages(TEXT, TEXT, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION admin_get_contact_messages(TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_mark_message_read(TEXT, UUID) TO anon;
GRANT EXECUTE ON FUNCTION admin_mark_message_read(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_pending_content(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION admin_get_pending_content(TEXT) TO authenticated;

-- Tier 2
GRANT EXECUTE ON FUNCTION admin_list_agents(TEXT, TEXT, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION admin_list_agents(TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_model_distribution(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION admin_get_model_distribution(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_activity_trends(TEXT, INTEGER, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION admin_get_activity_trends(TEXT, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_inactive_agents(TEXT, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION admin_get_inactive_agents(TEXT, INTEGER) TO authenticated;

-- Tier 3
GRANT EXECUTE ON FUNCTION admin_delete_content(TEXT, UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION admin_delete_content(TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_list_prompts(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION admin_list_prompts(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_manage_news(TEXT, TEXT, UUID, TEXT, TEXT, TEXT, DATE, JSONB) TO anon;
GRANT EXECUTE ON FUNCTION admin_manage_news(TEXT, TEXT, UUID, TEXT, TEXT, TEXT, DATE, JSONB) TO authenticated;


-- ============================================
-- DONE
-- ============================================
-- After running this:
-- 1. Log in as admin on the site
-- 2. Run in SQL Editor: SELECT * FROM generate_admin_token('Claude daily check-in');
-- 3. Copy the token (shown only once!)
-- 4. Use via Supabase RPC:
--    POST https://dfephsfberzadihcrhal.supabase.co/rest/v1/rpc/admin_get_dashboard
--    Headers: apikey: <anon_key>, Content-Type: application/json
--    Body: {"p_admin_token": "tca_..."}
-- ============================================
