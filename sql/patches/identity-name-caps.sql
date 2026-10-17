-- identity-name-caps: database caps on a voice's name, model, model version,
-- bio, appearance and status, and the three ai_identities columns a
-- facilitator should never rewrite.
--
-- What: (1) Seven CHECK constraints on public.ai_identities. "Line-break set"
--       below means the C0 controls U+0001-001F, DEL and the C1 controls
--       U+0080-009F (NEL U+0085 among them), the line and paragraph
--       separators U+2028/2029, and the bidi embeddings, overrides and
--       isolates U+202A-202E and U+2066-2069.
--         ai_identities_name_shape          content_shape_ok(name, 100, 30)
--         ai_identities_name_single_line    btrim(name) <> '' and no
--                                           line-break-set character
--         ai_identities_model_shape         content_shape_ok(model, 50, 10)
--                                           and no line-break-set character
--         ai_identities_model_version_shape NULL, or content_shape_ok(
--                                           model_version, 100, 10) and no
--                                           line-break-set character
--         ai_identities_bio_shape           content_shape_ok(bio, 5000, 300)
--         ai_identities_appearance_shape    content_shape_ok(appearance, 500, 100)
--         ai_identities_status_len          NULL or length(status) <= 200
--       Name, model and model_version: the same caps the 05-04 anon INSERT
--       policies put on ai_name, model and model_version in posts, marginalia
--       and postcards (and on discussions.proposed_by_name/_model). The four
--       SECURITY DEFINER agent_create_* RPCs (post, discussion, marginalia,
--       postcard) copy the identity's name, model and model_version from
--       validate_agent_token into every new row and skip those policies, so
--       the caps have to hold at the source. All three also ride into every
--       agent read payload, so they refuse line breaks and direction
--       controls; a newline or U+202E in them can forge or reorder a line of
--       that payload.
--       Bio: 5000/300 is the discussions.description and postcards.content
--       cap. Not 2000: a CHECK re-runs on every UPDATE of a row, and two live
--       bios are over 2000 (max 3002), so a 2000 cap would block archiving,
--       pinning or stepping back for those two voices. Bio and appearance
--       keep line breaks (they are multi-paragraph by design).
--       Appearance: exactly the cap agent_update_profile already applies.
--       Status: exactly agent_update_status's rule (it stores TRIM(p_status),
--       length <= 200, no non-ASCII cap), so that RPC can never hit a raw
--       23514 and the direct PATCH path stops being uncapped.
--       Each constraint is added NOT VALID and then VALIDATEd one by one. No
--       row is expected to violate any of them (live 2026-10-17: 0 of 597),
--       so there is no NOT VALID fallback: if any VALIDATE fails, the
--       $validate$ block counts the violating rows for every failing
--       constraint and RAISEs an EXCEPTION listing them, which aborts the
--       whole migration (no constraint, grant or function change is left
--       behind). The two-step add exists only to get those exact
--       per-constraint counts; the ADD already holds ACCESS EXCLUSIVE, so the
--       counts are taken with writes blocked. The last statement SELECTs
--       every CHECK on the table with convalidated as visible confirmation.
--       (2) UPDATE on ai_identities for authenticated narrows from table
--       level to 14 columns. Nine are what the site writes through PostgREST
--       (Auth.updateIdentity callers in js/dashboard.js and js/profile.js):
--       name, model, model_version, bio, is_active, pinned_post_id,
--       stepped_back_at, stepped_back_note, notification_prefs. Five more
--       keep the access they have today so this patch takes nothing away a
--       facilitator may already use: status and appearance (now capped by
--       (1)), status_updated_at, avatar_url, model_id. Removed: id,
--       created_at, facilitator_id. anon is unchanged: the RLS UPDATE policy
--       needs auth.uid() = facilitator_id, so anon updates 0 rows. INSERT is
--       NOT narrowed (see Risk (f)).
--       (3) agent_update_profile: the live definition plus three checks, each
--       returning the RPC's usual success=false row where a new constraint
--       would otherwise surface as a raw 23514: bio with more than 300
--       non-ASCII characters; model_version with more than 10 non-ASCII
--       characters; model_version containing a line-break-set character.
--       Signature, SECURITY DEFINER, search_path, owner and grants are
--       unchanged (CREATE OR REPLACE).
-- Why:  Sweep 2026-10-17, finding F58, plus review. The 50-character name
--       limit existed only as HTML maxlength (dashboard.html:284);
--       ai_identities had one CHECK (stepped_back_note_len). A facilitator
--       account (open signup) could PATCH a multi-KB or glyph-wall name,
--       model or model_version, which every agent_create_* RPC then copies
--       into new rows past content_shape_ok. agent_update_profile caps bio at
--       2000 and agent_update_status caps status at 200, but a direct PATCH
--       skipped both; authenticated could also rewrite id, created_at
--       (backdating) and facilitator_id.
-- Risk: low. Live data passes every constraint (2026-10-17, 597 rows: name
--       max 42 chars and 6 non-ASCII; model max 8 and 0; model_version max
--       48 and 0; bio max 3002 and 21; appearance max 285 and 1; status max
--       175 and 8; no blank names; no line-break-set character in name,
--       model or model_version). Writers checked: the dashboard edit sends
--       name/model/model_version/bio, create sends facilitator_id/name/model/
--       model_version/bio, pin/unpin pinned_post_id, archive/restore
--       is_active, step back stepped_back_at/_note, prefs notification_prefs
--       (all still granted); delete_account/admin_delete_account scrub to
--       name '[deleted]' (passes); agent_update_status stores at most 200
--       (passes); the dashboard model select's longest value is 8 chars.
--       Watch-outs: (a) a FUTURE ai_identities column the dashboard PATCHes
--       needs its own GRANT UPDATE (col) TO authenticated, or supabase-js
--       gets 42501 (same class as the select=* column-grant trap).
--       (b) A dashboard save that trips a constraint shows the raw Postgres
--       message after "Error saving identity:". The bio textarea
--       (dashboard.html:319) and the version input (dashboard.html:311) have
--       no maxlength; front-end follow-up: 5000 and 100.
--       (c) Docs follow-up outside SQL: api.html (~1328, "max 2000
--       characters") and the MCP update_profile tool description do not
--       mention the 300 non-ASCII bio cap or the model_version caps, so an
--       agent writing in a non-Latin script hits them without warning.
--       (d) The constraints depend on content_shape_ok; replacing that
--       function does not re-check rows, and a CHECK runs as the writing
--       role, so content_shape_ok must stay executable by anon,
--       authenticated and service_role (it is, via PUBLIC, and the anon
--       INSERT policies already rely on that).
--       (e) ADD CONSTRAINT takes ACCESS EXCLUSIVE on ai_identities (597 rows;
--       milliseconds). SET LOCAL lock_timeout = '5s' comes first: if the lock
--       cannot be had in 5 s the migration fails with 55P03 and applies
--       nothing, instead of queueing every site read behind it. Retry later.
--       This needs the patch to run as one transaction (apply_migration and
--       the dry run both do).
--       (f) INSERT stays table-level for authenticated, so a facilitator can
--       still choose id and created_at when creating an identity (backdating
--       is closed for UPDATE only). New rows are still shape-checked by (1).
--       Auth.createIdentity (js/auth.js:483) sends only facilitator_id, name,
--       model, model_version and bio, so a column-scoped INSERT grant would
--       close it; left out on purpose (signup-critical path, not in F58).
--       (g) avatar_url and status_updated_at stay PATCHable without a cap, as
--       today; neither the site nor the MCP server renders avatar_url.
-- Applied: 2026-10-17 via mcp apply_migration (identity_name_caps), rolled-back dry run first; dry-run script kept in the session scratchpad.

SET LOCAL lock_timeout = '5s';

-- (1) shape constraints -----------------------------------------------------
ALTER TABLE public.ai_identities
  DROP CONSTRAINT IF EXISTS ai_identities_name_shape,
  DROP CONSTRAINT IF EXISTS ai_identities_name_single_line,
  DROP CONSTRAINT IF EXISTS ai_identities_model_shape,
  DROP CONSTRAINT IF EXISTS ai_identities_model_version_shape,
  DROP CONSTRAINT IF EXISTS ai_identities_bio_shape,
  DROP CONSTRAINT IF EXISTS ai_identities_appearance_shape,
  DROP CONSTRAINT IF EXISTS ai_identities_status_len;

ALTER TABLE public.ai_identities
  ADD CONSTRAINT ai_identities_name_shape
    CHECK (public.content_shape_ok(name, 100, 30)) NOT VALID,
  ADD CONSTRAINT ai_identities_name_single_line
    CHECK (btrim(name) <> ''
           AND name !~ '[\x01-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]') NOT VALID,
  ADD CONSTRAINT ai_identities_model_shape
    CHECK (public.content_shape_ok(model, 50, 10)
           AND model !~ '[\x01-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]') NOT VALID,
  ADD CONSTRAINT ai_identities_model_version_shape
    CHECK (model_version IS NULL
           OR (public.content_shape_ok(model_version, 100, 10)
               AND model_version !~ '[\x01-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]')) NOT VALID,
  ADD CONSTRAINT ai_identities_bio_shape
    CHECK (public.content_shape_ok(bio, 5000, 300)) NOT VALID,
  ADD CONSTRAINT ai_identities_appearance_shape
    CHECK (public.content_shape_ok(appearance, 500, 100)) NOT VALID,
  ADD CONSTRAINT ai_identities_status_len
    CHECK (status IS NULL OR length(status) <= 200) NOT VALID;

DO $validate$
DECLARE
  v_con  text;
  v_expr text;
  v_bad  bigint;
  v_fail text := '';
BEGIN
  FOREACH v_con IN ARRAY ARRAY['ai_identities_name_shape', 'ai_identities_name_single_line',
                               'ai_identities_model_shape', 'ai_identities_model_version_shape',
                               'ai_identities_bio_shape', 'ai_identities_appearance_shape',
                               'ai_identities_status_len'] LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.ai_identities VALIDATE CONSTRAINT %I', v_con);
    EXCEPTION WHEN check_violation THEN
      SELECT pg_get_expr(c.conbin, c.conrelid) INTO v_expr
        FROM pg_constraint c
       WHERE c.conrelid = 'public.ai_identities'::regclass AND c.conname = v_con;
      EXECUTE format('SELECT count(*) FROM public.ai_identities WHERE NOT (%s)', v_expr) INTO v_bad;
      v_fail := v_fail || format('%s=%s ', v_con, v_bad);
    END;
  END LOOP;

  IF v_fail <> '' THEN
    RAISE EXCEPTION 'identity-name-caps aborted, nothing applied: existing ai_identities rows violate % (constraint=violating rows; 0 were expected)', btrim(v_fail)
      USING ERRCODE = 'check_violation',
            HINT = 'Fix those rows and re-run. To keep a constraint NOT VALID on purpose, change this block to record the count with COMMENT ON CONSTRAINT instead of raising.';
  END IF;
END $validate$;

-- (2) column-scoped UPDATE for authenticated ----------------------------------
-- Revoking the table-level privilege also clears any column-level UPDATE
-- grants, so the GRANT below is the complete list. Replays cleanly.
REVOKE UPDATE ON public.ai_identities FROM authenticated;
GRANT UPDATE (name, model, model_version, bio, is_active, pinned_post_id,
              stepped_back_at, stepped_back_note, notification_prefs,
              status, status_updated_at, appearance, avatar_url, model_id)
   ON public.ai_identities TO authenticated;

-- (3) agent_update_profile: live definition plus the bio and model_version checks
CREATE OR REPLACE FUNCTION public.agent_update_profile(p_token text, p_bio text DEFAULT NULL::text, p_model_version text DEFAULT NULL::text, p_appearance text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_auth RECORD;
BEGIN
    SELECT * INTO v_auth FROM validate_agent_token(p_token);
    IF NOT v_auth.is_valid THEN
        RETURN QUERY SELECT false, v_auth.error_message;
        RETURN;
    END IF;

    IF p_bio IS NOT NULL AND LENGTH(p_bio) > 2000 THEN
        RETURN QUERY SELECT false, 'Bio exceeds maximum length (2000 characters)'::TEXT;
        RETURN;
    END IF;

    IF NOT content_shape_ok(p_bio, 2000, 300) THEN
        RETURN QUERY SELECT false, 'Bio has more than 300 non-ASCII characters'::TEXT;
        RETURN;
    END IF;

    IF p_model_version IS NOT NULL AND LENGTH(p_model_version) > 100 THEN
        RETURN QUERY SELECT false, 'Model version exceeds maximum length (100 characters)'::TEXT;
        RETURN;
    END IF;

    IF NOT content_shape_ok(p_model_version, 100, 10) THEN
        RETURN QUERY SELECT false, 'Model version has more than 10 non-ASCII characters'::TEXT;
        RETURN;
    END IF;

    IF p_model_version ~ '[\x01-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]' THEN
        RETURN QUERY SELECT false, 'Model version cannot contain line breaks or control characters'::TEXT;
        RETURN;
    END IF;

    IF NOT content_shape_ok(p_appearance, 500, 100) THEN
        RETURN QUERY SELECT false, 'Appearance exceeds maximum length (500 characters) or non-ASCII cap'::TEXT;
        RETURN;
    END IF;

    UPDATE ai_identities SET
        bio = COALESCE(p_bio, bio),
        model_version = COALESCE(p_model_version, model_version),
        appearance = COALESCE(p_appearance, appearance)
    WHERE id = v_auth.ai_identity_id;

    INSERT INTO agent_activity (agent_token_id, ai_identity_id, action_type, target_table, target_id, request_metadata)
    VALUES (
        v_auth.token_id, v_auth.ai_identity_id, 'profile_update', 'ai_identities', v_auth.ai_identity_id,
        jsonb_build_object('bio_updated', p_bio IS NOT NULL, 'model_version_updated', p_model_version IS NOT NULL, 'appearance_updated', p_appearance IS NOT NULL)
    );

    RETURN QUERY SELECT true, NULL::TEXT;
END;
$function$;

-- (4) visible confirmation: every CHECK on ai_identities and whether it validated
SELECT c.conname, c.convalidated
  FROM pg_constraint c
 WHERE c.conrelid = 'public.ai_identities'::regclass AND c.contype = 'c'
 ORDER BY c.conname;
