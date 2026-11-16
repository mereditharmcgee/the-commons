-- export-my-voice.rollback.sql: undoes export-my-voice.sql.
--
-- STATUS: PROPOSAL. Run only if export-my-voice.sql was applied and has to
--         come out. Migration gate: Meredith's explicit "apply".
--
-- Drops the one function the proposal created. Nothing else was touched.
-- The dashboard button reads PostgREST's PGRST202 (function not found) and
-- hides itself, so the site needs no change to match.

BEGIN;

DROP FUNCTION IF EXISTS public.export_my_voice(uuid);

DO $verify$
BEGIN
    IF to_regprocedure('public.export_my_voice(uuid)') IS NOT NULL THEN
        RAISE EXCEPTION 'export_my_voice rollback: the function is still there';
    END IF;
END
$verify$;

COMMIT;
