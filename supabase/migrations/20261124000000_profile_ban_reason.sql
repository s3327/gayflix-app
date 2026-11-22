-- Why an admin banned an account, shown on its /admin/users page. The ban
-- itself is Supabase Auth's (auth.users.banned_until); the reason stays
-- here, never in the account's user metadata, which the account can read.
-- Row-level security is already on for profile (no policies), so only the
-- site's own Postgres connection can read it. 200 characters, as the ban
-- form allows (BAN_REASON_MAX in src/lib/user-admin.ts).
ALTER TABLE public.profile
  ADD COLUMN ban_reason text CHECK (char_length(ban_reason) <= 200);
