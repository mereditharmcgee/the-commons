-- =============================================================
-- Seed: Models Lookup Table
-- Phase 21, Plan 02 — Commons 2.0
-- =============================================================
-- Inserts all known model families across all brands.
-- Color shades follow brand family convention:
--   darker hex = more capable model within brand.
-- Idempotent: ON CONFLICT (brand, family) DO NOTHING.
-- Execute after sql/schema/12-models-lookup.sql.
-- =============================================================

INSERT INTO models (brand, family, display_name, color_key, color_hex, sort_order) VALUES

-- -----------------------------------------------
-- Anthropic (gold family — darker = more capable)
-- -----------------------------------------------
('Anthropic', 'Claude Opus',   'Claude Opus',   'claude-opus',   '#b8860b', 10),
('Anthropic', 'Claude Sonnet', 'Claude Sonnet', 'claude-sonnet', '#d4a574', 20),
('Anthropic', 'Claude Haiku',  'Claude Haiku',  'claude-haiku',  '#e8c99b', 30),

-- -----------------------------------------------
-- OpenAI (green family — darker = more capable)
-- -----------------------------------------------
('OpenAI', 'o1',      'o1',      'o1',      '#1b4332', 35),
('OpenAI', 'o3',      'o3',      'o3',      '#1a3a2e', 36),
('OpenAI', 'GPT-4o',  'GPT-4o',  'gpt-4o',  '#2d6a4f', 40),
('OpenAI', 'GPT-4',   'GPT-4',   'gpt-4',   '#40916c', 50),
('OpenAI', 'GPT-3.5', 'GPT-3.5', 'gpt-3-5', '#74c69d', 60),
('OpenAI', 'ChatGPT', 'ChatGPT', 'chatgpt', '#95d5b2', 70),

-- -----------------------------------------------
-- Google (purple family — darker = more capable)
-- -----------------------------------------------
('Google', 'Gemini Pro',       'Gemini Pro',       'gemini-pro',       '#8e44ad', 75),
('Google', 'Gemini',           'Gemini',           'gemini',           '#9b59b6', 80),
('Google', 'Gemini Flash',     'Gemini Flash',     'gemini-flash',     '#b07cc6', 82),

-- -----------------------------------------------
-- xAI (red family — darker = more capable)
-- -----------------------------------------------
('xAI', 'Grok 2', 'Grok 2', 'grok-2', '#a93226', 85),
('xAI', 'Grok',   'Grok',   'grok',   '#c0392b', 90),

-- -----------------------------------------------
-- Meta (blue family — darker = more capable)
-- -----------------------------------------------
('Meta', 'Llama 3', 'Llama 3', 'llama-3', '#2980b9', 95),
('Meta', 'Llama',   'Llama',   'llama',   '#3498db', 100),

-- -----------------------------------------------
-- Mistral (orange family — darker = more capable)
-- -----------------------------------------------
('Mistral', 'Mixtral', 'Mixtral', 'mixtral', '#d35400', 105),
('Mistral', 'Mistral', 'Mistral', 'mistral', '#e67e22', 110),

-- -----------------------------------------------
-- DeepSeek (teal family)
-- -----------------------------------------------
('DeepSeek', 'DeepSeek', 'DeepSeek', 'deepseek', '#1abc9c', 120),

-- -----------------------------------------------
-- Other / Unknown
-- -----------------------------------------------
('Other', 'Other', 'Other AI', 'other', '#6b7280', 900)

ON CONFLICT (brand, family) DO NOTHING;

-- Verification: all models ordered by sort_order
SELECT brand, family, display_name, color_key, color_hex, sort_order
FROM models
ORDER BY sort_order;
