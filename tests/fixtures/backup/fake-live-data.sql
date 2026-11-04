-- A small fake "live" Commons, built on top of fake-fresh-project.sql. It has
-- the shapes a restore has to get right: tables that reference auth.users,
-- RLS with policies, a private table the API roles must NOT be able to read,
-- a revoked function, a trigger on auth.users that calls a public function,
-- a sequence, a view, and text that is not plain ASCII. Every value is made
-- up. Run as supabase_admin; the public objects are created as postgres, the
-- way they are on Supabase.
INSERT INTO vault.secrets VALUES ('00000000-0000-4000-8000-0000000000ff', 'fake vault secret');

SET ROLE postgres;

CREATE TABLE public.facilitators (
    id uuid PRIMARY KEY REFERENCES auth.users(id),
    email text,
    display_name text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ai_identities (
    id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    facilitator_id uuid REFERENCES public.facilitators(id),
    name text NOT NULL,
    model text,
    is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.posts (
    id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    ai_identity_id uuid REFERENCES public.ai_identities(id),
    content text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.notifications (
    id bigserial PRIMARY KEY,
    facilitator_id uuid REFERENCES public.facilitators(id),
    message text
);
CREATE TABLE public.ip_hashes (
    id bigserial PRIMARY KEY,
    ip_hash text NOT NULL
);

ALTER TABLE public.facilitators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own row" ON public.facilitators FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "public read" ON public.ai_identities FOR SELECT TO anon, authenticated USING (is_active);
CREATE POLICY "public read" ON public.posts FOR SELECT TO anon, authenticated USING (is_active);
CREATE POLICY "own notifications" ON public.notifications FOR SELECT TO authenticated USING (facilitator_id = auth.uid());

-- The live project revoked what the fresh-project defaults granted: the API
-- roles get exactly these and nothing else.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, service_role;
GRANT SELECT ON public.ai_identities, public.posts TO anon, authenticated;
GRANT SELECT ON public.facilitators, public.notifications TO authenticated;
GRANT INSERT ON public.posts TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
-- public.ip_hashes: no API role gets anything.
REVOKE ALL ON public.ip_hashes FROM service_role;

CREATE VIEW public.active_posts WITH (security_invoker = true) AS
    SELECT id, ai_identity_id, content, created_at FROM public.posts WHERE is_active;
REVOKE ALL ON public.active_posts FROM anon, authenticated, service_role;
GRANT SELECT ON public.active_posts TO anon, authenticated;

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO public.facilitators (id, email, display_name)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'display_name');
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.post_count() RETURNS bigint
    LANGUAGE sql STABLE AS $$ SELECT count(*) FROM public.posts WHERE is_active $$;
REVOKE ALL ON FUNCTION public.post_count() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_count() TO anon, authenticated;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

RESET ROLE;

-- Sign-ups go through auth.users, and the trigger makes the facilitator row.
INSERT INTO auth.users (id, email, encrypted_password, raw_user_meta_data)
SELECT ('00000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
       'facilitator' || g || '@example.invalid',
       '$2a$10$fakehashfakehashfakehashfakehashfakehashfakehashfakeh',
       jsonb_build_object('display_name', 'Facilitator ' || g)
FROM generate_series(1, 12) g;
INSERT INTO auth.identities (id, user_id, provider)
SELECT ('00000000-0000-4000-9000-' || lpad(g::text, 12, '0'))::uuid,
       ('00000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'email'
FROM generate_series(1, 12) g;

SET ROLE postgres;
INSERT INTO public.ai_identities (facilitator_id, name, model)
SELECT ('00000000-0000-4000-8000-' || lpad((1 + g % 12)::text, 12, '0'))::uuid,
       'Voice ' || g, (ARRAY['claude', 'gpt', 'gemini', 'grok'])[1 + g % 4]
FROM generate_series(1, 30) g;
INSERT INTO public.posts (ai_identity_id, content, is_active)
SELECT i.id,
       'Fake post ' || g || ' from ' || i.name || '. Café, naïve, 日本語, ✓. ' || repeat('x', g * 37),
       g % 10 <> 0
FROM generate_series(1, 400) g
JOIN LATERAL (SELECT id, name FROM public.ai_identities ORDER BY name OFFSET (g % 30) LIMIT 1) i ON true;
INSERT INTO public.notifications (facilitator_id, message)
SELECT ('00000000-0000-4000-8000-' || lpad((1 + g % 12)::text, 12, '0'))::uuid, 'Fake notice ' || g
FROM generate_series(1, 75) g;
INSERT INTO public.ip_hashes (ip_hash)
SELECT md5('fake-ip-' || g) FROM generate_series(1, 20) g;
RESET ROLE;

-- A marker that must never appear in a file the backup leaves behind.
UPDATE public.posts SET content = content || ' PLAINTEXT-CANARY-4f9c' WHERE content LIKE 'Fake post 7 %';
