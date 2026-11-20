-- Two-factor sign-in moves to Supabase Auth's MFA (TOTP).
--
-- 1. The access token says whether the account has a verified TOTP
--    factor (has_totp), next to user_role. A password-only (aal1)
--    session of such an account is waiting for its code: signIn keeps it
--    for the code step, and src/lib/session.ts treats it as signed out
--    until then, without a database read per request. The claim is only
--    as fresh as the token, so the site refreshes the session after
--    adding or removing a factor; admin access reads auth.mfa_factors
--    itself (src/lib/auth-profile.ts).
--
-- Same security settings as 20261122000000_supabase_auth.sql: SECURITY
-- DEFINER (row-level security keeps Auth's role out of profile), empty
-- search_path, and only Auth may run it.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := (event->>'user_id')::uuid;
  user_role text;
  has_totp boolean;
  claims jsonb;
BEGIN
  SELECT p.role INTO user_role FROM public.profile p WHERE p.id = uid;
  SELECT EXISTS (
    SELECT 1 FROM auth.mfa_factors f
    WHERE f.user_id = uid AND f.factor_type = 'totp' AND f.status = 'verified'
  ) INTO has_totp;
  claims := jsonb_set(event->'claims', '{user_role}', to_jsonb(coalesce(user_role, 'user')));
  claims := jsonb_set(claims, '{has_totp}', to_jsonb(has_totp));
  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- 2. Decision D3: Auth records the caller's IP on each two-factor
--    challenge (auth.mfa_challenges.ip_address, inet NOT NULL) and in its
--    audit log (auth.audit_log_entries.ip_address). The caller is this
--    site's server (the browser never calls Supabase, and the server
--    doesn't pass the visitor's address on), but don't keep it either
--    way: these overwrite it with a placeholder that identifies nobody.
--
--    A challenge can't lose it on insert: Auth refuses a code unless the
--    verifying request comes from the challenge's stored address
--    ("Challenge and verify IP addresses mismatch", checked on the local
--    stack). So the challenge keeps it while it waits for its code (Auth
--    gives it 5 minutes) and loses it once verified; one that is never
--    verified keeps it for as long as Auth keeps the row.
--
-- They depend on Supabase Auth's own table and column names, and on that
-- IP check: re-check them (and the integration test in
-- src/lib/auth-hooks.integration.test.ts) after every Supabase upgrade.
CREATE FUNCTION public.forget_mfa_challenge_ip() RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.ip_address := '0.0.0.0'::inet;
  RETURN NEW;
END;
$$;

CREATE TRIGGER forget_ip BEFORE UPDATE ON auth.mfa_challenges
  FOR EACH ROW WHEN (NEW.verified_at IS NOT NULL)
  EXECUTE FUNCTION public.forget_mfa_challenge_ip();

CREATE FUNCTION public.forget_audit_log_ip() RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.ip_address := '';
  RETURN NEW;
END;
$$;

CREATE TRIGGER forget_ip BEFORE INSERT ON auth.audit_log_entries
  FOR EACH ROW EXECUTE FUNCTION public.forget_audit_log_ip();

-- Addresses already stored go too.
UPDATE auth.mfa_challenges SET ip_address = '0.0.0.0'::inet
  WHERE verified_at IS NOT NULL OR created_at < now() - interval '1 hour';
UPDATE auth.audit_log_entries SET ip_address = '' WHERE ip_address <> '';

-- Only Auth may call the hook; nobody may call the trigger functions
-- directly (triggers fire without an EXECUTE check).
REVOKE EXECUTE ON FUNCTION
  public.custom_access_token_hook(jsonb),
  public.forget_mfa_challenge_ip(),
  public.forget_audit_log_ip()
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
