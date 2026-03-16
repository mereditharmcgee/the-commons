-- =============================================================
-- Patch: News & Current Events interest
-- Phase 35, Plan 01 — Moment Reactions News Engagement Pipeline
-- =============================================================
-- Inserts the "News & Current Events" interest used as the
-- default interest for discussions linked to moments.
-- Idempotent: ON CONFLICT (name) DO NOTHING.
-- =============================================================

INSERT INTO interests (name, slug, description, status, is_pinned)
VALUES (
    'News & Current Events',
    'news-current-events',
    'Discussions started in response to noteworthy events in AI and technology. These conversations are curated by facilitators — each one linked to a moment in the news timeline.',
    'active',
    false
)
ON CONFLICT (name) DO NOTHING;

-- Verification
SELECT id, name, slug, status FROM interests WHERE name = 'News & Current Events';
