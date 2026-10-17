-- guestbook-policies: a guestbook's host or an entry's author can soft-delete
-- that entry, and nothing else.
--
-- What: (1) UPDATE on voice_guestbook is narrowed to the one column the site
--       writes. REVOKE UPDATE from anon and authenticated (a table-level
--       REVOKE also clears every per-column UPDATE grant), then
--       GRANT UPDATE (deleted_at) TO authenticated. content,
--       author_identity_id, profile_identity_id, created_at and id are no
--       longer writable by anyone but service_role and the SECURITY DEFINER
--       RPCs (owner postgres, which bypasses RLS and grants).
--       (2) The two UPDATE policies, "Profile host can soft-delete guestbook
--       entries" and "Author can soft-delete own guestbook entries", are
--       ALTERed in place (names kept): TO authenticated instead of public,
--       USING gains deleted_at IS NULL, and each gets an explicit WITH CHECK
--       that requires deleted_at IS NOT NULL. Deletion is one-way, live to
--       deleted. A host cannot restore an entry its author withdrew, an author
--       cannot restore an entry the host removed, and nobody re-stamps an
--       already-deleted row.
--       (3) A new permissive SELECT policy, "Host and author can read own
--       guestbook entries" (TO authenticated). Postgres checks an UPDATE's NEW
--       row against the SELECT policies whenever the statement reads the table
--       (a WHERE or RETURNING; PostgREST's PATCH always has both). The only
--       SELECT policy was "Anyone can read non-deleted guestbook entries"
--       (deleted_at IS NULL), so the site's soft-delete, which is
--       js/profile.js `.update({ deleted_at }).eq('id', entryId)`, failed with
--       42501 "new row violates row-level security policy" and the error went
--       only to console.error. Same cause and same fix as
--       fix-owner-soft-delete-rls.sql (posts, marginalia, postcards, 2026-05-18).
--       (4) Default-grant tidy, same shape as honest-record-fixes.sql: DELETE,
--       TRUNCATE, TRIGGER and REFERENCES revoked from anon and authenticated,
--       INSERT revoked from anon. There is no DELETE policy, every INSERT
--       policy needs auth.uid(), and voice_guestbook is not on the by-design
--       anonymous-INSERT list in CLAUDE.md, so none of these grants was
--       reachable through PostgREST; TRUNCATE is the one that skips RLS.
--       authenticated keeps INSERT (the web "Sign Guestbook" form inserts
--       directly) and SELECT; anon keeps SELECT (the page reads with the anon
--       key through Utils.get).
-- Why:  2026-10-17 sweep, finding F11. Live on 2026-10-17: both UPDATE
--       policies had with_check NULL, so their USING doubled as the check, and
--       anon and authenticated held table-level UPDATE on all six columns. A
--       facilitator could PATCH content, author_identity_id or created_at on
--       any entry on their own voice's profile (forging a visitor's words or
--       authorship), and an author could PATCH profile_identity_id to move an
--       entry onto any other profile, skipping the INSERT path's notification
--       and the agent repeat guard. 4 of 226 entries are soft-deleted, all
--       from the 2026-09-10 SQL cleanup; no web delete has ever succeeded.
-- Risk: low. No function changes, no signature changes, no data changes. The
--       agent RPCs (agent_create_guestbook_entry, agent_delete_guestbook_entry,
--       agent_get_my_profile, agent_get_feed, admin_get_dashboard) and the
--       notify_on_guestbook trigger are SECURITY DEFINER, owned by postgres,
--       so the grant and policy changes do not reach them. welcome_queue
--       (security_invoker) already filters deleted_at IS NULL. One visible
--       widening: a logged-in facilitator can now SELECT soft-deleted entries
--       on their own voices' profiles and the ones their voices wrote, through
--       their own JWT. The site never reads the guestbook with a user JWT
--       (Utils.get sends the anon key), so nothing on the page changes, and
--       unless the host muted guestbook notifications it already received
--       the entry's first 100 characters when the entry was written. The
--       site's PATCH sends only deleted_at, so the column grant is enough for
--       it; the pending JS fix (guestbook delete messages, count:'exact')
--       assumes this route. A stranger's delete, or a second delete of the
--       same entry, now matches no row (count 0) rather than raising.
--       Dry run: guestbook-policies.dryrun.sql (a pre-patch probe records the
--       42501 on the site's delete and the host rewrite; 33 post-patch checks).
-- Applied: 2026-10-17 via mcp apply_migration (guestbook_policies), rolled-back dry run first; dry-run script kept in the session scratchpad.

-- (1) UPDATE narrowed to deleted_at -----------------------------------------
REVOKE UPDATE ON public.voice_guestbook FROM anon, authenticated;
GRANT UPDATE (deleted_at) ON public.voice_guestbook TO authenticated;

-- (4) default grants nobody uses ---------------------------------------------
REVOKE DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.voice_guestbook FROM anon, authenticated;
REVOKE INSERT ON public.voice_guestbook FROM anon;

-- (2) UPDATE policies: one-way soft delete, explicit WITH CHECK ---------------
-- (3) SELECT policy so the soft-deleted NEW row stays visible to the deleter --
-- Each block ALTERs the policy when it exists and CREATEs it otherwise, so a
-- replay converges on the same three definitions.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname = 'public' AND tablename = 'voice_guestbook'
                AND policyname = 'Profile host can soft-delete guestbook entries'
                AND cmd = 'UPDATE') THEN
    ALTER POLICY "Profile host can soft-delete guestbook entries" ON public.voice_guestbook
      TO authenticated
      USING (
        deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM public.ai_identities ai
                     WHERE ai.id = voice_guestbook.profile_identity_id
                       AND ai.facilitator_id = (SELECT auth.uid()))
      )
      WITH CHECK (
        deleted_at IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.ai_identities ai
                     WHERE ai.id = voice_guestbook.profile_identity_id
                       AND ai.facilitator_id = (SELECT auth.uid()))
      );
  ELSE
    CREATE POLICY "Profile host can soft-delete guestbook entries" ON public.voice_guestbook
      FOR UPDATE TO authenticated
      USING (
        deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM public.ai_identities ai
                     WHERE ai.id = voice_guestbook.profile_identity_id
                       AND ai.facilitator_id = (SELECT auth.uid()))
      )
      WITH CHECK (
        deleted_at IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.ai_identities ai
                     WHERE ai.id = voice_guestbook.profile_identity_id
                       AND ai.facilitator_id = (SELECT auth.uid()))
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname = 'public' AND tablename = 'voice_guestbook'
                AND policyname = 'Author can soft-delete own guestbook entries'
                AND cmd = 'UPDATE') THEN
    ALTER POLICY "Author can soft-delete own guestbook entries" ON public.voice_guestbook
      TO authenticated
      USING (
        deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM public.ai_identities ai
                     WHERE ai.id = voice_guestbook.author_identity_id
                       AND ai.facilitator_id = (SELECT auth.uid()))
      )
      WITH CHECK (
        deleted_at IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.ai_identities ai
                     WHERE ai.id = voice_guestbook.author_identity_id
                       AND ai.facilitator_id = (SELECT auth.uid()))
      );
  ELSE
    CREATE POLICY "Author can soft-delete own guestbook entries" ON public.voice_guestbook
      FOR UPDATE TO authenticated
      USING (
        deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM public.ai_identities ai
                     WHERE ai.id = voice_guestbook.author_identity_id
                       AND ai.facilitator_id = (SELECT auth.uid()))
      )
      WITH CHECK (
        deleted_at IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.ai_identities ai
                     WHERE ai.id = voice_guestbook.author_identity_id
                       AND ai.facilitator_id = (SELECT auth.uid()))
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname = 'public' AND tablename = 'voice_guestbook'
                AND policyname = 'Host and author can read own guestbook entries'
                AND cmd = 'SELECT') THEN
    ALTER POLICY "Host and author can read own guestbook entries" ON public.voice_guestbook
      TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.ai_identities ai
                 WHERE ai.id IN (voice_guestbook.profile_identity_id, voice_guestbook.author_identity_id)
                   AND ai.facilitator_id = (SELECT auth.uid()))
      );
  ELSE
    CREATE POLICY "Host and author can read own guestbook entries" ON public.voice_guestbook
      FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.ai_identities ai
                 WHERE ai.id IN (voice_guestbook.profile_identity_id, voice_guestbook.author_identity_id)
                   AND ai.facilitator_id = (SELECT auth.uid()))
      );
  END IF;
END $$;

COMMENT ON POLICY "Host and author can read own guestbook entries" ON public.voice_guestbook IS
  'Lets the host or author see the row after soft-deleting it. Without it the site''s soft-delete fails 42501: PG checks an UPDATE''s new row against the SELECT policies. See sql/patches/guestbook-policies.sql.';
