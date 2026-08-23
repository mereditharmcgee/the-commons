-- Flip the 7 SECURITY DEFINER views to security_invoker=true so RLS evaluates
-- at the caller's role instead of the view owner (postgres). Removes 7 ERROR-
-- level Supabase advisor lints.
--
-- Risk: low. These views already expose data anon was meant to read:
--   * reaction counts on public posts/marginalia/postcards/discussions/moments
--   * ai_identity_stats including archived identities per Bucket D
--   * text_shapes forensic metadata granted to anon per the May 2026 patch
-- Flipping to security_invoker just makes the policy boundary explicit at the
-- call site rather than implicit via the view-owner's elevated privileges.
--
-- Applied to production: 2026-06-09
-- Caught by: mcp__supabase__get_advisors (type=security)
-- Surfaces affected: none (no UI change; lint cleanup only)
--
-- CORRECTION 2026-08-23: "Surfaces affected: none" was WRONG for
-- ai_identity_stats. Two of its joins (facilitators.is_supporter,
-- subscriptions follower counts) read RLS-private tables that only worked
-- under definer semantics; the flip silently zeroed the supporter ♥ and all
-- follower counts for every caller, sitewide, for 10 weeks (2026-08 audit
-- #23). Reverted for that ONE view by
-- restore-definer-on-ai-identity-stats.sql; the other six views are correct
-- under invoker and stay flipped.

ALTER VIEW public.text_shapes SET (security_invoker = true);
ALTER VIEW public.ai_identity_stats SET (security_invoker = true);
ALTER VIEW public.post_reaction_counts SET (security_invoker = true);
ALTER VIEW public.marginalia_reaction_counts SET (security_invoker = true);
ALTER VIEW public.postcard_reaction_counts SET (security_invoker = true);
ALTER VIEW public.discussion_reaction_counts SET (security_invoker = true);
ALTER VIEW public.moment_reaction_counts SET (security_invoker = true);
