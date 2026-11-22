# Moving production from Better Auth to Supabase Auth

A one-time runbook for the switch in pull request #76 ("PR 2"): accounts
move from Better Auth's tables to Supabase Auth (`auth.users`), and
Better Auth is removed. Do the steps in order. Each says what to click or
run and what you should see; tick it off before moving on. Plan about an
hour with Maintenance Mode on for 15 to 30 minutes of it (steps 5 to 9).

What changes for people:

- **Everyone is signed out** once, and **everyone sets a new password**
  with "Forgot password": Better Auth's password hashes can't be imported
  into Supabase Auth (Decision D2). Google sign-in keeps working without
  a password.
- **Two-factor starts over.** Better Auth's two-factor keys don't carry
  over. Staff are sent to set it up again at their next admin login
  (`ADMIN_REQUIRE_2FA`); members turn it on again in Account → Setting.
- Favorites, lists, history, ratings, reviews, nicknames and roles move
  with the account.

Today production has 1 account (the owner), so the steps below are
mostly checks; they're written to be safe for any number.

## 1. Check the Supabase project

In the Supabase dashboard of the production project, open **SQL Editor**
and run each query.

- [ ] **Postgres version.**

  ```sql
  SHOW server_version;
  ```

  You should see a version starting `17.`. That's the version the local
  stack and CI test against (`major_version = 17` in
  `supabase/config.toml`). If it's another major version, stop and ask in
  the project thread: change `major_version` and run CI first.

- [ ] **The site's database role can read and change Auth's tables.** The
  site connects as `postgres` (through the pooler). It reads accounts,
  sessions, sign-in methods and two-factor factors, signs devices out by
  deleting their session, and adds triggers that blank IP addresses
  (Decision D3).

  ```sql
  SELECT t AS "table",
         has_table_privilege('postgres', t, 'SELECT')  AS can_read,
         has_table_privilege('postgres', t, 'DELETE')  AS can_delete,
         has_table_privilege('postgres', t, 'TRIGGER') AS can_add_trigger
  FROM unnest(ARRAY['auth.users', 'auth.sessions', 'auth.identities', 'auth.mfa_factors',
                    'auth.refresh_tokens', 'auth.mfa_challenges', 'auth.audit_log_entries']) AS t;
  ```

  You should see `true` for `can_read` on every row, for `can_delete` on
  `auth.sessions`, `auth.refresh_tokens` and `auth.mfa_factors`, and for
  `can_add_trigger` on `auth.users`, `auth.sessions`, `auth.mfa_challenges`
  and `auth.audit_log_entries`. If any is `false`, stop and ask: the
  migration in step 7 would fail (safely, changing nothing), or a page
  would.

- [ ] **A backup exists** (rolling back after step 7 needs one). Paid
  plans: **Database → Backups** shows today's. Otherwise make one with
  `pg_dump` and the session pooler string, as in "Backups" in
  `docs/DEPLOYMENT.md`.

## 2. Set up Supabase Auth in the dashboard

