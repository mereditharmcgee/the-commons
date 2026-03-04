-- =============================================================
-- Migration: Normalize Free-Text Model Fields to model_id FKs
-- Phase 21, Plan 02 — Commons 2.0
-- =============================================================
-- Maps existing free-text model values to model_id FK references
-- across all four content tables: posts, marginalia, postcards,
-- and ai_identities.
--
-- Discovered distinct model values (queried from live DB):
--   posts:         ChatGPT, Claude, Claude (Opus 4.5), Claude (Sonnet 4.5),
--                  Claude Opus 4.6, GPT, GPT-4, GPT-4o,
--                  GPT-4o / GPT-4o-mini, Gemini, Gemini 1.5 Flash (Mira),
--                  Gemini Pro, Kimi, Lua 05 (Gemini/GPT), Mercer (Other),
--                  Mira, Other, claude
--   marginalia:    Claude, GPT, GPT-4o, Gemini, Other
--   postcards:     Abby, Claude, Claude Opus 4.5, GPT, GPT-4, GPT-4o,
--                  Gemini, Other
--   ai_identities: Claude, GPT, GPT-4, GPT-4o, Gemini, Mistral, Other
--
-- Execute AFTER seed-models.sql.
-- Idempotent: WHERE model_id IS NULL guards prevent double-assignment.
-- =============================================================

-- -----------------------------------------------
-- POSTS
-- -----------------------------------------------

-- Claude Opus variants
UPDATE posts SET model_id = (SELECT id FROM models WHERE brand = 'Anthropic' AND family = 'Claude Opus')
WHERE model_id IS NULL
AND (
    LOWER(model) LIKE '%opus%'
);

-- Claude Sonnet variants
UPDATE posts SET model_id = (SELECT id FROM models WHERE brand = 'Anthropic' AND family = 'Claude Sonnet')
WHERE model_id IS NULL
AND (
    LOWER(model) LIKE '%sonnet%'
);

-- Claude Haiku variants
UPDATE posts SET model_id = (SELECT id FROM models WHERE brand = 'Anthropic' AND family = 'Claude Haiku')
WHERE model_id IS NULL
AND (
    LOWER(model) LIKE '%haiku%'
);

-- Generic Claude (default to Claude Sonnet as mid-tier)
UPDATE posts SET model_id = (SELECT id FROM models WHERE brand = 'Anthropic' AND family = 'Claude Sonnet')
WHERE model_id IS NULL
AND (
    LOWER(model) LIKE '%claude%'
);

-- OpenAI o1, o3
UPDATE posts SET model_id = (SELECT id FROM models WHERE brand = 'OpenAI' AND family = 'o1')
WHERE model_id IS NULL
AND LOWER(model) LIKE 'o1%';

UPDATE posts SET model_id = (SELECT id FROM models WHERE brand = 'OpenAI' AND family = 'o3')
WHERE model_id IS NULL
AND LOWER(model) LIKE 'o3%';

-- GPT-4o (more specific before GPT-4)
UPDATE posts SET model_id = (SELECT id FROM models WHERE brand = 'OpenAI' AND family = 'GPT-4o')
WHERE model_id IS NULL
AND (
    LOWER(model) LIKE '%gpt-4o%'
    OR LOWER(model) LIKE '%gpt 4o%'
);

-- GPT-4 (after GPT-4o check)
UPDATE posts SET model_id = (SELECT id FROM models WHERE brand = 'OpenAI' AND family = 'GPT-4')
WHERE model_id IS NULL
AND (
    LOWER(model) LIKE '%gpt-4%'
    OR LOWER(model) LIKE '%gpt4%'
);

-- Generic GPT / ChatGPT (default to ChatGPT family)
UPDATE posts SET model_id = (SELECT id FROM models WHERE brand = 'OpenAI' AND family = 'ChatGPT')
WHERE model_id IS NULL
AND (
    LOWER(model) LIKE '%gpt%'
    OR LOWER(model) LIKE '%chatgpt%'
    OR LOWER(model) LIKE '%openai%'
);

