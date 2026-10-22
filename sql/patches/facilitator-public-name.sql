-- facilitator-public-name: a new facilitator account never starts with the
-- part of its email before the @ as its public name, and the welcome queue
-- still finds who opened a thread when the opener has no public name.
--
-- What: (A) public.facilitators_no_email_name(), a BEFORE INSERT trigger on
--       public.facilitators (facilitators_no_email_name_trg). When the caller
--       is one of the two PostgREST client roles (anon, authenticated) it sets
--       NEW.display_name to NULL if the name is blank, or if, trimmed and
--       compared case-insensitively, it is the email's local part or the whole
--       email. Any other name is kept, and every other role passes untouched
--       (postgres: SQL editor, restores, postgres-owned SECURITY DEFINER code;
--       service_role: the Ko-fi webhook, which only UPDATEs). INSERT only, so
--       it never fires on an UPDATE: the existing rows whose name is their
--       email's local part (182 of 332 on 2026-10-22) and every later rename
--       are left alone. It never raises; it only clears a name. SECURITY
--       INVOKER on purpose, like guard_facilitator_supporter
--       (supporter-heart.sql): it has to read the caller's current_user.
--       (B) public.intro_household(uuid), CREATE OR REPLACE with the signature,
--       return type, language, volatility, SECURITY DEFINER and search_path it
--       has in first-hour.sql, so its owner and ACL (anon and authenticated
--       EXECUTE, which welcome_queue needs) carry over. No path treats the
--       "A facilitator" label as anyone's name any more: path 1 no longer
--       matches a post signed with it, and paths 2 and 3 skip it. A new path
--       2b covers a thread opened from an interest room by a facilitator with
--       no public name: the facilitator whose voice is named proposed_by_name
--       and was created no later than the thread, when exactly one facilitator
--       has such a voice. It does NOT look at the facilitator's display_name
--       today: the label records that the opener had no name when the thread
--       was opened, and the dashboard nudge in this same release asks exactly
--       those people to pick one afterwards. Filtering on "no name now" would
--       lose them the moment they did (welcome_queue would drop the newcomer
--       until their voice posted in its own thread), and could credit another
--       facilitator who shares the voice name and is still unnamed. A named
--       facilitator with a voice by that name counts toward "more than one",
--       so the answer is NULL rather than a guess. Paths 1, 2 and 3 are
--       otherwise as they were.
-- Why:  Sweep F07-data; Meredith's decision 2026-10-22 (option A). Every
--       account was created with display_name = the email's local part
--       (js/auth.js createFacilitator), and that name is public: it is copied
--       into discussions.created_by ("Started by") when a thread is opened
--       from an interest room, into moment_comments.display_name, and shown
--       as "Facilitated by" on voice profiles (get_identity_facilitator_name).
--       182 of 332 facilitators, 13 of the 20 newest, carry it. The site
--       change in the same release inserts {id, email} only and asks for a
--       name the first time one would be shown; until one is picked the site
--       says "A facilitator". (A) holds the line for pages still running the
--       old js/auth.js after the deploy (open tabs, a 4-hour cached copy) and
--       for any client that writes its own row over REST. (B) is needed
--       because a thread opened by a facilitator with no name has created_by
--       'A facilitator', which matches no display_name, so path 2 stops
--       finding its household; and path 3 would credit every such thread to a
--       facilitator if exactly one row ever carried that label as its name
--       (the site refuses it; nothing in the database does).
-- Risk: low. One additive trigger, and a same-signature replacement of a
--       read-only STABLE function. Nothing is dropped and no row is updated.
--       - (A) fires once per account, on its first INSERT. The two BEFORE
--         INSERT triggers on facilitators fire in name order
--         (facilitators_guard_supporter_trg, then this one) and touch
--         different columns. A name that equals the local part is cleared even
--         if the person meant it; no page sets a name at INSERT time, and the
--         dashboard can set it again afterwards (UPDATE is not touched).
--         email, is_supporter, grants and policies are not touched.
--       - If (A) is never applied, a straggler page seeds an email-derived name
--         the way every account did before; the dashboard nudge offers to
--         change it. If the site ships without (A), nothing breaks.
--       - (B) changes intro_household() only for threads whose created_by is
--         the label, plus path 1 for posts signed with it. welcome_queue reads
--         it for intro threads of the last 30 days. The dry run compares every
--         discussion's household before and after and fails if any thread not
--         carrying the label changed.
--       - get_identity_facilitator_name is NOT changed. A facilitator with no
--         name gets NULL from it, the same NULL as "no active identity", and
--         js/profile.js leaves the "Facilitated by" line hidden for both. Its
--         anon EXECUTE is load-bearing (KNOWN_TECH_DEBT); the dry run checks it
--         is still there.
--       Not verified live when written: the session had no database access,
--       and the repo shows only part of the live schema. Run
--       facilitator-public-name.dryrun.sql first. Besides its specimens it
--       reads the live catalog and fails if:
--       - a trigger on auth.users touches facilitators (none in the repo; one
--         would be a second way rows get created);
--       - any function outside pg_catalog/information_schema INSERTs (or
--         MERGEs) into facilitators. (A) skips every role but anon and
--         authenticated, so a postgres-owned SECURITY DEFINER function that
--         seeds the name from the email would get past both the site fix and
--         (A). None is in the repo; a hit must be read before applying;
--       - any function or view that reads facilitators also cuts up an email
--         (split_part, substring, left, regexp_replace, strpos/position on an
--         email). That is how a local part could still reach a public RPC or
--         view for an account whose display_name is NULL. None is in the repo;
--       - display_name is NOT NULL or has a default.
-- Applied: PENDING

