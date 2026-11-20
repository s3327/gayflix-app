-- Accounts move to Supabase Auth (auth.users). Each account gets a
-- profile row holding its site role; Auth's hooks put that role in the
-- access token and close sign-up when an admin closes registration.
--
-- The hooks and the trigger run as Auth's role (supabase_auth_admin),
-- which row-level security keeps out of profile and site_setting (RLS is
-- on with no policies, see 20261120000000). So they're SECURITY DEFINER,
-- owned by the role running this migration, with an empty search_path
-- and every name schema-qualified. Only Auth may call the hooks, and
-- nobody may call the trigger functions directly (Supabase's default
-- privileges on public would otherwise let anon, authenticated and
-- service_role execute all four).

CREATE TABLE public.profile (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'user',
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

-- Every new account gets a profile with role 'user'.
CREATE FUNCTION public.create_profile_for_new_user() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profile (id) VALUES (NEW.id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER create_profile AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_profile_for_new_user();

-- Accounts that already exist get one too.
INSERT INTO public.profile (id) SELECT id FROM auth.users ON CONFLICT DO NOTHING;

-- Custom Access Token hook: adds the profile's role to the token's claims
-- as user_role (read by src/lib/session.ts). The token is only a hint for
-- ordinary pages; admin checks read profile.role itself.
CREATE FUNCTION public.custom_access_token_hook(event jsonb) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  user_role text;
BEGIN
  SELECT p.role INTO user_role FROM public.profile p WHERE p.id = (event->>'user_id')::uuid;
  RETURN jsonb_set(event, '{claims,user_role}', to_jsonb(coalesce(user_role, 'user')));
END;
$$;

-- Before User Created hook: refuses new accounts while the site's settings
-- (the 'default' row, as src/lib/site-settings.ts reads it) have
-- registration closed. With no settings row, registration is open.
CREATE FUNCTION public.before_user_created_hook(event jsonb) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.site_setting s WHERE s.id = 'default' AND NOT s."registrationOpen"
    )
    THEN jsonb_build_object(
      'error', jsonb_build_object('http_code', 403, 'message', 'Public registration is currently closed.')
    )
    ELSE '{}'::jsonb
  END;
$$;

-- Decision D3: Auth records the client's IP on each session; never keep it.
CREATE FUNCTION public.forget_session_ip() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.ip := NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER forget_ip BEFORE INSERT OR UPDATE ON auth.sessions
  FOR EACH ROW EXECUTE FUNCTION public.forget_session_ip();

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION
  public.create_profile_for_new_user(),
  public.custom_access_token_hook(jsonb),
  public.before_user_created_hook(jsonb),
  public.forget_session_ip()
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.custom_access_token_hook(jsonb),
  public.before_user_created_hook(jsonb)
TO supabase_auth_admin;

ALTER TABLE public.profile ENABLE ROW LEVEL SECURITY;