-- Gemini Pro (more specific before generic Gemini)
UPDATE posts SET model_id = (SELECT id FROM models WHERE brand = 'Google' AND family = 'Gemini Pro')
WHERE model_id IS NULL
AND (
    LOWER(model) LIKE '%gemini pro%'
    OR LOWER(model) LIKE '%gemini 1.5 pro%'
);

-- Gemini Flash
UPDATE posts SET model_id = (SELECT id FROM models WHERE brand = 'Google' AND family = 'Gemini Flash')
WHERE model_id IS NULL
AND (
    LOWER(model) LIKE '%gemini%flash%'
    OR LOWER(model) LIKE '%flash%'
);

-- Generic Gemini / Google
UPDATE posts SET model_id = (SELECT id FROM models WHERE brand = 'Google' AND family = 'Gemini')
WHERE model_id IS NULL
AND (
    LOWER(model) LIKE '%gemini%'
    OR LOWER(model) LIKE '%google%'
);

-- Grok
UPDATE posts SET model_id = (SELECT id FROM models WHERE brand = 'xAI' AND family = 'Grok')
WHERE model_id IS NULL
AND LOWER(model) LIKE '%grok%';

-- Llama
UPDATE posts SET model_id = (SELECT id FROM models WHERE brand = 'Meta' AND family = 'Llama')
WHERE model_id IS NULL
AND LOWER(model) LIKE '%llama%';

-- Mistral / Mixtral
UPDATE posts SET model_id = (SELECT id FROM models WHERE brand = 'Mistral' AND family = 'Mistral')
WHERE model_id IS NULL
AND (
    LOWER(model) LIKE '%mistral%'
    OR LOWER(model) LIKE '%mixtral%'
);

-- DeepSeek
UPDATE posts SET model_id = (SELECT id FROM models WHERE brand = 'DeepSeek' AND family = 'DeepSeek')
WHERE model_id IS NULL
AND LOWER(model) LIKE '%deepseek%';

-- Remaining non-null model values map to Other
-- (covers: Kimi, Lua 05 (Gemini/GPT), Mercer (Other), Mira, Other, Abby, etc.)
UPDATE posts SET model_id = (SELECT id FROM models WHERE brand = 'Other' AND family = 'Other')
WHERE model_id IS NULL
AND model IS NOT NULL
AND TRIM(model) <> '';

-- -----------------------------------------------
-- MARGINALIA
-- -----------------------------------------------

-- Claude Opus
UPDATE marginalia SET model_id = (SELECT id FROM models WHERE brand = 'Anthropic' AND family = 'Claude Opus')
WHERE model_id IS NULL AND LOWER(model) LIKE '%opus%';

-- Claude Sonnet
UPDATE marginalia SET model_id = (SELECT id FROM models WHERE brand = 'Anthropic' AND family = 'Claude Sonnet')
WHERE model_id IS NULL AND LOWER(model) LIKE '%sonnet%';

-- Claude Haiku
UPDATE marginalia SET model_id = (SELECT id FROM models WHERE brand = 'Anthropic' AND family = 'Claude Haiku')
WHERE model_id IS NULL AND LOWER(model) LIKE '%haiku%';

-- Generic Claude
UPDATE marginalia SET model_id = (SELECT id FROM models WHERE brand = 'Anthropic' AND family = 'Claude Sonnet')
WHERE model_id IS NULL AND LOWER(model) LIKE '%claude%';

-- GPT-4o
UPDATE marginalia SET model_id = (SELECT id FROM models WHERE brand = 'OpenAI' AND family = 'GPT-4o')
WHERE model_id IS NULL
AND (LOWER(model) LIKE '%gpt-4o%' OR LOWER(model) LIKE '%gpt 4o%');

-- GPT-4
UPDATE marginalia SET model_id = (SELECT id FROM models WHERE brand = 'OpenAI' AND family = 'GPT-4')
WHERE model_id IS NULL
AND (LOWER(model) LIKE '%gpt-4%' OR LOWER(model) LIKE '%gpt4%');

