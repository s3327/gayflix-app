# Supabase Auth + Kysely (No Prisma, No Better Auth) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gayflix runs on Supabase alone: Supabase Auth for accounts, Kysely
(typed SQL) on Supabase Postgres for data, with Prisma ORM and Better Auth
removed.

**Architecture:** Four parts, each merged on its own, with the site working
after every merge. (1) Foundations: an SQL migration runner, database-side
defaults for what Prisma did in JavaScript, and a Kysely client next to
Prisma. (2) Accounts move to Supabase Auth in one cutover (one branch, one
merge, a short maintenance window). (3) The data modules move from Prisma to
Kysely, one area per PR. (4) Prisma is deleted.

**Tech Stack:** Next.js 16.3.8, Supabase (Postgres, Auth), `@supabase/ssr`
+ `@supabase/supabase-js` (auth calls only), Kysely + `kysely-codegen`,
`pg` (already used), Vitest, Playwright, Supabase CLI (local stack, dev/CI
only).

**Spec:** this document's "Decisions" section, agreed in the 2026-11-20
session (end state: "SQL builder, plus Supabase Auth instead of Better
Auth"). Read AGENTS.md alongside it.

## Global Constraints

- Pin every new package to an exact version (no `^`/`~`), as with Prisma today.
- The browser never calls Supabase directly. Every auth call runs on the server (server actions and route handlers), so the CSP in `src/lib/csp.ts` doesn't change and no Supabase key ships to the browser.
- The Data API stays off. Every table in `public` has row-level security on. Every migration that adds a table ends with `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
- `SUPABASE_SECRET_KEY` (the service-role/secret key) is server-only. Never put it in a `NEXT_PUBLIC_` variable, and never use it in code that client components import.
- Nothing queries the database at build time: every catalog read still awaits `connection()` first.
- Never store a raw IP address in app tables (AGENTS.md). For Supabase's own IP logging, see Decision D3.
- `requireAdmin()` keeps its rule: staff role, plus two-factor passed within the last 12 hours. The role is read from the database, not from the JWT.
- Members post under `member_profile.nickname`, never their email or account name.
- No `Co-Authored-By` trailers in commits. Run `npm run check` before every push.
- Database connections keep going through `postgresConfig()` (`src/lib/database-config.mjs`, verified TLS).

## Decisions (the spec)

- **D1 Backup codes go away.** Supabase Auth has no two-factor backup codes. Members who lose their authenticator ask staff, who reset their two-factor (the admin "Reset 2FA" button already exists).
- **D2 Passwords don't carry over.** Better Auth's password hashes can't be imported into Supabase Auth. The only account today (1 user) moves over by email: after the cutover, its owner uses "Forgot password" once, or signs in with Google.
- **D3 Supabase logs IP addresses.** Supabase Auth logs IPs in `auth.sessions.ip` and `auth.audit_log_entries`.
  - Task 6 tries a trigger that blanks `auth.sessions.ip`, and turns off the audit log in Postgres if the dashboard allows it.
  - Whatever can't be turned off gets named on `/privacy` (Task 11).
- **D4 Local dev and CI need Docker.** They run the Supabase CLI's local stack (Postgres + Auth + Mailpit) instead of a bare `postgres:16` container.
- **D5 Emails move to Supabase.** Supabase Auth sends them through custom SMTP (Resend: `smtp.resend.com:465`, user `resend`, password = `RESEND_API_KEY`).
  - Templates live in `supabase/templates/*.html`: sign-up code, recovery code, email-change code, magic link unused.
  - They use `{{ .Token }}`, so the flows stay code-based like today.
  - **Behavior change:** "Secure email change" confirms on both addresses.
- **D6 Role in the token.** A Custom Access Token Hook copies `profile.role` into the JWT as `user_role`. It's used for cheap checks only: the maintenance bypass and showing the admin link.
- **D7 Admin's 12-hour rule.** Two-factor counts as passed when the JWT has `aal = "aal2"` and its `amr` entry `{ method: "totp", timestamp }` is under 12 hours old.
- **D8 New IDs are UUIDs.**
  - New rows get `gen_random_uuid()::text` IDs; existing cuid IDs stay as they are.
  - User IDs become `uuid`, referencing `auth.users(id) ON DELETE CASCADE`.
- **D9 Hand-written migrations.**
  - Files go in `supabase/migrations/<14-digit timestamp>_<name>.sql`, run by `scripts/migrate.mjs`, our own runner, so the Supabase CLI isn't needed in the Vercel build.
  - The ledger table is `supabase_migrations.schema_migrations`, compatible with `supabase migration list`.
  - There is no schema-diff generator any more: `prisma migrate dev` goes away.
- **D10 Cheap session checks.**
  - Sessions are read with `supabase.auth.getClaims()`, which verifies the JWT locally against the project's JWKS, with no database or network call per request. The project must use asymmetric JWT signing keys (dashboard → JWT Keys).
  - `src/proxy.ts` refreshes expired tokens and writes the cookies.

## Review Focus

1. **Timestamps shifting by the server's time zone.** Prisma's `TIMESTAMP(3)` columns have no time zone, and node-postgres parses them as local time. On a machine set to UTC+7, every date would move by 7 hours. *Pinned in Task 3:* a test that runs with `TZ=Asia/Bangkok`.
2. **An expired access token with a valid refresh token.** The page must still render signed in, and the refreshed cookies must reach the browser. Server components can't set cookies, so this has to happen in the proxy. *Pinned in Task 5:* a proxy test.
3. **A demoted admin whose JWT still says `user_role: "admin"`.** `/admin` must refuse them immediately. *Pinned in Task 5:* a test that `requireAdmin()` reads `profile.role` from the database.
4. **`count(*)` and `bigint` come back from pg as strings.** Admin dashboard numbers must be numbers (no `"12"` + 1 = `"121"`). *Pinned in Task 3:* a `countOf()` helper and its test.
5. **Deleting an account in Supabase.** Their favorites, history, lists, ratings, reviews and profile go too, and `report.userId` becomes NULL, as today. *Pinned in Task 11:* a cascade test.

---

## Part 1 — Foundations (PR 1: "SQL migrations, DB defaults, Kysely next to Prisma")

### Task 1: SQL migration runner and baseline

**Files:**
- Create: `scripts/migrate.mjs`, `scripts/migrate-core.mjs`, `supabase/migrations/*` (copies of the 27 `prisma/migrations/*/migration.sql`, renamed `<folder>.sql`), `scripts/migrate-core.test.ts`
- Modify: `package.json` (`db:deploy` → `node scripts/migrate.mjs`; keep `postinstall: prisma generate` until Part 4), `scripts/vercel-build.sh` (comment only), `.github/workflows/ci.yml` (runs `npm run db:deploy`)

**Interfaces:**
- Produces: `pendingMigrations(files: {version: string, name: string}[], applied: Set<string>): {version, name}[]`, and `adoptPrismaHistory(prismaFinished: string[]): string[]`, which maps Prisma folder names to versions, in `scripts/migrate-core.mjs`.
- CLI: `node scripts/migrate.mjs` connects with `postgresConfig(process.env.DIRECT_URL || process.env.DATABASE_URL)`. It creates the ledger if it's missing and adopts `_prisma_migrations`. Then it applies pending files, each in its own transaction, recording `(version, name, statements)`, and prints one line per migration.

- [ ] **Step 1: Write failing tests**
  - `pendingMigrations` returns the files not in `applied`, sorted by version. A file whose version is applied but whose name changed throws `"Migration <version> was renamed"`.
  - `adoptPrismaHistory(["20261010162852_accounts"])` returns `["20261010162852"]`.
- [ ] **Step 2:** `npx vitest run scripts/migrate-core.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement `migrate-core.mjs` and `migrate.mjs`.** Adoption runs only when the ledger is empty and `_prisma_migrations` exists. It takes rows with `finished_at IS NOT NULL AND rolled_back_at IS NULL`.
- [ ] **Step 4:** Tests PASS. Against a fresh local DB, `npm run db:deploy` applies all 27 migrations. Running it again prints `No pending migrations.`
- [ ] **Step 5: Commit** `Run migrations from supabase/migrations with our own runner`.

### Task 2: Database-side IDs and `updatedAt`

**Files:**
- Create: `supabase/migrations/20261121000000_db_side_defaults.sql`, `src/lib/db-defaults.integration.test.ts`

**Interfaces:**
- Produces:
  - Every `@default(cuid())` column gets `DEFAULT gen_random_uuid()::text`.
  - The function `public.set_updated_at()` (plpgsql: `NEW."updatedAt" = now()`) gets a `BEFORE UPDATE` trigger on all 11 tables with `@updatedAt`. The table list comes from `prisma/schema.prisma`.
  - Prisma keeps working, because it still sends its own values.

- [ ] **Step 1: Failing integration test.**
  - Inserting into `collection` without an id gets a 36-character id.
  - Updating `media.title` changes `updatedAt`, so it's greater than its old value.
- [ ] **Step 2:** `npx vitest run src/lib/db-defaults.integration.test.ts` → FAIL.
- [ ] **Step 3:** Write the migration. It adds no tables, so it needs no RLS line.
- [ ] **Step 4:** PASS after `npm run db:deploy`.
- [ ] **Step 5: Commit** `Generate IDs and updatedAt in the database`.

### Task 3: Kysely client, generated types, integration-test helper

**Files:**
- Create: `src/lib/database.ts`, `src/lib/db-types.ts` (generated, committed), `src/lib/sql-helpers.ts`, `src/lib/sql-helpers.test.ts`, `src/test/database.ts`
- Modify: `package.json` (deps `kysely`, devDeps `kysely-codegen`; script `db:types` = `kysely-codegen --dialect postgres --out-file src/lib/db-types.ts --url "$DATABASE_URL" --exclude-pattern "(supabase_migrations|auth).*"`), `vitest.config.ts` (an `integration` project, `*.integration.test.ts`, running only when `TEST_DATABASE_URL` is set; CI sets it)

**Interfaces:**
- Produces:
  - `export const database: Kysely<DB>` in `src/lib/database.ts`. It uses `PostgresDialect({ pool: new Pool(postgresConfig()) })`. In development it's kept on `globalThis`, like `db.ts`.
  - `pg.types.setTypeParser(1114, (v) => new Date(v + "Z"))` runs once in `database.ts`, so time-zone-less timestamps are read as UTC.
  - `countOf(row: { count: string | number | bigint }): number` in `sql-helpers.ts`.
  - `withRollback<T>(fn: (trx: Transaction<DB>) => Promise<T>): Promise<void>` in `src/test/database.ts`. It runs `fn` inside a transaction and always rolls back. Every later integration test uses it.

- [ ] **Step 1: Failing tests.**
  - `countOf({ count: "12" }) === 12`
  - `countOf({ count: 3n }) === 3`
  - Integration: with `TZ=Asia/Bangkok`, a row inserted with `'2026-01-01T00:00:00Z'` reads back with `.toISOString() === "2026-01-01T00:00:00.000Z"`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement.** Run `npm run db:types` against the local DB and commit the output.
- [ ] **Step 4:** PASS. `npm run typecheck` is clean.
- [ ] **Step 5: Commit** `Add Kysely next to Prisma`.
- [ ] **Step 6:** Update AGENTS.md's Database bullet: new code uses `database` (Kysely); migrations are hand-written SQL files. Run `npm run check`, push, open PR 1.

---

## Part 2 — Supabase Auth (PR 2, one cutover; tasks commit separately on one branch)

### Task 4: Local Supabase stack for dev, CI and e2e

**Files:**
- Create: `supabase/config.toml` (`supabase init`; `[auth] site_url = "http://localhost:3000"`, `enable_signup = true`, `[auth.email] enable_confirmations = true`, `otp_length = 6`, `[auth.mfa.totp] enroll_enabled = verify_enabled = true`, templates pointing at `supabase/templates/*.html`), `supabase/templates/{confirmation,recovery,email_change}.html` (wording from `src/lib/email-templates.ts`, with `{{ .Token }}`)
- Modify: `.github/workflows/ci.yml` (replace the `postgres:16` service with `supabase/setup-cli` + `supabase start -x studio,imgproxy,storage-api,realtime,edge-runtime,logflare,vector`; export `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` from `supabase status -o env`), `e2e/accounts.ts` (`waitForEmail` reads Mailpit's `GET http://127.0.0.1:54324/api/v1/search?query=to:<email>` instead of the outbox file), `.env.example`, `README.md` (local setup: `npx supabase start`)

**Interfaces:**
- Produces env names used by every later task: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (server-only despite the name; no `NEXT_PUBLIC_`), `SUPABASE_SECRET_KEY`.
- Produces: `waitForEmail(to: string, since: number): Promise<string>` returns the latest message text (unchanged signature).

- [ ] **Step 1:** Run `supabase start` locally. `npm run db:deploy` applies everything to the stack's Postgres.
- [ ] **Step 2:** Rewrite `waitForEmail`; a throwaway script sends a sign-up through the Auth API and reads the code.
- [ ] **Step 3:** Push the branch; CI's unit job is green on the new stack (e2e stays red until Task 7).
- [ ] **Step 4: Commit** `Run the Supabase local stack in dev and CI`.

### Task 5: Supabase clients, session reading, proxy refresh

**Files:**
- Create: `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`, `src/lib/supabase/proxy-session.ts`, `src/lib/supabase/proxy-session.test.ts`, `src/lib/admin-access.test.ts` (rewrite)
- Modify: `src/lib/session.ts`, `src/lib/admin-access.ts`, `src/proxy.ts`, `src/lib/auth-context.tsx` (provider gets the user from the server layout as a prop; no client fetching at all), `src/app/layout.tsx` and `src/app/(main)/layout.tsx` (pass the session down)
- Delete (in Task 11): `src/lib/auth-client.ts`, `src/lib/auth.ts`, `src/app/api/auth/[...all]/route.ts`

**Interfaces:**
- Produces:
  - `createServerSupabase(): Promise<SupabaseClient>` — `@supabase/ssr` `createServerClient` with `cookies()`, getAll/setAll. `setAll` is wrapped in try/catch, because server components can't set cookies.
  - `supabaseAdmin(): SupabaseClient` — secret key, `auth: { persistSession: false }`, server-only (`import "server-only"`).
  - `refreshSessionCookies(request: NextRequest, response: NextResponse): Promise<void>` — called from `proxy()` for every page request, before the response is returned.
  - `type AppSession = { user: { id: string; email: string; role: string }; aal: "aal1" | "aal2"; totpVerifiedAt: number | null; createdAt: number }`
  - `getSession(): Promise<AppSession | null>` — cached per request. It uses `getClaims()`, so there's no database read; `role` comes from the `user_role` claim and defaults to `"user"`.
  - `getVerifiedSession(): Promise<AppSession | null>` — `getClaims()` plus `SELECT role FROM profile WHERE id = $sub`; returns null when no profile row exists.
  - `adminAccess(session: AppSession | null, now?: number, env?)` keeps its return values. "sign-in" means `aal !== "aal2"` or `now - totpVerifiedAt > 12h`. "setup-2fa" means ADMIN_REQUIRE_2FA is on and there's no verified TOTP factor (`aal` claim `"aal1"` with no `totp` in `amr`).
  - `requireAdmin()` and `requireUser(returnTo)` keep their signatures.

- [ ] **Step 1: Failing tests.**
  - `adminAccess`: aal2 with TOTP 11h59m ago gives "ok"; 12h01m gives "sign-in"; aal1 for staff gives "sign-in"; a non-staff role gives "not-admin".
  - `requireAdmin`: when the JWT says admin but `profile.role` is "user", it redirects to `/admin/login` (Review Focus 3).
  - `refreshSessionCookies`: when the mocked `getClaims` triggers a refresh (setAll called), the cookies are set on the response (Review Focus 2).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement.** The proxy matcher stays the same. Refresh runs only for page requests, which already go through the proxy.
- [ ] **Step 4:** PASS.
- [ ] **Step 5: Commit** `Read sessions from Supabase Auth`.

### Task 6: profile table and auth hooks (migration)

**Files:**
- Create: `supabase/migrations/20261122000000_supabase_auth.sql`, `src/lib/auth-hooks.integration.test.ts`

**Interfaces:**
- Produces, in SQL:
  - `public.profile(id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, role text NOT NULL DEFAULT 'user', "createdAt" timestamptz NOT NULL DEFAULT now())`, with RLS on.
  - An `AFTER INSERT` trigger on `auth.users` that inserts the profile row.
  - `public.custom_access_token_hook(event jsonb) RETURNS jsonb`, which adds `claims.user_role` from `profile.role`. Grant it to `supabase_auth_admin`, and revoke it from `anon`, `authenticated` and `public`.
  - `public.before_user_created_hook(event jsonb) RETURNS jsonb`, which returns an error `{"error":{"http_code":403,"message":"Public registration is currently closed."}}` when `site_setting.registrationOpen` is false.
  - (D3) `auth.sessions` `BEFORE INSERT OR UPDATE` trigger setting `ip = NULL`. If Supabase refuses DDL on `auth`, drop this statement and record that in the PR description.
- Config: register both hooks in `supabase/config.toml` (`[auth.hook.custom_access_token]`, `[auth.hook.before_user_created]`), and in the hosted dashboard (Task 11 runbook).

- [ ] **Step 1: Failing tests (local stack).**
  - A user created through the admin API gets a profile with role "user".
  - Signing in returns a JWT whose `user_role` is "user"; after `UPDATE profile SET role='admin'` and a token refresh, it's "admin".
  - With `registrationOpen = false`, sign-up fails with 403 and the exact message above.
  - After sign-in, `SELECT ip FROM auth.sessions` is NULL (skip with a comment if D3's trigger isn't allowed).
- [ ] **Step 2:** FAIL. **Step 3:** Write the migration. **Step 4:** PASS.
- [ ] **Step 5: Commit** `Add profiles and Supabase Auth hooks`.

### Task 7: Sign-up, login, email codes, password reset, Google, sign-out

**Files:**
- Create: `src/lib/auth-actions.ts` (`"use server"`), `src/lib/auth-actions.test.ts`, `src/app/auth/callback/route.ts`
- Modify: `src/app/signup/SignupForm.tsx`, `src/app/login/LoginForm.tsx`, `src/app/login/page.tsx`, `src/app/verify-email/page.tsx`, `src/app/forgot-password/page.tsx`, `src/app/reset-password/page.tsx`, `src/components/admin/Sidebar.tsx` (sign-out), `src/lib/auth-errors.ts` (new home of `authErrorMessage`, with codes mapped from Supabase's `error.code`: `invalid_credentials`, `otp_expired`, `email_not_confirmed`, `over_request_rate_limit`, `weak_password`, `user_banned`, `signup_disabled`)

**Interfaces:**
- Produces server actions. Each validates its arguments (types, lengths, email format) and returns `{ error: string }` or `{ ok: true }`:
  - `signUp(email, password, name)` — calls `auth.signUp`; the code goes out by email.
  - `verifyEmailCode(email, code)` — `verifyOtp({type:"signup"})`, which signs the user in.
  - `resendEmailCode(email)`
  - `signIn(email, password)` — returns `{ needsTwoFactor: true }` when the user has a verified TOTP factor; see Task 8.
  - `requestPasswordReset(email)` — always `{ ok: true }`, never revealing whether the account exists.
  - `resetPassword(email, code, newPassword)` — `verifyOtp({type:"recovery"})`, then `updateUser({password})`.
  - `signInWithGoogle(next: string)` — `signInWithOAuth({ provider:"google", options:{ redirectTo: <origin>/auth/callback?next=..., skipBrowserRedirect:true }})`, then `redirect(url)`.
  - `signOut()`
- `GET /auth/callback?code&next` — `exchangeCodeForSession(code)`, then redirect to `next`. `next` must be a same-site path starting with `/` and not `//`; otherwise use `/home`.

- [ ] **Step 1: Failing tests** (unit, Supabase client mocked).
  - Each action rejects bad arguments without calling Supabase.
  - `requestPasswordReset` returns ok for unknown emails.
  - The callback rejects `next=//evil.example` and redirects to `/home`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement; replace every `authClient.*` call in the listed files. **Step 4:** PASS.
- [ ] **Step 5:** e2e `auth.spec.ts` and `accounts.setup.ts` pass on the local stack (sign-up → code → signed in, wrong password, reset).
- [ ] **Step 6: Commit** `Sign up and sign in with Supabase Auth`.

### Task 8: Two-factor (TOTP) and admin login

**Files:**
- Modify: `src/components/TwoFactorEnrollment.tsx`, `src/components/TwoFactorForm.tsx`, `src/components/TwoFactorSetting.tsx`, `src/app/admin/login/AdminLoginForm.tsx`, `src/app/admin/setup-2fa/page.tsx`, `src/lib/account-actions.ts` (`disableTwoFactorAction`)
- Create: `src/lib/two-factor-actions.ts`, `src/lib/two-factor-actions.test.ts`

**Interfaces:**
- Produces:
  - `startTwoFactorEnrollment(): Promise<{ factorId: string; qrSvg: string; secret: string } | { error }>` — `mfa.enroll({ factorType:"totp", issuer:"Gayflix" })`; first removes any unverified factors.
  - `confirmTwoFactorEnrollment(factorId, code)` — `mfa.challengeAndVerify`.
  - `verifyTwoFactor(code)` — challenges the user's verified TOTP factor and raises the session to aal2.
  - `disableTwoFactorAction(password)` — keeps its current checks: password re-checked with a throwaway non-persisting client's `signInWithPassword`, and staff blocked when ADMIN_REQUIRE_2FA is on. Then `mfa.unenroll`.
- Removed (D1): backup-code UI and `generateBackupCodes`/`verifyBackupCode`. `TwoFactorSetting` tells the user to ask staff if they lose the device.

- [ ] **Step 1: Failing tests.**
  - A wrong code returns "That code isn't right. Check your authenticator app and try again."
  - `disableTwoFactorAction` with ADMIN_REQUIRE_2FA on and a staff user returns "Staff accounts keep two-factor on."
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. e2e `admin.spec.ts` login → setup-2fa → panel passes, using a TOTP generated in the test from the returned secret.
- [ ] **Step 5: Commit** `Two-factor with Supabase MFA`.

### Task 9: Account settings

**Files:**
- Modify: `src/app/(main)/account/page.tsx`, `src/app/(main)/account/setting/page.tsx`, `src/lib/account-actions.ts`

**Interfaces:**
- Produces, with password checks done as in Task 8:
  - `changePassword(current, next)`
  - `requestEmailChange(newEmail, password)` — `updateUser({ email })`; D5 applies.
  - `confirmEmailChange(newEmail, code)` — `verifyOtp({ type:"email_change" })`.
  - `listDevices(): { id, userAgent, createdAt, current }[]` — Kysely on `auth.sessions` `WHERE user_id = $sub`; `current` is the session whose `id` equals the JWT `session_id`.
  - `signOutDevice(id)` — `DELETE FROM auth.sessions WHERE id=$1 AND user_id=$sub`.
  - `signOutOtherDevices()` — `signOut({ scope:"others" })`.
  - `linkedSignInMethods(): ("email"|"google")[]` — from `auth.identities`.
  - `deleteAccount(password?)` — keeps `accountDeletionProblem()` from `src/lib/account-deletion.ts`; then `supabaseAdmin().auth.admin.deleteUser(id)` and sign out.

- [ ] **Step 1: Failing tests.**
  - `signOutDevice` with another user's session id deletes nothing.
  - `deleteAccount` refuses for an owner role with the existing message.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS, and e2e `account.spec.ts` passes.
- [ ] **Step 5: Commit** `Account settings on Supabase Auth`.

### Task 10: Admin user management

**Files:**
- Modify: `src/lib/admin-users.ts`, `src/lib/admin-user-actions.ts`, `src/app/api/admin/command-search/route.ts`, `src/lib/scheduled-jobs.ts` (user count), `src/lib/user-admin.ts` (`USER_ID` becomes the UUID pattern `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`), the admin user pages under `src/app/admin/(panel)/users/`

**Interfaces:**
- Produces:
  - User lists, search and stats come from Kysely: `auth.users u JOIN profile p ON p.id = u.id`. Columns: `u.email`, `u.email_confirmed_at`, `u.banned_until`, `u.created_at`, `u.last_sign_in_at`, `u.raw_user_meta_data->>'name'`, `p.role`.
  - `setRole(userId, role)` — `UPDATE profile`; takes effect at the user's next token refresh (at most 1h), and immediately for admin checks (Task 5).
  - `banUser(userId, reason)` — `admin.updateUserById(id, { ban_duration: "876000h" })`, plus deleting their `auth.sessions`.
  - `unbanUser(userId)` — `ban_duration: "none"`.
  - `signOutEverywhere(userId)` — `DELETE FROM auth.sessions WHERE user_id = $1`.
  - `resetTwoFactor(userId)` — `admin.mfa.deleteFactor` for each factor.
  - Every action keeps `requireAdmin()`, `canManageUsers()` and the rules in `src/lib/user-admin.ts` (who may change whom).

- [ ] **Step 1: Failing tests** (existing `admin-actions-rbac.test.ts` cases, rewritten against the new calls). A moderator can't change an owner; nobody can demote the last admin.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS, and e2e `admin-users.spec.ts` passes.
- [ ] **Step 5: Commit** `Admin user management on Supabase Auth`.

### Task 11: Move existing accounts, drop Better Auth, cutover

**Files:**
- Create: `scripts/move-accounts-to-supabase.mjs`, `supabase/migrations/20261123000000_user_ids_to_supabase.sql`, `src/lib/account-cascade.integration.test.ts`, `docs/SUPABASE_CUTOVER.md`
- Modify: `prisma/schema.prisma` (every `userId`/`actorId`/`updatedBy` becomes `String @db.Uuid`; drop the `User`, `Session`, `Account`, `Verification`, `RateLimit` and `TwoFactor` models; relations to `User` removed), then `npx prisma generate`; `src/app/privacy/page.tsx` (D3, D5); `docs/DEPLOYMENT.md` (Supabase Auth setup: Google provider, SMTP, templates, hooks, URL configuration `https://<SITE_URL>/auth/callback`); `AGENTS.md` (the Accounts bullet); `package.json` (remove `better-auth`)
- Delete: `src/lib/auth.ts`, `src/lib/auth-client.ts`, `src/app/api/auth/[...all]/route.ts`, `src/lib/email.ts` and `src/lib/email-templates.ts` (if nothing else uses them), plus their tests

**Interfaces:**
- `move-accounts-to-supabase.mjs`:
  - For every row in `"user"`: `admin.createUser({ email, email_confirm: emailVerified, user_metadata: { name } })` → new uuid. Then `UPDATE profile SET role = <old role>`, and insert `(old_id, new_id)` into `account_move`.
  - Idempotent: users already in `account_move` are skipped.
- The migration:
  - Fails with `RAISE EXCEPTION 'Run scripts/move-accounts-to-supabase.mjs first'` when `"user"` has rows missing from `account_move`.
  - Rewrites each user-id column through `account_move`, then `ALTER COLUMN ... TYPE uuid USING ...::uuid`.
  - Re-points the FKs to `auth.users(id)` (`ON DELETE CASCADE`; `report."userId"` gets `ON DELETE SET NULL`).
  - Drops `"user"`, `session`, `account`, `verification`, `"rateLimit"`, `"twoFactor"` and `account_move`.

- [ ] **Step 1: Failing integration test** (Review Focus 5). After deleting a user through the admin API, their `favorite`, `watch_history`, `media_list`, `media_rating`, `review`, `member_profile` and `profile` rows are gone, and their `report."userId"` is NULL.
- [ ] **Step 2:** FAIL. **Step 3:** Implement the script, the migration and the deletions. **Step 4:** PASS. Full e2e suite green. `npm run check` green.
- [ ] **Step 5:** Write `docs/SUPABASE_CUTOVER.md`, the runbook for production:
  1. In the Supabase dashboard:
     - Auth → Providers: Email (confirm email on), Google (client ID and secret).
     - SMTP (D5) and email templates (paste from `supabase/templates`).
     - Hooks: register both functions.
     - URL configuration: site URL and `/auth/callback`.
     - JWT Keys: asymmetric (D10).
     - MFA: TOTP on.
  2. In Vercel, add `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` (Production, Sensitive). Add the last two to the required list in `scripts/vercel-build.sh`.
  3. Turn on Maintenance Mode in the admin panel.
  4. Run `node scripts/move-accounts-to-supabase.mjs` locally, with `DIRECT_URL` and `SUPABASE_SECRET_KEY` for production.
  5. Merge PR 2. The build runs the migration.
  6. Use "Forgot password" for the owner account (D2), sign in, set up two-factor again, then turn Maintenance Mode off.
  7. Remove `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` from Vercel.
- [ ] **Step 6: Commit** `Move accounts to Supabase Auth and remove Better Auth`; push; open PR 2 with the runbook linked.

---

## Part 3 — Data modules to Kysely (one PR per task)

Every task in this part follows the same steps:
- Port each `db.*` call in the listed files to `database` (Kysely), keeping function names, arguments and return types exactly as they are, so callers don't change.
- `$transaction` becomes `database.transaction().execute(trx => ...)`.
- `$queryRaw` becomes Kysely's `sql` template with the same SQL.
- Prisma `include` becomes explicit joins, or `jsonArrayFrom`/`jsonObjectFrom` from `kysely/helpers/postgres`.
- `count`/`bigint` go through `countOf()`.
- Unit tests that mock `@/lib/db` become `*.integration.test.ts` using `withRollback`.

| Task | Files | Integration tests to add (each: name → assertion) |
|---|---|---|
| **12 Library** | `library-actions.ts`, `library.ts` | `saveProgress` updates only the caller's row; `trimHistory` keeps the newest `HISTORY_LIMIT` |
| **13 Views & ratings** | `view-actions.ts`, `rating-actions.ts`, `ratings.ts` | the second view the same day doesn't raise `viewCount`; rating twice keeps one row |
| **14 Community** | `community-actions.ts`, `community.ts`, `admin-community-actions.ts`, `report-actions.ts`, `admin-report-actions.ts` | a hidden review isn't in public reads; a duplicate report is refused |
| **15 Collections** | `admin-collection-actions.ts`, the collection reads in `catalog.ts` | an unpublished or out-of-date collection isn't listed |
| **16 Video, subtitles, episodes** | `admin-video-actions.ts`, `admin-subtitle-actions.ts`, `title-revisions.ts`, `admin-undo-actions.ts` | a source off `VIDEO_HOSTS` is refused; a subtitle for a draft title returns null |
| **17 Jobs, settings, activity** | `scheduled-jobs.ts`, `site-settings.ts`, `activity-logger.ts`, `api/cron/[job]/route.ts`, `api/admin/export/route.ts` | purge-trash deletes only rows past the window; settings fall back to `FAIL_SAFE_SETTINGS` on error |
| **18 Admin catalog & import** | `admin-catalog-actions.ts`, `admin-import-actions.ts`, `admin-imdb-batch-actions.ts`, `title-store.ts`, `admin-image-actions.ts` | creating a title with episodes is all-or-nothing (a failing episode leaves no media row) |
| **19 Public catalog** | `catalog.ts` (the 61 calls), `sitemap.ts`, `api/search/route.ts` | drafts and trashed titles never appear in public reads; `relatedRows` ranks by the same score as before (fixture of 4 titles, expected order pinned) |

Each task ends with: `grep -n "@/lib/db\"" <files>` prints nothing, `npm run check` is green, commit `Move <area> to Kysely`, push, PR.

---

## Part 4 — Remove Prisma (PR)

### Task 20: Delete Prisma

**Files:**
- Delete: `src/lib/db.ts`, `prisma/` (schema and the old migration folders, already copied in Task 1), `prisma.config.ts`, `src/generated/prisma/`
- Create: `supabase/migrations/20261201000000_drop_prisma_ledger.sql` (`DROP TABLE IF EXISTS _prisma_migrations;`)
- Modify: `package.json` (remove `prisma`, `@prisma/client`, `@prisma/adapter-pg`, `postinstall`, and the Prisma overrides), `.gitignore`, `eslint.config.mjs` ignores, `AGENTS.md`, `README.md`, `docs/DEPLOYMENT.md` (no more "Prisma"), `scripts/backfill-embeds.ts` (port or delete)

- [ ] **Step 1:** `git grep -n -i "prisma"` lists only historical docs (`docs/AUDIT_REMEDIATION_PLAN.md`).
- [ ] **Step 2:** `npm ci && npm run check` is green; e2e is green in CI.
- [ ] **Step 3: Commit** `Remove Prisma`; push; PR.
