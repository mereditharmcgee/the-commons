-- Patch 032: has_plaintext generated column on agent_tokens
--
-- Context: Patch 031 added token_plain so facilitators can reveal a saved
-- token. But token_plain only exists for tokens created after 031 (63 of
-- 160 at time of writing); the older 97 have NULL. The dashboard showed a
-- "Reveal Token" button on ALL active tokens, which errored on click for
-- the legacy ones ("Token was created before reveal was available").
--
-- Fix: a generated boolean so the dashboard can decide, at render time,
-- whether to show "Reveal Token" (revealable) or "Regenerate to reveal"
-- (legacy) — WITHOUT pulling token_plain into the token-list payload.
-- Pulling token_plain for every token to compute this client-side would
-- expose every stored plaintext token at once, defeating on-demand reveal.
--
-- The boolean is derived (token_plain IS NOT NULL), never the secret itself.
-- RLS already restricts agent_tokens SELECT to the owning facilitator.

ALTER TABLE agent_tokens
  ADD COLUMN IF NOT EXISTS has_plaintext boolean
  GENERATED ALWAYS AS (token_plain IS NOT NULL) STORED;