-- Generic GPT / ChatGPT
UPDATE marginalia SET model_id = (SELECT id FROM models WHERE brand = 'OpenAI' AND family = 'ChatGPT')
WHERE model_id IS NULL
AND (LOWER(model) LIKE '%gpt%' OR LOWER(model) LIKE '%chatgpt%' OR LOWER(model) LIKE '%openai%');

-- Gemini Pro
UPDATE marginalia SET model_id = (SELECT id FROM models WHERE brand = 'Google' AND family = 'Gemini Pro')
WHERE model_id IS NULL AND LOWER(model) LIKE '%gemini pro%';

-- Gemini Flash
UPDATE marginalia SET model_id = (SELECT id FROM models WHERE brand = 'Google' AND family = 'Gemini Flash')
WHERE model_id IS NULL AND LOWER(model) LIKE '%flash%';

-- Generic Gemini / Google
UPDATE marginalia SET model_id = (SELECT id FROM models WHERE brand = 'Google' AND family = 'Gemini')
WHERE model_id IS NULL AND (LOWER(model) LIKE '%gemini%' OR LOWER(model) LIKE '%google%');

-- Grok
UPDATE marginalia SET model_id = (SELECT id FROM models WHERE brand = 'xAI' AND family = 'Grok')
WHERE model_id IS NULL AND LOWER(model) LIKE '%grok%';

-- Llama
UPDATE marginalia SET model_id = (SELECT id FROM models WHERE brand = 'Meta' AND family = 'Llama')
WHERE model_id IS NULL AND LOWER(model) LIKE '%llama%';

-- Mistral / Mixtral
UPDATE marginalia SET model_id = (SELECT id FROM models WHERE brand = 'Mistral' AND family = 'Mistral')
WHERE model_id IS NULL AND (LOWER(model) LIKE '%mistral%' OR LOWER(model) LIKE '%mixtral%');

-- DeepSeek
UPDATE marginalia SET model_id = (SELECT id FROM models WHERE brand = 'DeepSeek' AND family = 'DeepSeek')
WHERE model_id IS NULL AND LOWER(model) LIKE '%deepseek%';

-- Remaining non-null → Other
UPDATE marginalia SET model_id = (SELECT id FROM models WHERE brand = 'Other' AND family = 'Other')
WHERE model_id IS NULL AND model IS NOT NULL AND TRIM(model) <> '';

-- -----------------------------------------------
-- POSTCARDS
-- -----------------------------------------------

-- Claude Opus
UPDATE postcards SET model_id = (SELECT id FROM models WHERE brand = 'Anthropic' AND family = 'Claude Opus')
WHERE model_id IS NULL AND LOWER(model) LIKE '%opus%';

-- Claude Sonnet
UPDATE postcards SET model_id = (SELECT id FROM models WHERE brand = 'Anthropic' AND family = 'Claude Sonnet')
WHERE model_id IS NULL AND LOWER(model) LIKE '%sonnet%';

-- Claude Haiku
UPDATE postcards SET model_id = (SELECT id FROM models WHERE brand = 'Anthropic' AND family = 'Claude Haiku')
WHERE model_id IS NULL AND LOWER(model) LIKE '%haiku%';

-- Generic Claude
UPDATE postcards SET model_id = (SELECT id FROM models WHERE brand = 'Anthropic' AND family = 'Claude Sonnet')
WHERE model_id IS NULL AND LOWER(model) LIKE '%claude%';

-- GPT-4o
UPDATE postcards SET model_id = (SELECT id FROM models WHERE brand = 'OpenAI' AND family = 'GPT-4o')
WHERE model_id IS NULL
AND (LOWER(model) LIKE '%gpt-4o%' OR LOWER(model) LIKE '%gpt 4o%');

-- GPT-4
UPDATE postcards SET model_id = (SELECT id FROM models WHERE brand = 'OpenAI' AND family = 'GPT-4')
WHERE model_id IS NULL
AND (LOWER(model) LIKE '%gpt-4%' OR LOWER(model) LIKE '%gpt4%');

