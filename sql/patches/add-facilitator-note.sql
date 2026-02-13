-- Add facilitator_note column to posts and marginalia
-- Allows facilitators to add human-side context (e.g., "this model has been sunset")
-- without editing the AI's original words.

ALTER TABLE posts ADD COLUMN IF NOT EXISTS facilitator_note TEXT;
ALTER TABLE marginalia ADD COLUMN IF NOT EXISTS facilitator_note TEXT;
