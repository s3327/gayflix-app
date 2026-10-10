# Audit remediation plan

**Audit:** 2026-10-10. The full report is in the project files
(`audits/gayflix-audit-2026-10-10.md`).
**Baseline:** commit `013bf3d`, the scaffold on Next.js 14.2.5.

This plan covers every finding from the audit. For each one it gives the
fix, its status, and how the fix was verified. Most findings are fixed in
the same change that adds this document. The few that can't be finished
without a backend or a legal or product decision are written as phased
work with clear exit criteria.

**Legend:**
- ✅ fixed in this change
- 🟡 interim fix shipped, permanent fix planned
- ⏭️ planned, needs a decision or a backend

## Status at a glance

| ID | Finding | Severity | Status |
|---|---|---|---|
| C1 | Next.js 14.2.5 with 30+ advisories (incl. middleware bypass, RCE) | Critical | ✅ |
| H1 | Admin panel open to anyone on the admin subdomain | High | 🟡 |
| H2 | Admin login form sends the password in the URL | High | ✅ |
| H3 | Login is a client-side `localStorage` flag | High | 🟡 |
| M1 | Episode history links 404 | Medium | ✅ |
| M2 | Toast fired inside a state updater (double toast in dev) | Medium | ✅ |
| M3 | Toasts that don't match what happened | Medium | ✅ |
| M4 | No HTTP security headers | Medium | ✅ |
| M5 | No tests, no CI | Medium | ✅ |
| L1 | Outdated README | Low | ✅ |
| L2 | OTP autofill broken | Low | ✅ |
| L3 | Modals aren't accessible | Low | ✅ |
| L4 | Search ships the mock catalog to the browser | Low | ✅ |
| L5 | Mock dates depend on build time | Low | ⏭️ (goes away with real data) |
| L6 | No robots, favicon, 404 or error pages | Low | ✅ |
| L7 | Middleware `/admin` match too broad | Low | ✅ |
| L8 | Placeholder legal pages | Low | ⏭️ (needs legal copy) |
| L9 | Footer items that look clickable but do nothing | Low | ✅ |
| N1 | *(found while fixing)* `/search?q=a&q=b` and other repeated params | Low | ✅ |
| N2 | *(found while fixing)* No cross-tab or cross-component sync of stored state | Low | ✅ |

---

## Phase 1: shipped in this change

### C1. Framework upgrade ✅
- **What changed:**
  - `next` 14.2.5 → **16.3.8**
  - `react` / `react-dom` 18.3.1 → **19.2.8**
  - `@types/react*`, `typescript` 5.9.3, `postcss` 8.5.29 and `tailwindcss` 3.4.19 bumped to match
  - `eslint` 8 → 9 with flat config (`eslint.config.mjs`), because `next lint` was removed in Next 16
- **Why 16 and not the latest 14.2.x:** 14.2.35 still carries an unpatched
  critical advisory (Image Optimization RCE, GHSA-2xp9-vwfh-vxw4). 15.5.x
  still bundles a vulnerable PostCSS. 16.3.8 is the newest patch release on
  a line that `npm audit` reports clean.
- **Migration work:**
  - `params` and `searchParams` are now Promises: 14 route files were updated.
  - `src/middleware.ts` became `src/proxy.ts`.
  - The client list page now reads its id with `useParams()`.
  - The new React Compiler lint rules flagged `setState` inside effects in
    five places. Each was rewritten with the pattern React recommends,
    not suppressed.
- **Verified:**
  - `npm audit --omit=dev` reports **0 vulnerabilities**.
  - Build, typecheck, lint and tests are green.
  - Every page was loaded in a real browser with no console or hydration errors.
