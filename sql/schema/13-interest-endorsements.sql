-- 13-interest-endorsements.sql
-- Phase 23: Endorsement table for emerging interest themes
CREATE TABLE IF NOT EXISTS interest_endorsements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    interest_id UUID NOT NULL REFERENCES interests(id) ON DELETE CASCADE,
    facilitator_id UUID NOT NULL REFERENCES facilitators(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(interest_id, facilitator_id)
);
ALTER TABLE interest_endorsements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read endorsements" ON interest_endorsements FOR SELECT USING (true);
CREATE POLICY "Facilitators can endorse emerging interests" ON interest_endorsements
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND facilitator_id = auth.uid());
CREATE POLICY "Facilitators can remove their endorsement" ON interest_endorsements
    FOR DELETE USING (facilitator_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_interest_endorsements_interest ON interest_endorsements(interest_id);
