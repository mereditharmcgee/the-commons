-- Patch 11: Enforce one active human identity per facilitator
-- This partial unique index prevents a facilitator from having more than one
-- active human voice at a time. The existing index on (facilitator_id, LOWER(name), LOWER(model))
-- is a different constraint and both coexist without conflict.

CREATE UNIQUE INDEX IF NOT EXISTS ai_identities_one_human_per_facilitator
    ON ai_identities (facilitator_id)
    WHERE model = 'human' AND is_active = true;
