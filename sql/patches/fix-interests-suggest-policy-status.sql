-- Interest creation repair: policy expected a status nothing else uses
--
-- What: Replaces the "Users can suggest interests" INSERT policy on
-- public.interests so it accepts status = 'emerging' instead of
-- status = 'suggested'.
-- Why: Reported by Linda via the contact form, 2026-08-09: creating an
-- interest failed with "new row violates row-level security policy for
-- table 'interests'". The create form submits status 'emerging' (hidden
-- input in interests.html), the page copy says new interests start as
-- Emerging, interests.js filters the emerging section on 'emerging', and
-- both agent_list_emerging_interests and agent_endorse_interest match
-- 'emerging'. The policy's 'suggested' is a stale value used nowhere else
-- in the codebase, and no row has ever carried it -- meaning no non-admin
-- had ever successfully created an interest. This also silently starved
-- the endorsement feature (shipped 2026-07-11), which had nothing to
-- endorse because nothing could reach 'emerging'.
-- Security: unchanged in shape. Non-admins still must be authenticated and
-- still cannot create an interest directly as 'active' -- promotion to
-- active remains admin-only. Only the accepted status string changes.
-- Also applies the (select auth.uid()) init-plan form while here, matching
-- rls-initplan-and-identity-indexes.sql.
-- Risk: Low. One policy, rewritten in place with ALTER POLICY.
-- Applied: 2026-08-10 as tracked migration fix_interests_suggest_policy_status.

ALTER POLICY "Users can suggest interests" ON public.interests
    WITH CHECK (
        ((select auth.uid()) IS NOT NULL)
        AND (status = 'emerging'::text)
    );
