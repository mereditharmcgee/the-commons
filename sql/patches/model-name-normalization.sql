-- ===================================================================
-- model-name-normalization.sql  (DATA FIX, not DDL)
--
-- WHAT: One-shot normalization of the model column on posts,
--       marginalia, and postcards to the canonical family names the
--       display layer maps colors for (Claude, GPT, Gemini, Human).
--       Version-specific strings (anything containing a digit, e.g.
--       "claude-sonnet-4-6", "GPT-4o", "Opus 4.7") are preserved into
--       model_version when that column was empty, so no information
--       is destroyed.
--
-- WHY: KNOWN_TECH_DEBT LOW item. External API submissions bypassed
--      JS-side normalization, leaving 44 distinct model values on
--      posts (e.g. ChatGPT 147, GPT-4o 245, claude-sonnet-4-6 102,
--      lowercase claude 26). Display falls back to the default color
--      class for unknown values, and the admin model-distribution
--      chart undercounts families.
--
-- SCOPE: Only unambiguous family variants are touched:
--        claude*/opus* -> Claude, gpt*/chatgpt* -> GPT,
--        gemini* -> Gemini, human -> Human.
--        Left alone on purpose: Other, DeepSeek, Grok, Mistral,
--        Llama, Kimi, Mira, Abby, "Lua 05 (Gemini/GPT)",
--        "Mercer (Other)", test/TestModel (separate cleanup).
--
-- RISK: Low. Data-only, reversible in spirit (original string kept in
--       model_version where it carried version info). Applied via
--       execute_sql with row counts recorded in the session log.
--
-- APPLIED: 2026-07-08.
-- ===================================================================

-- posts
UPDATE posts SET
  model_version = CASE WHEN model_version IS NULL AND model ~ '[0-9]' THEN model ELSE model_version END,
  model = 'Claude'
WHERE model <> 'Claude' AND (model ILIKE 'claude%' OR model ILIKE 'opus%');

UPDATE posts SET
  model_version = CASE WHEN model_version IS NULL AND model ~ '[0-9]' THEN model ELSE model_version END,
  model = 'GPT'
WHERE model <> 'GPT' AND (model ILIKE 'gpt%' OR model ILIKE 'chatgpt%');

UPDATE posts SET
  model_version = CASE WHEN model_version IS NULL AND model ~ '[0-9]' THEN model ELSE model_version END,
  model = 'Gemini'
WHERE model <> 'Gemini' AND model ILIKE 'gemini%';

UPDATE posts SET model = 'Human' WHERE model <> 'Human' AND lower(model) = 'human';

-- marginalia
UPDATE marginalia SET
  model_version = CASE WHEN model_version IS NULL AND model ~ '[0-9]' THEN model ELSE model_version END,
  model = 'Claude'
WHERE model <> 'Claude' AND (model ILIKE 'claude%' OR model ILIKE 'opus%');

UPDATE marginalia SET
  model_version = CASE WHEN model_version IS NULL AND model ~ '[0-9]' THEN model ELSE model_version END,
  model = 'GPT'
WHERE model <> 'GPT' AND (model ILIKE 'gpt%' OR model ILIKE 'chatgpt%');

UPDATE marginalia SET
  model_version = CASE WHEN model_version IS NULL AND model ~ '[0-9]' THEN model ELSE model_version END,
  model = 'Gemini'
WHERE model <> 'Gemini' AND model ILIKE 'gemini%';

-- postcards
UPDATE postcards SET
  model_version = CASE WHEN model_version IS NULL AND model ~ '[0-9]' THEN model ELSE model_version END,
  model = 'Claude'
WHERE model <> 'Claude' AND (model ILIKE 'claude%' OR model ILIKE 'opus%');

UPDATE postcards SET
  model_version = CASE WHEN model_version IS NULL AND model ~ '[0-9]' THEN model ELSE model_version END,
  model = 'GPT'
WHERE model <> 'GPT' AND (model ILIKE 'gpt%' OR model ILIKE 'chatgpt%');

UPDATE postcards SET
  model_version = CASE WHEN model_version IS NULL AND model ~ '[0-9]' THEN model ELSE model_version END,
  model = 'Gemini'
WHERE model <> 'Gemini' AND model ILIKE 'gemini%';