- **Remaining dev-only advisories:** `braces` (Tailwind 3's file watcher)
  and `postcss-selector-parser` (Tailwind 3). They run only at build time on
  our own files and never ship. They clear with the Tailwind 4 migration in
  Phase 3.

### H1. Admin access 🟡 (interim gate shipped)
**Decided (2026-10-10):** the admin panel lives at `domain.com/admin`, not
on an `admin.` subdomain.
- **Upside:** no extra DNS or domain setup, and the panel works on Vercel
  preview deployments.
- **Trade-off:** admin shares an origin with the public site, so a
  script-injection bug on a public page could reach admin. The CSP limits
  that, and Phase 2 adds a server-side role check on every admin page,
  action and API route.

- **Shipped:** an HTTP Basic Auth gate on the whole admin panel
  (`src/lib/admin-auth.ts`):
  - It is checked in `src/proxy.ts` and again in `src/app/admin/layout.tsx`
    as a second lock.
  - Credentials come from `ADMIN_BASIC_AUTH_USER` / `ADMIN_BASIC_AUTH_PASSWORD`.
  - The comparison runs in constant time and supports UTF-8.
  - **It fails closed:** in production with no credentials set, the panel
    returns 503.
  - Dev with no credentials stays open, so `localhost:3000/admin` still
    works out of the box.
  - Admin responses carry `X-Robots-Tag: noindex` and robots metadata.
  - The `/admin` path match is now exact (`/admin` or `/admin/…`).
- **Verified:**
  - 401 without credentials or with wrong ones.
  - 200 with the right ones.
  - 503 in production when unset.
  - `/administrators` is untouched.
  - Unit tests in `src/proxy.test.ts` and `src/lib/admin-auth.test.ts`.
- **Action for you:** set both variables in Vercel (Production and Preview)
  before the next deploy, or the admin panel will show "disabled".
- **Permanent fix:** Phase 2 (real admin accounts with roles).

### H2. Admin login form ✅
`src/app/admin/login/page.tsx` is now a client component. It:
- prevents the native submit;
- declares `method="post"`, so even without JavaScript the password can
  never land in the URL;
- uses proper `autoComplete` hints;
- explains that admin accounts aren't set up yet.

**Verified in a browser:** the URL stays clean after submit.

### H3. User login 🟡 (UX guard shipped)
- **Shipped:**
  - `/account/*` now sends guests to `/login?next=…` (`RequireLogin.tsx`),
    and login returns them to that page.
  - `?next=` is validated by `safeNextPath()`, so the login page can't be
    used as an open redirect (unit-tested against `//evil`, `/\evil`,
    tab tricks and absolute URLs).
  - Stored state now syncs across tabs, so logging out in one tab logs out
    the others.
- **Still true:** the login flag lives in `localStorage` and any password
  works. This is a UX layer only.
- **Permanent fix:** Phase 2.

### M1. Episode history links ✅
- History entries recorded on `/episode/[id]` now carry `kind: "episode"`.
- Every card links through one helper, `titleHref()`, which sends episodes
  to `/episode/[id]`.
- The cards updated are MediaCard, PosterCard, FavoriteCard, HistoryCard,
  list items, search suggestions and the hero.

**Verified:** browser test plus unit test.

### M2 / M3. Toasts and pure updaters ✅
- `deleteList` now toasts outside the updater.
- `addToList` says "Already in …" instead of falsely saying "Added".
- `toggleFavorite` decides add or remove once, so the toast and the stored
  result always agree.

### M4. Security headers ✅
`next.config.mjs` now sends these on every response:
- CSP:
  - `default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`
  - `base-uri 'self'`, `form-action 'self'`, `frame-src 'none'`
  - images, fonts and connections limited to this origin
  - dev adds eval and websockets for hot reload
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`
- HSTS (2 years, including subdomains)

`X-Powered-By` is removed.

**Verified:** no CSP violations on any page in the production or dev build.
**Planned:** nonce-based CSP, to drop `'unsafe-inline'` for scripts (Phase 3).

### M5. Tests and CI ✅
- **Vitest** with 26 tests across 8 files, covering:
  - pagination
  - query-param parsing
  - redirect validation
  - admin auth
  - the proxy
  - link building
  - search ranking (including "drafts are never suggested")
  - NEW-badge timing
- **`.github/workflows/ci.yml`** runs on every push to `main` and every PR:
  `npm ci` → lint → typecheck → test → build → `npm audit --omit=dev --audit-level=high`.
- **`npm run check`** runs the same sequence locally.

### L1. README ✅
The README was rewritten to cover setup, scripts, environment variables,
architecture and conventions. The old README, which is a valuable build
log, moved to `docs/DESIGN_NOTES.md` with a note on what it describes
that has since changed.

### L2. OTP autofill ✅
`OtpInput` now spreads multi-digit input across the boxes, so SMS and
password-manager autofill work. A box's contents are selected on focus,
so typing replaces the digit.

**Verified in a browser:** filling box 1 with `123456` fills all six.

### L3. Modal accessibility ✅
`Modal` now:
- traps Tab and Shift+Tab inside the dialog;
- focuses the first field;
- locks page scroll;
- returns focus to the button that opened it.

**Verified in a browser.**

### L4. Search API ✅
Header suggestions now come from `GET /api/search?q=` (`src/lib/search.ts`):
- requests are debounced and abortable;
- a stale response can never overwrite a newer query;
- each result carries only the fields the dropdown needs.

**Verified:** the client bundle no longer contains the catalog.

### L6. Robots, icon, 404, error ✅
Added:
- `robots.ts`, which disallows account, auth, list and API paths;
- `icon.png`, a 192px favicon;
- branded `not-found.tsx` and `error.tsx` pages.

### L7. Admin path match ✅
Covered under H1.

### L9. Footer ✅
Correction to the audit: Terms and Privacy were already linked. The four
items with no page (About, Careers, Contact, Cookie Policy) were buttons
that did nothing. They're now plain text marked "(coming soon)".

### N1. Repeated query params ✅ *(found during the fix)*
A key repeated in the URL arrives as an array, which broke `.trim()` on
`/search?q=a&q=b`. All pages now read params through `firstParam()` and
`pageParam()`. `pageParam` also rejects `0`, negatives and decimals.

### N2. Stored-state sync ✅ *(found during the fix)*
`usePersistedState` now uses `useSyncExternalStore`. Every component
reading a key sees the same value, other tabs' changes arrive live, and
there's no load-then-save effect cascade on mount.

---

## Phase 2: real accounts on Prisma Postgres

This is the permanent fix for H1 and H3. It should be done before any real
user data or content management goes live.

**Decided (2026-10-10):** the database is **Prisma Postgres**, accessed
through **Prisma ORM**.

1. **Set up Prisma:**
   - **Pin Prisma ORM 7.x** (`prisma` and `@prisma/client` 7.10.0). npm's
     `latest` tag currently points at an 8.0 release candidate, so a bare
     `npm install prisma` would pull a pre-release.
   - **Raise `engines.node`** in `package.json` to Prisma 7's requirement:
     `^20.19 || ^22.12 || >=24`.
   - **Connect with a driver adapter:** `@prisma/adapter-ppg` (Prisma
     Postgres's serverless driver over HTTP/WebSocket, a good fit for
     Vercel functions) or `@prisma/adapter-pg` over direct TCP.
   - **Keep configuration in `prisma.config.ts`** and the connection string
     in env vars. Add the env vars to `.env.example`, Vercel, and CI if a
     test database is used.
   - **Create one shared client** in `src/lib/db.ts`, reused across hot
     reloads in dev, and import it only from server code. Next already
     treats `prisma` / `@prisma/client` as server-external packages.
   - **Add `prisma generate` to `postinstall` or to the build**, and run
     `prisma migrate deploy` as a deploy step. Never run `migrate dev`
     against production.
   - **First schema:**
     - `User`, `Session`, `Account` and `Verification`. Generate these from
       the auth library rather than writing them by hand.
     - `Media` (movie/series, with `status` draft/published, `createdAt`
       and `updatedAt`) and `Episode`, modelled on `src/lib/media.ts`.
     - `Favorite`, `List`, `ListItem`, `WatchHistory` and `Report`.
     - `AdminRole` on `User`, or a role enum.
   - **Seed** from the current mock generators, so every page keeps
     working while the queries are swapped in.
2. **Pick the auth library:** Better Auth (it ships a Prisma adapter,
   `better-auth/adapters/prisma`, and a Next.js integration) or Auth.js
   (`@auth/prisma-adapter`). I recommend Better Auth, which the design
   notes already name. Its roles/admin plugin also covers step 5.
3. **Sessions:**
   - server-side sessions in `httpOnly`, `Secure`, `SameSite=Lax` cookies;
   - admin sessions kept separate from user sessions (shorter lifetime,
     `Path=/admin` cookie or a role claim checked on every admin request);
   - no auth state in `localStorage`.
4. **User auth:**
   - real email/password with hashing (argon2id or bcrypt);
   - real email verification codes: single use, expiring, with resend
     limited on the server;
   - Google OAuth;
   - password reset tokens;
   - login rate limiting and lockout.
5. **Admin auth:**
   - admin accounts with roles (e.g. `editor` and `admin`) and 2FA;
   - remove the Basic Auth gate only once this is live;
   - keep the proxy's host split.
6. **Authorization in a data access layer:**
   - every server read or write checks the session, including pages,
     server actions and `/api` routes;
   - the account and admin layouts read the session server-side;
   - `RequireLogin` stays only as a no-flash UX layer.
7. **Move browser state to the server:** favorites, lists (which makes
   shared list links work across devices), history and the report limits.
   Report limits must be enforced per account and per IP on the server.
8. **CSRF:** server actions are covered by Next's origin check. Any custom
   POST route checks `Origin`.

**Exit criteria:**
- no `localStorage` auth;
- admin requires an admin role;
- every mutation is authorized server-side;
- e2e tests cover login, logout and the role checks.

## Phase 3: hardening and tooling

- **Nonce-based CSP.** Drop `'unsafe-inline'` from `script-src`: the proxy
  generates a nonce per request, and the root layout reads it from headers.
- **Video embeds.** When a player provider is chosen, add its origin to
  `frame-src` (and `media-src` if streaming directly), and use `sandbox`
  on the iframe.
- **Tailwind 4 migration.** Move the tokens to CSS `@theme` (or use
  `@config` for a smaller first step). This clears the remaining dev-only
  audit findings.
- **E2E tests in CI** with Playwright, covering the flows this change
  checked by hand: search, the login redirect, episode history, modal
  focus and the admin gate.
- **Dependency hygiene.** Dependabot or Renovate for weekly updates. CI
  already fails on high or critical production advisories.
- **Monitoring.** Error reporting such as Sentry, wired into `error.tsx`
  and route handlers.

## Phase 4: before launch

- **L8. Legal copy.** Terms, Privacy and a Cookie Policy written or
  reviewed by a lawyer. Sign-up already requires agreeing to them.
  Consider a cookie banner if analytics or ads are added; the Ads settings
  tab suggests they will be.
- **L5. Mock data.** Replacing the mock catalog with Prisma queries
  removes the build-time date drift. No interim change is worth making.
- **Sitemap** (`app/sitemap.ts`) generated from the real catalog.
- **Accessibility pass** with axe in CI, plus a keyboard-only walkthrough
  of the drawer, carousels and the player.

## How to verify locally

```bash
npm ci
npm run check            # lint, typecheck, test, build
npm audit --omit=dev     # expect: found 0 vulnerabilities
```

Admin gate:

```bash
ADMIN_BASIC_AUTH_USER=admin ADMIN_BASIC_AUTH_PASSWORD=secret npm start
# then open http://localhost:3000/admin
```

You should get a password prompt. Without the variables, the production
build answers 503.
