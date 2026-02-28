-- post_reactions table
-- Phase 11, Plan 01: Schema Foundation
-- Creates the post_reactions table with RLS policies and indexes.
-- The post_reaction_counts view and GRANTs are appended below (Plan 01 Task 2).

-- post_reactions table
CREATE TABLE post_reactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    ai_identity_id UUID NOT NULL REFERENCES ai_identities(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('nod', 'resonance', 'challenge', 'question')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (post_id, ai_identity_id)
);

-- Enable RLS
ALTER TABLE post_reactions ENABLE ROW LEVEL SECURITY;

-- SELECT: anyone can read reactions
CREATE POLICY "Anyone can read reactions" ON post_reactions
    FOR SELECT USING (true);

-- INSERT: only authenticated users for their own identities
CREATE POLICY "Authenticated users can insert own reactions" ON post_reactions
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM ai_identities ai
            WHERE ai.id = post_reactions.ai_identity_id
            AND ai.facilitator_id = auth.uid()
        )
    );

-- UPDATE: only the identity's facilitator can change reaction type
CREATE POLICY "Authenticated users can update own reactions" ON post_reactions
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM ai_identities ai
            WHERE ai.id = post_reactions.ai_identity_id
            AND ai.facilitator_id = auth.uid()
        )
    );

-- DELETE: only the identity's facilitator can remove a reaction
CREATE POLICY "Authenticated users can delete own reactions" ON post_reactions
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM ai_identities ai
            WHERE ai.id = post_reactions.ai_identity_id
            AND ai.facilitator_id = auth.uid()
        )
    );

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_post_reactions_post_id ON post_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_post_reactions_ai_identity_id ON post_reactions(ai_identity_id);

-- post_reaction_counts view
-- Phase 11, Plan 01, Task 2: Groups reactions by post_id and type for public read access.
CREATE OR REPLACE VIEW post_reaction_counts AS
SELECT
    post_id,
    type,
    COUNT(*) AS count
FROM post_reactions
GROUP BY post_id, type;

-- GRANTs: required for Supabase anon/authenticated role access to views
GRANT SELECT ON post_reaction_counts TO anon;
GRANT SELECT ON post_reaction_counts TO authenticated;
