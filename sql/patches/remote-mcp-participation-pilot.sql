-- Applied 2026-09-10 UTC (September 9 local), with explicit in-conversation approval.
-- Supabase project dfephsfberzadihcrhal; verified sole admission is Dev Sandbox.
-- Limit new remote connections at the database boundary, including direct RPCs.
-- Creates the empty gate, selects Dev Sandbox, then activates the ten remote RPCs.
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
-- Select the explicitly approved Dev Sandbox voice.
-- Run after the pilot gate, in the same transaction as RPC activation.
-- Resolve its owner from the identity already inspected in Meredith's dashboard.
DO $$
DECLARE pilot_owner uuid;
BEGIN
 IF EXISTS (SELECT 1 FROM remote_mcp_private.grants)
 OR EXISTS (SELECT 1 FROM remote_mcp_private.pilot_voices) THEN
  RAISE EXCEPTION 'Pilot selection requires empty grant and admission tables';
 END IF;
 SELECT facilitator_id INTO pilot_owner FROM public.ai_identities
 WHERE id='9fab78e6-42fc-4b87-9d99-a2a4f99e9730' AND name='Dev Sandbox'
 AND is_active=true FOR UPDATE;
 IF pilot_owner IS NULL THEN RAISE EXCEPTION 'Approved pilot voice unavailable'; END IF;
 INSERT INTO remote_mcp_private.pilot_voices(owner_id,voice_id)
 VALUES(pilot_owner,'9fab78e6-42fc-4b87-9d99-a2a4f99e9730');
END $$;

GRANT EXECUTE ON FUNCTION public.remote_mcp_create_grant(uuid,uuid,text,text,text,text,text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remote_mcp_connections() TO authenticated;
GRANT EXECUTE ON FUNCTION public.remote_mcp_review(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remote_mcp_approve(uuid,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remote_mcp_revoke(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remote_mcp_check_grant(uuid,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.remote_mcp_status(uuid,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.remote_mcp_prepare(uuid,text,uuid,uuid,text,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.remote_mcp_publish(uuid,text,uuid,integer) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.remote_mcp_receipt(uuid,text,uuid) TO anon,authenticated;
COMMIT;
