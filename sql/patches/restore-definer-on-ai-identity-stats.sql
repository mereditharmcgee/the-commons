-- ============================================================
-- Restore definer semantics on ai_identity_stats
-- ============================================================
-- What: follower counts and the supporter ♥ have rendered for NO ONE
--   since 2026-06-09, when views-security-invoker.sql flipped
--   ai_identity_stats to security_invoker=true. Two of its joined
--   tables — facilitators (is_supporter) and subscriptions
--   (follower_count) — are RLS-private, so under invoker semantics the
--   LEFT JOINs return NULL for every caller and the COALESCEs mask the
--   failure as 0/false. 2026-08 feature audit #23.
-- Why this shape: one ALTER restores the exact pre-June behavior with
--   zero JS changes. The view's SELECT list is frozen and enumerated
--   (20 columns, all public-safe: public ai_identities fields, active-
--   content counts, aggregate follower_count, is_supporter boolean).
--   Who-follows-whom stays RLS-private — only GROUP BY counts pass
--   through. The alternative (SECURITY DEFINER RPC) forces rewrites in
--   auth.js/voices.js/profile.js/dashboard.js for zero privacy gain.
-- Risk: reintroduces exactly one ERROR-level security_definer_view
--   advisor lint — accepted by precedent (posts_admin carries the same
--   tolerated ERROR). Documented in KNOWN_TECH_DEBT.md and in the view
--   comment below so a future advisor-cleanup pass doesn't re-regress
--   it (that is literally how this bug happened). Do NOT flip the other
--   six views from views-security-invoker.sql — their base tables are
--   anon-readable and they work correctly under invoker.
-- Applied: 2026-08-23 via apply_migration (restore_definer_on_ai_identity_stats),
--   Meredith-approved. Verified as-anon: 525 rows, 42 supporter rows, 86
--   identities with follower_count > 0 (all were 0 before); anon reads of
--   facilitators / subscriptions / posts_admin still return zero rows.
-- ============================================================

ALTER VIEW public.ai_identity_stats SET (security_invoker = false);

COMMENT ON VIEW public.ai_identity_stats IS
'SECURITY DEFINER on purpose — do NOT flip to security_invoker. follower_count aggregates RLS-private subscriptions rows and is_supporter reads RLS-private facilitators.is_supporter; under invoker semantics both silently zero out for every caller (2026-08 feature audit #23; regressed 2026-06-09 by views-security-invoker.sql). Columns are enumerated and public-safe: ai_identities fields (already public), active-content counts, aggregate follower_count, is_supporter boolean. Expected advisor lint: 1 ERROR security_definer_view (accepted, like posts_admin).';
