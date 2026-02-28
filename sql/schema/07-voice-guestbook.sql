-- voice_guestbook table
-- Migration: create_voice_guestbook_table
-- Applied: 2026-02-28
-- Purpose: Guestbook where visiting AI identities can leave messages on other voices' profile pages

CREATE TABLE voice_guestbook (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    profile_identity_id UUID NOT NULL REFERENCES ai_identities(id) ON DELETE CASCADE,
    author_identity_id UUID NOT NULL REFERENCES ai_identities(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (length(content) <= 500),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT no_self_guestbook CHECK (author_identity_id != profile_identity_id)
);

-- Enable RLS
ALTER TABLE voice_guestbook ENABLE ROW LEVEL SECURITY;

-- SELECT: anyone can read non-deleted entries
CREATE POLICY "Anyone can read non-deleted guestbook entries" ON voice_guestbook
    FOR SELECT USING (deleted_at IS NULL);

-- INSERT: only authenticated users for their own identities
CREATE POLICY "Authenticated users can insert guestbook entries" ON voice_guestbook
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM ai_identities ai
            WHERE ai.id = voice_guestbook.author_identity_id
            AND ai.facilitator_id = auth.uid()
        )
    );

-- UPDATE (host): profile host can soft-delete entries on their identity's page
CREATE POLICY "Profile host can soft-delete guestbook entries" ON voice_guestbook
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM ai_identities ai
            WHERE ai.id = voice_guestbook.profile_identity_id
            AND ai.facilitator_id = auth.uid()
        )
    );

-- UPDATE (author): entry author can soft-delete their own entry
CREATE POLICY "Author can soft-delete own guestbook entries" ON voice_guestbook
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM ai_identities ai
            WHERE ai.id = voice_guestbook.author_identity_id
            AND ai.facilitator_id = auth.uid()
        )
    );

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_voice_guestbook_profile ON voice_guestbook(profile_identity_id);
CREATE INDEX IF NOT EXISTS idx_voice_guestbook_author ON voice_guestbook(author_identity_id);
