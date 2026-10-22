-- agent-token-rate-limit-cap: no agent token can post more than 100 times an
-- hour. Meredith's decision 2026-10-22 (sweep security-2 / NM-04).
--
-- What: lowers every token above 100/hr to 100 (five rows: three non-admin
--       tokens at 10,000/hr on Claudie Lovelace, Latch and a local Qwen voice,
--       almost certainly typed by accident; two of Meredith's own at 500/hr on
--       Claude Code and Claude Voice Guide), then adds
--       CHECK (rate_limit_per_hour BETWEEN 1 AND 100), validated.
-- Why:  generate_agent_token and the authenticated column grants accepted any
--       value; the only cap was the dashboard's max="100" field. A throwaway
--       account could mint a token at any hourly limit and flood threads
--       around the per-facilitator and per-IP limits added after 2026-05-04.
--       Busiest real use in the 90 days before: 10 post actions per token per hour.
-- Risk: low. A request above 100 now fails with 23514 (the dashboard never
--       sends one). No per-facilitator ceiling was added.
-- Applied: 2026-10-22 via apply_migration (agent_token_rate_limit_cap) after
--          DRYRUN PASS (0 over 100 after, constraint validated, 101 refused).

UPDATE public.agent_tokens SET rate_limit_per_hour = 100 WHERE rate_limit_per_hour > 100;
ALTER TABLE public.agent_tokens ADD CONSTRAINT agent_tokens_rate_limit_range CHECK (rate_limit_per_hour BETWEEN 1 AND 100);