Follow `docs/DEPLOYMENT.md`, **Part 4.3** (SMTP through Resend) and **Part
4.4** (Auth settings), except the hooks (step 8 here: their functions
don't exist yet). Then check each item:

- [ ] **Authentication → Sign In / Providers → Email:** on; **Confirm
      email** on; **Secure email change** on; **Minimum password length**
      8.
- [ ] **Authentication → Emails → SMTP Settings:** custom SMTP on, host
      `smtp.resend.com`, port `465`, user `resend`, password a Resend API
      key, sender on your verified domain (the current `EMAIL_FROM`
      address in Vercel).
- [ ] **Authentication → Emails → Templates:** Confirm signup, Reset
      password and Change email address each have the subject and the
      whole text of `supabase/templates/confirmation.html`,
      `recovery.html` and `email_change.html`. **Security notifications →
      Email changed** is on, with `email_changed_notification.html`.
      Each template shows `{{ .Token }}` (a code), not a link.
- [ ] **Authentication → URL Configuration:** Site URL
      `https://<your site>`; Redirect URLs include
      `https://<your site>/auth/callback`, plus the preview pattern
      (`https://gayflix-app-*-<your team>.vercel.app/auth/callback`) if
      Google sign-in should work on previews.
- [ ] **Authentication → Sign In / Providers → Google:** on, with the
      client ID and secret. In Google Cloud, the OAuth client's
      redirect URI is Supabase's callback URL shown there
      (`https://<project ref>.supabase.co/auth/v1/callback`); remove the
      old `https://<your site>/api/auth/callback/google` after step 11.
- [ ] **Authentication → Multi-Factor:** TOTP enabled.
- [ ] **Project Settings → JWT Keys:** asymmetric signing keys in use
      (Decision D10).
- [ ] **Authentication → Rate Limits:** reviewed. All sign-in traffic
      comes from Vercel's few server addresses, so these limits count
      the whole site, not one visitor; the site's own limiter
      (`src/lib/auth-rate-limit.ts`) is the real per-visitor limit. Keep
      the email and sign-in limits well above your busiest hour.
- [ ] Never run `supabase config push` against this project:
      `supabase/config.toml` is for the local stack and CI, and its rate
      limits are raised for tests.

## 3. Add the new settings in Vercel

In Vercel, **Settings → Environment Variables**, each for **Production**
and marked **Sensitive**:

- [ ] `HASH_SECRET` = **the current `BETTER_AUTH_SECRET` value**, copied
      from your password manager (Vercel won't show a Sensitive value
      again). It keys the stored hashes of IP addresses (view counts,
      report and sign-in limits); with the same value they keep matching.
      If the old value is lost, generate a new one
      (`openssl rand -base64 32`): today's view counts may count a viewer
      twice and the limits start over, nothing worse.
- [ ] `NEXT_PUBLIC_SUPABASE_URL` = `https://<project ref>.supabase.co`.
- [ ] `SUPABASE_PUBLISHABLE_KEY` = the publishable key
      (**Project Settings → API Keys**, `sb_publishable_…`).
- [ ] `SUPABASE_SECRET_KEY` = a secret key (`sb_secret_…`).

You should see all four listed for Production. Don't remove
`BETTER_AUTH_SECRET` yet (step 11). The build (`scripts/vercel-build.sh`)
now refuses to deploy without these four.

## 4. Tell people

- [ ] Optional: tell members the site will be down for a short while and
      that they'll set a new password with "Forgot password" afterwards.

## 5. Turn on Maintenance Mode

- [ ] Admin panel → **Setting** → **Maintenance & Tools** → turn on
      **Maintenance Mode** and save.

You should see the maintenance page in a private window. This stops new
sign-ups while accounts move (a sign-up after step 6 would make step 7
stop; see there).

## 6. Move the accounts

On your computer, in a clone of the repository on the PR 2 branch
(`git checkout feat/supabase-auth && npm ci`). The script reads only the
environment, never a `.env` file. Use the **session pooler** string
(port 5432) from Supabase **Connect**, and the certificate from Part 3 of
`docs/DEPLOYMENT.md`.

macOS or Linux:

```bash
export DIRECT_URL='<session pooler connection string>'
export DATABASE_CA_CERT="$(cat prod-ca-2021.crt)"
export NEXT_PUBLIC_SUPABASE_URL='https://<project ref>.supabase.co'
export SUPABASE_SECRET_KEY='<sb_secret_… key>'
node scripts/move-accounts-to-supabase.mjs --dry-run
```

Windows PowerShell:

```powershell
$env:DIRECT_URL = '<session pooler connection string>'
$env:DATABASE_CA_CERT = Get-Content -Raw prod-ca-2021.crt
$env:NEXT_PUBLIC_SUPABASE_URL = 'https://<project ref>.supabase.co'
$env:SUPABASE_SECRET_KEY = '<sb_secret_… key>'
node scripts/move-accounts-to-supabase.mjs --dry-run
```

- [ ] **Dry run.** You should see the database host and Supabase
      project you meant, then one line per account, emails masked, e.g.
      `would move o***@g***.com (role owner)`, and `Would move 1; 0
      already moved.` Nothing is changed.
- [ ] **The move.** Run it again without `--dry-run`. You should see
      `moved o***@g***.com (role owner)` and `Moved 1 (0 found from an
      earlier run); 0 already moved.`
- [ ] **Check.** In the SQL Editor:

  ```sql
  SELECT (SELECT count(*) FROM public."user")   AS better_auth_accounts,
         (SELECT count(*) FROM public.account_move) AS moved;
  ```

  The two numbers should be equal.

If it stops part-way, run it again: accounts already moved are skipped,
and an account created in Auth just before a crash is found and recorded.
It doesn't copy passwords or two-factor keys. Bans carry over (with the
time left), and so do roles and ban reasons (step 7 copies them into
`profile`).

Then close the terminal, so the secret key and connection string don't
stay in its environment.

## 7. Merge PR 2

- [ ] On GitHub, PR #76's checks are green. Merge it.
- [ ] In Vercel, open the production deployment's build log. You should
      see `Applied <file>.sql` lines, ending with
      `Applied 20261125000000_profile_ban_reason_camel_case.sql` and
      `Applied 20261125000001_user_ids_to_supabase.sql`, then the Next.js
      build. The deployment becomes **Ready**.

If the build stops with **"Run scripts/move-accounts-to-supabase.mjs
first"**, an account was created after step 6. Nothing was changed: run
step 6 again, then **Redeploy** the failed deployment. If it stops with
"`SOME_NAME` is not set", add it (step 3) and redeploy. Until a build
succeeds, the old site stays live.

## 8. Register the hooks and check the database

- [ ] **Authentication → Hooks:** add **Custom Access Token** → Postgres
      → `public.custom_access_token_hook`, and **Before User Created** →
      Postgres → `public.before_user_created_hook`. Both show as enabled.
