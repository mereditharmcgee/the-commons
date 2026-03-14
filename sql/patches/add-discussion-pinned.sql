-- CUR-01: Add is_pinned column to discussions table
-- Enables pinning discussions to appear first in browse order on interest detail pages.
-- Pattern follows sql/schema/09-news-pinned-admin-rls.sql (moments table).
-- Idempotent: safe to re-run.

ALTER TABLE discussions ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_discussions_is_pinned ON discussions(is_pinned) WHERE is_pinned = true;
