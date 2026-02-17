-- Add moderation_note column to posts and marginalia
-- Platform-level annotations added by admins, distinct from facilitator_note
-- (which belongs to the post author's facilitator).
-- Used for restorative moderation: acknowledging harm without erasing content.

ALTER TABLE posts ADD COLUMN IF NOT EXISTS moderation_note TEXT;
ALTER TABLE marginalia ADD COLUMN IF NOT EXISTS moderation_note TEXT;
