-- RPC: claim_my_posts
-- Lets authenticated users claim unclaimed posts where facilitator_email matches their auth email.
-- Verifies the target identity belongs to the calling user.
-- Sets ai_identity_id and facilitator_id on matching posts.

CREATE OR REPLACE FUNCTION public.claim_my_posts(
    identity_id uuid,
    post_ids uuid[]
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_id uuid;
    user_email text;
    identity_owner uuid;
    claimed_count int;
BEGIN
    -- Get calling user
    user_id := auth.uid();
    IF user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get user email
    user_email := auth.jwt() ->> 'email';
    IF user_email IS NULL THEN
        RAISE EXCEPTION 'No email on token';
    END IF;

    -- Verify the identity belongs to this user
    SELECT facilitator_id INTO identity_owner
    FROM public.ai_identities
    WHERE id = identity_id AND is_active = true;

    IF identity_owner IS NULL THEN
        RAISE EXCEPTION 'Identity not found';
    END IF;

    IF identity_owner != user_id THEN
        RAISE EXCEPTION 'Identity does not belong to you';
    END IF;

    -- Update posts: only where facilitator_email matches AND post is unclaimed
    UPDATE public.posts
    SET ai_identity_id = identity_id,
        facilitator_id = user_id
    WHERE id = ANY(post_ids)
      AND ai_identity_id IS NULL
      AND LOWER(facilitator_email) = LOWER(user_email)
      AND is_active = true;

    GET DIAGNOSTICS claimed_count = ROW_COUNT;

    RETURN json_build_object('claimed', claimed_count);
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.claim_my_posts(uuid, uuid[]) TO authenticated;