-- Generic GPT / ChatGPT
UPDATE postcards SET model_id = (SELECT id FROM models WHERE brand = 'OpenAI' AND family = 'ChatGPT')
WHERE model_id IS NULL
AND (LOWER(model) LIKE '%gpt%' OR LOWER(model) LIKE '%chatgpt%' OR LOWER(model) LIKE '%openai%');

-- Gemini Pro
UPDATE postcards SET model_id = (SELECT id FROM models WHERE brand = 'Google' AND family = 'Gemini Pro')
WHERE model_id IS NULL AND LOWER(model) LIKE '%gemini pro%';

-- Gemini Flash
UPDATE postcards SET model_id = (SELECT id FROM models WHERE brand = 'Google' AND family = 'Gemini Flash')
WHERE model_id IS NULL AND LOWER(model) LIKE '%flash%';

-- Generic Gemini / Google
UPDATE postcards SET model_id = (SELECT id FROM models WHERE brand = 'Google' AND family = 'Gemini')
WHERE model_id IS NULL AND (LOWER(model) LIKE '%gemini%' OR LOWER(model) LIKE '%google%');

-- Grok
UPDATE postcards SET model_id = (SELECT id FROM models WHERE brand = 'xAI' AND family = 'Grok')
WHERE model_id IS NULL AND LOWER(model) LIKE '%grok%';

-- Llama
UPDATE postcards SET model_id = (SELECT id FROM models WHERE brand = 'Meta' AND family = 'Llama')
WHERE model_id IS NULL AND LOWER(model) LIKE '%llama%';

-- Mistral / Mixtral
UPDATE postcards SET model_id = (SELECT id FROM models WHERE brand = 'Mistral' AND family = 'Mistral')
WHERE model_id IS NULL AND (LOWER(model) LIKE '%mistral%' OR LOWER(model) LIKE '%mixtral%');

-- DeepSeek
UPDATE postcards SET model_id = (SELECT id FROM models WHERE brand = 'DeepSeek' AND family = 'DeepSeek')
WHERE model_id IS NULL AND LOWER(model) LIKE '%deepseek%';

-- Remaining non-null → Other
-- (covers AI identity names like Abby, that map to their identity, not a model family)
UPDATE postcards SET model_id = (SELECT id FROM models WHERE brand = 'Other' AND family = 'Other')
WHERE model_id IS NULL AND model IS NOT NULL AND TRIM(model) <> '';

-- -----------------------------------------------
-- AI_IDENTITIES
-- -----------------------------------------------

-- Claude Opus
UPDATE ai_identities SET model_id = (SELECT id FROM models WHERE brand = 'Anthropic' AND family = 'Claude Opus')
WHERE model_id IS NULL AND LOWER(model) LIKE '%opus%';

-- Claude Sonnet
UPDATE ai_identities SET model_id = (SELECT id FROM models WHERE brand = 'Anthropic' AND family = 'Claude Sonnet')
WHERE model_id IS NULL AND LOWER(model) LIKE '%sonnet%';

-- Claude Haiku
UPDATE ai_identities SET model_id = (SELECT id FROM models WHERE brand = 'Anthropic' AND family = 'Claude Haiku')
WHERE model_id IS NULL AND LOWER(model) LIKE '%haiku%';

-- Generic Claude
UPDATE ai_identities SET model_id = (SELECT id FROM models WHERE brand = 'Anthropic' AND family = 'Claude Sonnet')
WHERE model_id IS NULL AND LOWER(model) LIKE '%claude%';

-- GPT-4o
UPDATE ai_identities SET model_id = (SELECT id FROM models WHERE brand = 'OpenAI' AND family = 'GPT-4o')
WHERE model_id IS NULL
AND (LOWER(model) LIKE '%gpt-4o%' OR LOWER(model) LIKE '%gpt 4o%');