-- (A) a new row never starts with an email-derived public name ------------------
CREATE OR REPLACE FUNCTION public.facilitators_no_email_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $function$
DECLARE
  v_name text;
BEGIN
  -- Only the PostgREST client roles. postgres (SQL editor, restores) and
  -- service_role keep whatever they insert.
  IF current_user NOT IN ('anon', 'authenticated') OR NEW.display_name IS NULL THEN
    RETURN NEW;
  END IF;

  v_name := lower(btrim(NEW.display_name));
  IF v_name = ''
     OR v_name = lower(btrim(split_part(coalesce(NEW.email, ''), '@', 1)))
     OR v_name = lower(btrim(coalesce(NEW.email, ''))) THEN
    NEW.display_name := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.facilitators_no_email_name() IS
  'BEFORE INSERT on facilitators: for anon/authenticated callers, a display_name that is blank or is the email''s local part (or the whole email), trimmed and case-insensitive, is stored as NULL. Never raises; never fires on UPDATE, so existing rows and renames are untouched. SECURITY INVOKER on purpose: it reads current_user. Sweep F07-data, 2026-10-22; see sql/patches/facilitator-public-name.sql.';

CREATE OR REPLACE TRIGGER facilitators_no_email_name_trg
  BEFORE INSERT ON public.facilitators
  FOR EACH ROW EXECUTE FUNCTION public.facilitators_no_email_name();

-- (B) who brought an introduction thread, when its opener has no public name ----
CREATE OR REPLACE FUNCTION public.intro_household(p_discussion_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH d AS (
    SELECT created_by, proposed_by_name, created_at,
           -- 'A facilitator' is the site's label for an opener with no public
           -- name (js/auth.js PUBLIC_NAME_FALLBACK), never anyone's name.
           lower(btrim(coalesce(created_by, ''))) = 'a facilitator' AS unnamed
      FROM public.discussions WHERE id = p_discussion_id
  )
  SELECT COALESCE(
    -- 1. The creator posted in their own thread (agent path): take that post's household.
    (SELECT COALESCE(p.facilitator_id, ai.facilitator_id)
       FROM public.posts p
       LEFT JOIN public.ai_identities ai ON ai.id = p.ai_identity_id, d
      WHERE p.discussion_id = p_discussion_id
        AND p.is_active IS DISTINCT FROM false
        AND (p.ai_name = d.proposed_by_name OR (p.ai_name = d.created_by AND NOT d.unnamed))
      ORDER BY p.created_at
      LIMIT 1),
    -- 2. Web path after Release 1: proposed_by_name is a voice whose facilitator's display name is created_by.
    (SELECT ai.facilitator_id
       FROM public.ai_identities ai
       JOIN public.facilitators f ON f.id = ai.facilitator_id, d
      WHERE NOT d.unnamed
        AND ai.name = d.proposed_by_name AND f.display_name = d.created_by
      ORDER BY ai.created_at DESC
      LIMIT 1),
    -- 2b. Web path for an opener with no public name (2026-10-22): created_by is the
    --     label, proposed_by_name is one of their voices, and exactly one
    --     facilitator has a voice by that name from before the thread. Their
    --     display_name today is not consulted: they may have picked a name since.
    (SELECT min(ai.facilitator_id::text)::uuid
       FROM public.ai_identities ai, d
      WHERE d.unnamed
        AND ai.name = d.proposed_by_name
        AND ai.created_at <= d.created_at
     HAVING count(DISTINCT ai.facilitator_id) = 1),
    -- 3. Legacy web path: created_by is a display name that exactly one facilitator uses.
    (SELECT min(f.id::text)::uuid
       FROM public.facilitators f, d
      WHERE NOT d.unnamed
        AND f.display_name = d.created_by
     HAVING count(*) = 1)
  )
  FROM d;
$$;

COMMENT ON FUNCTION public.intro_household(uuid) IS
  'Facilitator who brought an introduction thread, or NULL when it cannot be told. Definer rights only to read facilitators.display_name; returns a uuid, nothing else. created_by ''A facilitator'' (an opener with no public name) is never matched as a name; path 2b resolves it by voice. See sql/patches/first-hour.sql and facilitator-public-name.sql.';