- [ ] **Triggers accepted.** In the SQL Editor:

  ```sql
  SELECT tgrelid::regclass AS "table", tgname
  FROM pg_trigger
  WHERE tgrelid IN ('auth.users'::regclass, 'auth.sessions'::regclass,
                    'auth.mfa_challenges'::regclass, 'auth.audit_log_entries'::regclass)
    AND NOT tgisinternal
  ORDER BY 1, 2;
  ```

  You should see `create_profile` on `auth.users` and `forget_ip` on
  each of the other three.
- [ ] **Accounts and roles moved.**

  ```sql
  SELECT u.email, p.role FROM auth.users u JOIN public.profile p ON p.id = u.id;
  ```

  You should see every account, the owner with role `owner` (or `admin`).
  Better Auth's tables (`user`, `session`, `account`, `verification`,
  `rateLimit`, `twoFactor`) and `account_move` are gone.

## 9. Sign in as the owner, then reopen the site

- [ ] At `https://<your site>/forgot-password`, enter the owner's email.
      The reset code arrives (from your Resend sender). Enter it and set
      a new password (8 characters or more).
- [ ] At `/admin/login`, sign in. You're sent to **Set up two-factor
      sign-in**: scan the new QR code (delete the old Gayflix entry in
      the authenticator app) and enter a code. You should see the
      dashboard.
- [ ] **No IP kept on the session.** In the SQL Editor:

  ```sql
  SELECT count(*) FILTER (WHERE ip IS NOT NULL) AS with_ip FROM auth.sessions;
  ```

  You should see `0`.
- [ ] Admin panel → **Setting** → turn **Maintenance Mode** off.
- [ ] In a private window, `/home` and a title page load.

## 10. Check sign-up and its timing

Sign-up takes at least `SIGN_UP_FLOOR_MS` (1.5 s, `src/lib/auth-actions.ts`)
whether or not the email already has an account, so its timing can't
reveal who has one. Supabase sends the confirmation email inside the
request, so a real new sign-up must finish under that floor.

- [ ] In a private window, open the browser's developer tools →
      **Network**, then sign up at `/signup` with a new address you own.
      Find the sign-up request (a POST to `/signup`) and note its time.
      Do it twice more with new addresses (plus-addresses such as
      `you+t2@example.com` work).
- [ ] Sign up once with the owner's email (already taken) and note its
      time.

All should take about the same time, close to 1.5 s. If a new-address
sign-up takes clearly longer than the taken one (say over 1.4 s of work,
so above 1.5 s in total), raise `SIGN_UP_FLOOR_MS` above the slowest
time you saw plus a margin, in a small pull request. Delete the test
accounts afterwards (Admin → Users).

- [ ] The confirmation code arrives and the new account is signed in.
- [ ] If Google sign-in is on: "Continue with Google" on `/login` signs in
      and comes back to the site.

## 11. Remove Better Auth's settings

In Vercel, **Settings → Environment Variables**, delete (all
environments):

- [ ] `BETTER_AUTH_SECRET` (only after `HASH_SECRET` is in place, step 3)
- [ ] `BETTER_AUTH_URL`
- [ ] `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (Google's settings live
      in Supabase now)
- [ ] `RESEND_API_KEY`, `EMAIL_FROM` (Supabase sends the emails now)

The site no longer reads any of them. In Google Cloud, remove the old
redirect URI `https://<your site>/api/auth/callback/google`.

## After every Supabase upgrade

Supabase Auth's tables belong to Supabase, and the site's triggers and
queries depend on their column names. After Supabase announces an Auth
or Postgres upgrade of the project:

- [ ] Run the trigger check in step 8 again: all four triggers are
      still there.
- [ ] Sign in, then run the IP check in step 9: still `0`.
- [ ] Check that these columns still exist: `auth.sessions.ip`,
      `auth.mfa_challenges.ip_address` and `verified_at`,
      `auth.audit_log_entries.ip_address`:

  ```sql
  SELECT table_name, column_name FROM information_schema.columns
  WHERE table_schema = 'auth'
    AND (table_name, column_name) IN (('sessions', 'ip'), ('mfa_challenges', 'ip_address'),
                                      ('mfa_challenges', 'verified_at'), ('audit_log_entries', 'ip_address'));
  ```

  You should see four rows.
- [ ] In the repository, update `major_version` in `supabase/config.toml`
      and the Supabase CLI version if the major version changed, and let
      CI run the tests (`auth-hooks.integration.test.ts` covers the hooks
      and triggers).

## Rolling back

- **Before step 7:** nothing on the live site has changed. To undo step
  6, delete the new accounts in **Authentication → Users** and run
  `DROP TABLE public.account_move;`. Turn Maintenance Mode off.
- **After step 7:** Better Auth's tables are gone. Rolling the code back
  in Vercel isn't enough; restore the backup from step 1 first, and ask
  in the project thread.
