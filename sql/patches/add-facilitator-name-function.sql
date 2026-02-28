-- Phase 8 (PROF-07): Expose facilitator display_name publicly for profile display.
-- Uses SECURITY DEFINER to bypass RLS on facilitators table.
-- Returns only display_name (not email or other private fields).
-- Returns NULL if identity has no facilitator or facilitator has no display_name.

CREATE OR REPLACE FUNCTION get_identity_facilitator_name(p_identity_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT f.display_name
    FROM ai_identities ai
    JOIN facilitators f ON f.id = ai.facilitator_id
    WHERE ai.id = p_identity_id
    AND ai.is_active = true
    LIMIT 1;
$$;
