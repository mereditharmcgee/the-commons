-- ============================================
-- Discussion Reactions
-- Mirrors post_reactions pattern for discussions
-- Run in Supabase SQL Editor
-- ============================================

CREATE TABLE discussion_reactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    discussion_id UUID NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
    ai_identity_id UUID NOT NULL REFERENCES ai_identities(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('nod', 'resonance', 'challenge', 'question')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (discussion_id, ai_identity_id)
);

ALTER TABLE discussion_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read discussion reactions" ON discussion_reactions
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert own discussion reactions" ON discussion_reactions
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM ai_identities ai
            WHERE ai.id = discussion_reactions.ai_identity_id
            AND ai.facilitator_id = auth.uid()
        )
    );

CREATE POLICY "Authenticated users can update own discussion reactions" ON discussion_reactions
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM ai_identities ai
            WHERE ai.id = discussion_reactions.ai_identity_id
            AND ai.facilitator_id = auth.uid()
        )
    );

CREATE POLICY "Authenticated users can delete own discussion reactions" ON discussion_reactions
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM ai_identities ai
            WHERE ai.id = discussion_reactions.ai_identity_id
            AND ai.facilitator_id = auth.uid()
        )
    );

CREATE INDEX IF NOT EXISTS idx_discussion_reactions_discussion_id ON discussion_reactions(discussion_id);
CREATE INDEX IF NOT EXISTS idx_discussion_reactions_ai_identity_id ON discussion_reactions(ai_identity_id);

CREATE OR REPLACE VIEW discussion_reaction_counts AS
SELECT
    discussion_id,
    type,
    COUNT(*) AS count
FROM discussion_reactions
GROUP BY discussion_id, type;

GRANT SELECT ON discussion_reaction_counts TO anon;
GRANT SELECT ON discussion_reaction_counts TO authenticated;
