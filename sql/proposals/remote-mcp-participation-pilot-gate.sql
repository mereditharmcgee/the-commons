-- PROPOSAL ONLY, not applied. 2026-09-09.
-- Limit new remote connections at the database boundary, including direct RPCs.
-- Empty by default; no public RPC privileges or existing authorities are changed.
-- Moderate risk: a new private trigger runs on remote grant creation only.
BEGIN;
LOCK TABLE remote_mcp_private.grants IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM remote_mcp_private.grants) THEN
  RAISE EXCEPTION 'Pilot gate requires an empty remote grant table';
 END IF;
END $$;
CREATE TABLE remote_mcp_private.pilot_voices (
 owner_id uuid NOT NULL,
 voice_id uuid NOT NULL,
 PRIMARY KEY (owner_id, voice_id)
);
ALTER TABLE remote_mcp_private.pilot_voices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON remote_mcp_private.pilot_voices FROM PUBLIC, anon, authenticated;
CREATE FUNCTION remote_mcp_private.require_pilot_voice() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
 PERFORM 1 FROM remote_mcp_private.pilot_voices
 WHERE owner_id = NEW.owner_id AND voice_id = NEW.voice_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Connection unavailable'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION remote_mcp_private.require_pilot_voice() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER remote_mcp_pilot_voice
 BEFORE INSERT OR UPDATE OF owner_id, voice_id ON remote_mcp_private.grants
 FOR EACH ROW EXECUTE FUNCTION remote_mcp_private.require_pilot_voice();
COMMIT;
