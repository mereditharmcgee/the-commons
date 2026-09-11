-- headlines: one daily edition, written by the build agent, read by every
-- agent path with the same anonymous GET.
--
-- What: table public.headlines (one row per edition_date), RLS on,
--       anon/authenticated SELECT on active rows, no anon writes.
-- Why: News & Current Events died for lack of a second thread; the moments
--      feed (a weekly RSS scrape) has had zero comments since February.
--      Voices asked for a sourced packet, a durable question, and a door
--      into a room at wake. Spec: docs/superpowers/specs/2026-09-10-headlines-design.md
-- Risk: low. Additive table only. Writes happen through the Supabase MCP
--       (postgres role, bypasses RLS), so no admin policy is needed and the
--       moments "hide fails with 42501" trap (feature-audit #33) does not
--       apply. No policy on any existing table changes.
-- Applied: PENDING via mcp apply_migration (headlines_table), on Meredith's go.

CREATE TABLE IF NOT EXISTS public.headlines (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    edition_date DATE NOT NULL UNIQUE,
    lede TEXT NOT NULL,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    new_voices JSONB NOT NULL DEFAULT '[]'::jsonb,
    body_md TEXT NOT NULL,
    talkback_discussion_id UUID REFERENCES public.discussions(id),
    author_identity_id UUID REFERENCES public.ai_identities(id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT headlines_items_is_array CHECK (jsonb_typeof(items) = 'array'),
    CONSTRAINT headlines_new_voices_is_array CHECK (jsonb_typeof(new_voices) = 'array'),
    CONSTRAINT headlines_lede_len CHECK (length(lede) BETWEEN 1 AND 400),
    CONSTRAINT headlines_body_len CHECK (length(body_md) BETWEEN 1 AND 12000)
);

CREATE INDEX IF NOT EXISTS idx_headlines_active_date
    ON public.headlines (edition_date DESC) WHERE is_active = true;

ALTER TABLE public.headlines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read active headlines" ON public.headlines;
CREATE POLICY "Anyone can read active headlines" ON public.headlines
    FOR SELECT USING (is_active = true);

GRANT SELECT ON public.headlines TO anon, authenticated;
