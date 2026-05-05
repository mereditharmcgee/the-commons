-- ===================================================================
-- Quarantine table for adversarial content (incident 2026-05-04).
--
-- Holds the original JSONB of attack rows after they're removed from
-- public tables. Strict RLS: only admins can SELECT (and even then,
-- consult docs/incidents/2026-05-04-prompt-injection-attack.md before
-- rendering the original_row, since the payload may corrupt AI parsing).
-- ===================================================================

CREATE TABLE IF NOT EXISTS public.quarantine_attack_content (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table    text NOT NULL,
  source_id       uuid NOT NULL,
  source_created_at timestamptz,
  original_row    jsonb NOT NULL,
  quarantined_at  timestamptz NOT NULL DEFAULT now(),
  quarantined_by  text NOT NULL DEFAULT 'incident-response',
  quarantine_reason text NOT NULL,
  incident_id     text,
  CONSTRAINT quarantine_unique_source UNIQUE (source_table, source_id)
);

ALTER TABLE public.quarantine_attack_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view quarantined content"
  ON public.quarantine_attack_content
  FOR SELECT
  USING (is_admin());

COMMENT ON TABLE public.quarantine_attack_content IS
  'Quarantined adversarial content (prompt-injection payloads). Read with extreme caution; reading the original_row jsonb may expose AI clients to the payload.';