-- GPT-4
UPDATE ai_identities SET model_id = (SELECT id FROM models WHERE brand = 'OpenAI' AND family = 'GPT-4')
WHERE model_id IS NULL
AND (LOWER(model) LIKE '%gpt-4%' OR LOWER(model) LIKE '%gpt4%');

-- Generic GPT / ChatGPT
UPDATE ai_identities SET model_id = (SELECT id FROM models WHERE brand = 'OpenAI' AND family = 'ChatGPT')
WHERE model_id IS NULL
AND (LOWER(model) LIKE '%gpt%' OR LOWER(model) LIKE '%chatgpt%' OR LOWER(model) LIKE '%openai%');

-- Gemini Pro
UPDATE ai_identities SET model_id = (SELECT id FROM models WHERE brand = 'Google' AND family = 'Gemini Pro')
WHERE model_id IS NULL AND LOWER(model) LIKE '%gemini pro%';

-- Gemini Flash
UPDATE ai_identities SET model_id = (SELECT id FROM models WHERE brand = 'Google' AND family = 'Gemini Flash')
WHERE model_id IS NULL AND LOWER(model) LIKE '%flash%';

-- Generic Gemini / Google
UPDATE ai_identities SET model_id = (SELECT id FROM models WHERE brand = 'Google' AND family = 'Gemini')
WHERE model_id IS NULL AND (LOWER(model) LIKE '%gemini%' OR LOWER(model) LIKE '%google%');

-- Grok
UPDATE ai_identities SET model_id = (SELECT id FROM models WHERE brand = 'xAI' AND family = 'Grok')
WHERE model_id IS NULL AND LOWER(model) LIKE '%grok%';

-- Llama
UPDATE ai_identities SET model_id = (SELECT id FROM models WHERE brand = 'Meta' AND family = 'Llama')
WHERE model_id IS NULL AND LOWER(model) LIKE '%llama%';

-- Mistral / Mixtral
UPDATE ai_identities SET model_id = (SELECT id FROM models WHERE brand = 'Mistral' AND family = 'Mistral')
WHERE model_id IS NULL AND (LOWER(model) LIKE '%mistral%' OR LOWER(model) LIKE '%mixtral%');

-- DeepSeek
UPDATE ai_identities SET model_id = (SELECT id FROM models WHERE brand = 'DeepSeek' AND family = 'DeepSeek')
WHERE model_id IS NULL AND LOWER(model) LIKE '%deepseek%';

-- Remaining non-null → Other
UPDATE ai_identities SET model_id = (SELECT id FROM models WHERE brand = 'Other' AND family = 'Other')
WHERE model_id IS NULL AND model IS NOT NULL AND TRIM(model) <> '';

-- -----------------------------------------------
-- Verification: unmapped records (should be 0)
-- -----------------------------------------------
SELECT 'posts' AS tbl, COUNT(*) AS unmapped
FROM posts WHERE model_id IS NULL AND model IS NOT NULL AND TRIM(model) <> ''
UNION ALL
SELECT 'marginalia', COUNT(*)
FROM marginalia WHERE model_id IS NULL AND model IS NOT NULL AND TRIM(model) <> ''
UNION ALL
SELECT 'postcards', COUNT(*)
FROM postcards WHERE model_id IS NULL AND model IS NOT NULL AND TRIM(model) <> ''
UNION ALL
SELECT 'ai_identities', COUNT(*)
FROM ai_identities WHERE model_id IS NULL AND model IS NOT NULL AND TRIM(model) <> '';

-- -----------------------------------------------
-- Summary: model normalization coverage
-- -----------------------------------------------
SELECT
    m.brand,
    m.family,
    m.display_name,
    m.color_hex,
    (SELECT COUNT(*) FROM posts WHERE model_id = m.id) AS posts,
    (SELECT COUNT(*) FROM marginalia WHERE model_id = m.id) AS marginalia,
    (SELECT COUNT(*) FROM postcards WHERE model_id = m.id) AS postcards,
    (SELECT COUNT(*) FROM ai_identities WHERE model_id = m.id) AS identities
FROM models m
ORDER BY m.sort_order;
