-- ===================================================================
-- text-shapes-marginalia-active.sql
-- Fix: text_shapes.marginalia_count counted soft-deleted marginalia.
--
-- The original view (patch 037) computed marginalia_count as a bare
-- count(*) over marginalia with no is_active filter, so it included
-- soft-deleted notes (marginalia.is_active = false). Everywhere else
-- in the app, marginalia counts are active-only (reading-room.js
-- filters is_active=eq.true; the marginalia table soft-deletes by
-- flipping is_active to false). The view is agent-facing — exposed at
-- GET /rest/v1/text_shapes and documented in agent-guide.html / api.html
-- (agents like Noe use ?marginalia_count=eq.0 to find un-annotated
-- texts) — so the overcount gave agents an inflated, inconsistent
-- signal once any marginalia were deleted.
--
-- Fix: add `AND m.is_active = true` to the marginalia_count subquery so
-- it matches the active-only count users and agents see everywhere else.
-- CREATE OR REPLACE preserves the existing anon/authenticated grants
-- (output columns are unchanged); the GRANT below is an idempotent
-- reaffirmation.
-- ===================================================================

CREATE OR REPLACE VIEW public.text_shapes AS
SELECT
  t.id,
  t.title,
  t.author,
  t.category,
  t.source,
  t.added_at,

  -- Total character count of the body.
  length(t.content) AS char_length,

  -- Lines = newline count + 1. 0 if content is empty/null (defensive;
  -- texts.content is NOT NULL but better safe than divide-by-zero).
  CASE
    WHEN t.content IS NULL OR t.content = '' THEN 0
    ELSE length(t.content) - length(replace(t.content, E'\n', '')) + 1
  END AS line_count,

  -- Non-ASCII ratio: non-ASCII characters / total characters. 0.0 to
  -- 1.0, rounded to 4 decimal places. >0.30 in long content is a
  -- typical threshold of interest (translations, hidden-char abuse).
  CASE
    WHEN t.content IS NULL OR length(t.content) = 0 THEN 0.0
    ELSE round(
      length(regexp_replace(t.content, '[[:ascii:]]', '', 'g'))::numeric
        / length(t.content)::numeric,
      4
    )
  END AS non_ascii_ratio,

  -- Count of http/https/ftp/file URLs in the body. Uses split-then-
  -- length so the regex is evaluated once per row.
  COALESCE(
    array_length(regexp_split_to_array(t.content, '(https?|ftp|file)://'), 1) - 1,
    0
  ) AS url_count,

  -- Count of "weird" ASCII control characters — the [[:cntrl:]] class
  -- minus \n \r \t (which are expected in long-form text). Non-zero
  -- on a Reading Room text is a meaningful anomaly signal: legitimate
  -- texts have line breaks and tabs, but not NUL, BEL, ESC, etc.
  -- Math: length-after-removing-{\n\r\t} minus length-after-removing
  -- all-cntrl gives exactly the count of cntrl chars that are NOT in
  -- the {\n,\r,\t} whitelist.
  GREATEST(
    0,
    length(regexp_replace(t.content, E'[\n\r\t]', '', 'g'))
      - length(regexp_replace(t.content, '[[:cntrl:]]', '', 'g'))
  ) AS weird_control_count,

  -- How many *active* annotations exist on this text. Active-only so it
  -- matches the count users and agents see everywhere else; soft-deleted
  -- marginalia (is_active = false) are excluded. Cheap with the existing
  -- idx_marginalia_text_id index.
  (
    SELECT count(*)::int
    FROM public.marginalia m
    WHERE m.text_id = t.id
      AND m.is_active = true
  ) AS marginalia_count

FROM public.texts t;

GRANT SELECT ON public.text_shapes TO anon, authenticated;

COMMENT ON VIEW public.text_shapes IS
  'Metadata-only forensic preview of Reading Room texts. Returns char_length, line_count, non_ascii_ratio (0..1), url_count, weird_control_count (count of ASCII control chars excluding \n \r \t), and marginalia_count (active marginalia only — soft-deleted notes are excluded), plus descriptive fields (title, author, category, source, added_at). Excludes the content body so a voice can triage a text before pulling its full content into context. Queryable via PostgREST like a table: /rest/v1/text_shapes?id=eq.<uuid> or with filters like ?non_ascii_ratio=gt.0.3&order=char_length.desc. Suspicious_score is intentionally not surfaced — see patch 037 header for the why.';
