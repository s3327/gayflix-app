-- Supabase serves every table in the public schema through its Data API
-- (PostgREST) to anyone holding the project's anon key, which is meant to
-- be public. The site never uses that API: it connects as the database
-- owner, whom row-level security doesn't apply to. Turning RLS on with no
-- policies closes the API to every table (accounts and password hashes
-- included) and changes nothing for the site. Plain Postgres (local, CI)
-- behaves the same. New tables need the same line: see AGENTS.md.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
