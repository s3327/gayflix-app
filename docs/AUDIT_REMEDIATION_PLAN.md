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
| H1 | Admin panel open to anyone on the admin subdomain | High | ✅ (admin role + 2FA, Phase 2) |
| H2 | Admin login form sends the password in the URL | High | ✅ |
| H3 | Login is a client-side `localStorage` flag | High | ✅ (real sessions, Phase 2) |
| M1 | Episode history links 404 | Medium | ✅ |
| M2 | Toast fired inside a state updater (double toast in dev) | Medium | ✅ |
| M3 | Toasts that don't match what happened | Medium | ✅ |
| M4 | No HTTP security headers | Medium | ✅ |
| M5 | No tests, no CI | Medium | ✅ |
| L1 | Outdated README | Low | ✅ |
| L2 | OTP autofill broken | Low | ✅ |
| L3 | Modals aren't accessible | Low | ✅ |
| L4 | Search ships the mock catalog to the browser | Low | ✅ |
| L5 | Mock dates depend on build time | Low | ✅ (catalog in the database, Phase 2) |
| L6 | No robots, favicon, 404 or error pages | Low | ✅ |
| L7 | Middleware `/admin` match too broad | Low | ✅ |
| L8 | Placeholder legal pages | Low | ⏭️ (needs legal copy) |
| L9 | Footer items that look clickable but do nothing | Low | ✅ |
| N1 | *(found while fixing)* `/search?q=a&q=b` and other repeated params | Low | ✅ |
| N2 | *(found while fixing)* No cross-tab or cross-component sync of stored state | Low | ✅ |
| N3 | *(found by axe)* Text below WCAG AA contrast; invalid ARIA on filter links; unlabeled Play button | Medium | ✅ |

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
- **Remaining dev-only advisories:** the Tailwind 4 migration (Phase 3)
  cleared Tailwind 3's `braces` and `postcss-selector-parser`. One remains:
  `braces` inside `eslint-config-next`'s copy of `fast-glob`. Every
  `braces` version is affected and there is no fix yet; it only runs when
  ESLint globs our own files and never ships. Dependabot will pick up a fix
  when one lands.

### H1. Admin access ✅ (admin role + two-factor, Phase 2)
**Decided (2026-10-10):** the admin panel lives at `domain.com/admin`, not
on an `admin.` subdomain.
- **Upside:** no extra DNS or domain setup, and the panel works on Vercel
  preview deployments.
- **Trade-off:** admin shares an origin with the public site, so a
  script-injection bug on a public page could reach admin. The CSP limits
  that, and Phase 2 adds a server-side role check on every admin page,
  action and API route.

- **Now:** an admin account with two-factor, signed in within the last 12
  hours (Phase 2, below). The Basic Auth gate described next is optional
  since then.
- **Shipped first:** an HTTP Basic Auth gate on the whole admin panel
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
  - 503 in production when unset (until Phase 2; now only when just one
    of the two is set).
  - `/administrators` is untouched.
  - Unit tests in `src/proxy.test.ts` and `src/lib/admin-auth.test.ts`.
- **Action for you:** until the Phase 2 change is merged, set both
  variables in Vercel (Production and Preview), or the admin panel will
  show "disabled". After it, they're optional.
- **Permanent fix:** Phase 2 (admin accounts with roles and two-factor).

### H2. Admin login form ✅
`src/app/admin/login/page.tsx` is now a client component. It:
- prevents the native submit;
- declares `method="post"`, so even without JavaScript the password can
  never land in the URL;
- uses proper `autoComplete` hints;
- explains that admin accounts aren't set up yet.

**Verified in a browser:** the URL stays clean after submit.

### H3. User login ✅ (real sessions, Phase 2)
- **Shipped first, as a UX guard:**
  - `/account/*` now sends guests to `/login?next=…` (`RequireLogin.tsx`),
    and login returns them to that page.
  - `?next=` is validated by `safeNextPath()`, so the login page can't be
    used as an open redirect (unit-tested against `//evil`, `/\evil`,
    tab tricks and absolute URLs).
  - Stored state now syncs across tabs, so logging out in one tab logs out
    the others.
- **Then fixed for good in Phase 2:** the `localStorage` login flag is
  gone. Accounts and sessions are real (Better Auth on the database), so
  only the right password signs in, and account pages check the session
  on the server. See
  [Shipped: accounts, sessions and admin roles](#shipped-accounts-sessions-and-admin-roles-).

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
- **CSP with a per-request nonce** (`src/lib/csp.ts`, set by `src/proxy.ts`):
  - `script-src 'self' 'nonce-…' 'strict-dynamic'`: no `'unsafe-inline'`
    for scripts, so an injected `<script>` can't run;
  - `default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`
  - `base-uri 'self'`, `form-action 'self'`, `frame-src 'none'`
  - images, fonts and connections limited to this origin
  - `style-src` keeps `'unsafe-inline'`, because React and `next/image`
    write inline `style` attributes;
  - dev adds eval and websockets for hot reload.
  - The root layout calls `connection()`, so every page renders per
    request and Next.js stamps the nonce onto its scripts.
- `next.config.mjs` sends the rest on every response:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`
- HSTS (2 years, including subdomains)

`X-Powered-By` is removed.

**Verified:**
- The e2e suite checks that every script on the page carries the nonce
  from that response's CSP, and that `script-src` has no `'unsafe-inline'`.
- Every page loads with no CSP violations in the console, and client-side
  navigation works.

### M5. Tests and CI ✅
- **Vitest** with 39 tests across 11 files, covering:
  - pagination
  - query-param parsing
  - redirect validation
  - admin auth
  - the proxy
  - link building
  - search ranking (including "drafts are never suggested")
  - NEW-badge timing
  - the CSP builder
  - the sitemap (no drafts, no private pages)
- **Playwright** (`e2e/`, `npm run test:e2e`) against the production build:
  - every public page returns 200 with no console errors;
  - the CSP nonce, the 404 page and client-side navigation;
  - header search, the guest login redirect and open-redirect blocking,
    episode history links, modal focus handling and OTP autofill;
  - the admin gate (401 without credentials, noindex, sidebar navigation,
    no password in the URL);
  - **axe** accessibility checks (WCAG 2.1 A/AA) on 10 public pages and
    3 admin pages, failing on any serious or critical violation.
- **`.github/workflows/ci.yml`** runs on every push to `main` and every PR:
  `npm ci` → lint → typecheck → unit tests → build → e2e + axe →
  `npm audit --omit=dev --audit-level=high`. Playwright traces are uploaded
  when e2e fails.
- **`npm run check`** runs lint, typecheck, unit tests and build locally.
- **Dependabot** (`.github/dependabot.yml`) opens weekly update PRs for npm
  (minor and patch grouped, majors one by one) and GitHub Actions.

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

### N3. Accessibility ✅ *(found by the axe checks)*
- **Contrast.** Three tokens moved slightly so text clears WCAG AA (4.5:1);
  approved on 2026-10-10:
  - `ink.muted` #7A7A87 → **#878794** (was 4.2:1 on cards);
  - `brand.pink` #EC008C → **#E40087** (white button text was 4.25:1);
  - new `ink.brand` **#F13DA8** for pink text on dark backgrounds (pink
    links were 4.2:1). `brand.pink.light` stays the hover shade.
- **ARIA.** Filter chips that are links now use `aria-current` instead of
  `aria-pressed`, which isn't allowed on links.
- **Play button** on the watch page now has an accessible name.
- **Known gap:** white text on the pink *hover* fill (`brand.pink.light`)
  is 2.8:1 while hovered. axe doesn't test hover states; worth revisiting
  with the design tokens.

---

## Phase 2: real accounts on Prisma Postgres

This is the permanent fix for H1 and H3. It should be done before any real
user data or content management goes live.

### Shipped: accounts, sessions and admin roles ✅
- **Prisma 7.10.0** (pinned) with `prisma.config.ts`, the `prisma-client`
  generator (output `src/generated/prisma`, not committed; `postinstall`
  generates it) and the `@prisma/adapter-pg` driver adapter, which works
  with Prisma Postgres's direct connection string and with any local
  Postgres. One shared client in `src/lib/db.ts`. First migration:
  `prisma/migrations/*_accounts`.
- **Better Auth 1.7.7** (`src/lib/auth.ts`, served at `/api/auth/*`):
  - email + password (scrypt hashes, 8+ characters);
  - email confirmed by a 6-digit code before the first session (codes are
    stored hashed, expire in 10 minutes, 5 attempts);
  - password reset by emailed link (`/reset-password`), which signs out
    every other session;
  - Google sign-in once `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are set;
  - sessions in the database behind an `httpOnly`, `SameSite=Lax` cookie
    (`Secure` on https), 30-day expiry refreshed daily;
  - rate limits stored in the database, so they hold across serverless
    instances (sign-in: 3 tries per 10 seconds per IP);
  - cross-origin auth requests are rejected (Better Auth's origin check).
- **Email** (`src/lib/email.ts`): Resend over HTTP when `RESEND_API_KEY`
  is set; printed to the console in development; an error in production
  without a provider. Sent after the response, so timing can't reveal
  whether an account exists.
- **Server-side checks** (`src/lib/session.ts`):
  - the account layout sends guests to `/login?next=…` before rendering;
  - the admin panel layout requires the "admin" role (`requireAdmin()`);
  - `useAuth()` now reads the real session; nothing about login is stored
    in `localStorage`.
- **Profile editing** on `/account` is real: display name, email change
  (a code goes to the new address; nothing changes until it's entered)
  and password change (needs the current password; signs out other
  devices).
- **Admins** are regular accounts with the "admin" role:
  `npm run make-admin -- <email>` (or `--revoke`). See "Shipped: admin
  two-factor" below for what the panel requires now.
- **Verified:**
  - e2e against a real Postgres (CI runs one as a service): sign-up with a
    wrong and then a right code, logout, wrong password, unverified login,
    password reset by link, identical answers for unknown emails, profile
    edits (name, email by code, password), guests and regular users kept
    out of admin, admin login and navigation;
  - checked by hand: sign-in rate limit returns 429 after 3 tries, the
    session cookie is `HttpOnly; SameSite=Lax`, a sign-in from another
    origin gets 403, passwords and codes are stored hashed.

### Shipped: favorites, lists, history and reports in the database ✅
This is step 7 below. Second migration: `prisma/migrations/*_library`.
- **Favorites, lists and watch history** belong to the account
  (`Favorite`, `MediaList`, `ListItem`, `WatchHistory`). The `(main)`
  layout loads them on the server, so pages render with them; changes
  show at once and are undone with a toast if the server rejects them.
- **Server functions** (`src/lib/library-actions.ts`) check the session
  and validate every input themselves; list changes also check that the
  list belongs to the caller. Title snapshots are whitelisted
  (`parseEntry`): slug ids, https or same-site posters, gradient stops
  only, since shared lists show one user's data to others.
- **History** keeps the newest 200 titles per account. A guest's history
  stays in the browser and moves into the account at the next sign-in.
- **Shared list links work for anyone:** `/list/[id]` loads the list on
  the server (ids are random UUIDs; still `noindex`). Visitors get a
  read-only view; the owner can remove titles.
- **Reports** are saved with the reason and details (`Report`). The daily
  limit is enforced on the server: 5 a day per account, 1 a day per IP
  for guests, resetting at midnight UTC. The IP is stored only as a keyed
  hash. A per-reporter Postgres lock stops parallel requests from
  slipping past the limit (checked by hand: 8 at once, 1 accepted).
- **Report queue** at `/admin/reports`: open and resolved tabs, newest
  first, with the title, reason, details, reporter (account email or
  "Guest") and time. Resolve and reopen are server functions that call
  `requireAdmin()` themselves and record which admin closed the report.
- **Verified:** e2e tests for favorites and lists across two devices, a
  guest viewing a shared list read-only, guest history moving into an
  account, both report limits, and an admin resolving and reopening a
  guest's report (plus an axe check of the queue); unit tests for the
  input checks.

### Shipped: admin two-factor and a 12-hour admin sign-in ✅
Third migration: `prisma/migrations/*_two_factor`.
- **Two-factor sign-in** with an authenticator app (Better Auth's
  `twoFactor` plugin: TOTP, plus 10 single-use backup codes; secrets and
  backup codes are stored encrypted). After the password, `/login` and
  `/admin/login` ask for the code; devices are never remembered.
  Ten wrong codes lock two-factor sign-in for 15 minutes.
- **Admins must use it.** A new admin's first login goes to
  `/admin/setup-2fa` (confirm password, scan the QR code, save the backup
  codes, enter the first code). The panel stays closed until that's done.
- **The panel only accepts a session that passed two-factor in the last
  12 hours** (`adminAccess()` in `src/lib/admin-access.ts`, used by
  `requireAdmin()`). Each session records whether it was created by the
  two-factor step (`session.twoFactorVerified`, set by a database hook in
  `src/lib/auth.ts`), so a session from Google sign-in, email
  verification or impersonation never opens the panel, even for an admin.
  The public site keeps its 30-day session.
- **Better Auth's own admin endpoints** (`/api/auth/admin/*`: list users,
  set roles, impersonate) get the same check, through a request hook.
- **Code-based sign-in and code-based password reset are turned off**
  (`disabledPaths`): the UI never used them, and code sign-in would have
  skipped two-factor.
- **The Basic Auth gate is now optional.** Set both
  `ADMIN_BASIC_AUTH_USER` and `ADMIN_BASIC_AUTH_PASSWORD` for a second
  lock in front of the login page, or neither. Only one set still fails
  closed (503).
- **Verified:** e2e tests for first-login setup (wrong password, then the
  QR flow, with an axe check), sign-in with a wrong and then a right
  code, a backup code working once on `/login`, the 12-hour expiry, and a
  session without two-factor being refused by the panel and the admin
  API (403); unit tests for `adminAccess()` and the optional gate.

### Shipped: the catalog in the database ✅
Migrations: `prisma/migrations/*_catalog` (the tables) and
`*_catalog_sample_data` (the sample catalog).
- **`Media` and `Episode`** (`media`, `episode`): a title's type and
  draft/published status, what cards show, the detail fields (genres,
  cast, director or creator, tags, rating, release date, runtime), the
  poster, backdrop and gradient, a `featured` flag for the home hero and a
  `viewCount` for Trending. Episodes belong to a series and are deleted
  with it.
- **The sample catalog** is loaded by a data migration, so every
  environment, production included, starts with the titles the mock files
  had: 292 titles (244 published, 48 drafts) and 32 episodes. Its dates
  are set relative to when the migration runs, and the home page rows come
  out as they were. This also ends the build-time date drift (L5).
- **One data layer**, `src/lib/catalog.ts`. Every page and route, the
  sitemap and reports read titles there. Public reads only return
  published titles: a draft's page, watch page and episodes are 404s, and
  drafts stay out of listings, search, suggestions and the sitemap. The
  admin library's read is the only one that includes drafts, and it calls
  `requireAdmin()` itself.
- **The database does the work:** listings and filters are SQL with
  `count` and `skip`/`take`, the filter chips are the values published
  titles have, and search is one query (title, synopsis, country, genre,
  or the year) with title matches first. Search text is escaped, so `%`
  and `_` match themselves (Prisma's `contains` doesn't escape them).
- **Nothing reads the catalog at build time.** Every read first waits for
  a request (`connection()`), so builds work without a database: CI
  builds before it migrates, and preview deploys skip migrations.
- **One layout for title pages** (`TitleDetail`), for movies and series,
  showing only the details a title has. The gradient-only pages and the
  "basic" fallback page are gone. An id under the wrong type
  (`/series/<a movie>`) redirects to the right page, and `/watch/<a
  series>` opens its first episode.
- **Reports** look the title up in the database: a published title, or
  "Series: Episode" for an episode of one.
- **Admin library** (`/admin/library/movies` and `/series`): every title,
  drafts included, newest first, 50 per page, with a working title search
  and status filter. Seasons and episodes are counted from the episodes.
- **Removed:** `mock-titles.ts`, `mock-media.ts`, `mock-trending.ts`,
  `mock-movie-details.ts`, `mock-series-details.ts`, `mock-library.ts`,
  `find-basic-title.ts` and `BasicTitleFallback.tsx`.
- **Verified:**
  - new e2e tests: drafts are 404s and stay out of search and the
    sitemap; a title appears when it's published and disappears when it's
    unpublished; the wrong-type and series-on-`/watch` redirects;
    suggestion order and `%` in a query; search paging; the admin
    library's search and status filter;
  - every existing page, library, report and axe test passes against the
    database catalog;
  - a build against a database without the catalog tables succeeds, and
    the migrations apply to an empty database;
  - unit tests for query clean-up, LIKE escaping and the page math.

### Shipped: the admin title editor ✅
Migration: `prisma/migrations/*_media_trash` (a `trashedAt` column).
- **Titles:** Upload → Movies and Upload → Series add a title, as a draft
  unless its status is set to Published; clicking a title in the library
  opens its edit page, with every field the title pages show. A title's
  address is made from its title when it's added (unique among titles
  and episodes) and never changes, so links and saved favorites keep
  working.
- **The library's buttons work:** edit, publish or unpublish, and move to
  trash on each row, and Publish, Unpublish and Move to trash for the
  ticked rows.
- **Trash** (`/admin/trash`): moving a title to the trash also makes it a
  draft and stops it being featured, so the public site drops it without
  any change to its reads. Restore brings it back as a draft; Delete for
  good is only offered there, and takes the title's episodes with it.
- **Episodes:** added from a series' page or Upload → Episodes (the form
  stays open for the next one), listed in Library → Episodes by series,
  and edited or deleted (after a confirmation) on their own page. A
  series' card shows the seasons it has episodes in, recalculated
  whenever its episodes change; a movie's comes from its runtime.
- **One featured title:** featuring a title unfeatures the previous one.
- **Server-side checks:** every change goes through the server functions
  in `src/lib/admin-catalog-actions.ts`. Each calls `requireAdmin()`
  itself and checks every field (`src/lib/title-form.ts`) and every id
  the page bound to it. A form with problems comes back with the fields
  marked and what was typed kept, and focus on the first field to fix.
- **Images are links, not uploads.** They must be `https` and on an
  allowed host: the sample catalog's `picsum.photos`, plus any listed in
  the `IMAGE_HOSTS` setting (`src/lib/image-hosts.mjs`). The same list
  feeds `next/image`, so a saved image always displays.
- **Verified:**
  - new e2e tests: add a movie as a draft (a 404 on the site), publish it
    and rename it, the row buttons, trash, restore and delete for good;
    an image on a host that isn't allowed is refused with the typed
    values kept; a series with episodes, the next-episode form, a
    duplicate episode number, moving an episode to another season and
    deleting one; bulk publish and trash on the ticked rows only; the
    wrong-type redirect and the not-found page;
  - axe checks on the new admin pages;
  - unit tests for the field checks, durations, addresses and image
    hosts.

### Shipped: viewing data ✅
Migration: `prisma/migrations/*_media_views` (a `media_view` table; it
also resets the sample catalog's made-up view counts to zero).
- **Views are counted.** Pressing Play counts a view for the title: the
  movie, or the series an episode belongs to. Each viewer counts once per
  title per UTC day, a signed-in user by account and a guest by IP
  address (`src/lib/views.ts`, `src/lib/view-actions.ts`). Only published
  titles count, whatever id the browser sends.
- **Private by design:** a view row holds a keyed hash of the account or
  IP address that changes every day, never the address itself, so rows
  can't be traced to a person or linked across days. Rows older than
  Trending's window are deleted, at most once an hour per server and
  after the response has been sent.
- **Trending** (`/trending` and the home page's Trending Now) ranks
  published titles by their views in the last 7 days, today included;
  ties go to the most viewed of all time (`viewCount`, now real). Titles
  nobody played that week aren't listed, so Trending starts empty and
  fills as people watch.
- **Continue Watching** on the home page shows the titles a signed-in
  user played last, newest first, from their watch history: one card per
  title, with a series at the episode played last, and only titles still
  published. Guests don't get the row; their history stays in the
  browser until they sign in, as before. The sample data
  (`mock-continue-watching.ts`) and the made-up progress bars are gone:
  the player doesn't report progress yet.
- **Verified:**
  - new e2e tests: replaying a title the same day counts once, another
    IP address counts again, an episode counts for its series, and the
    rows hold hashes; a title with this week's views tops `/trending` and
    Trending Now while one with only older views isn't listed; Continue
    Watching shows nothing for a guest or a new account, then the latest
    titles in order with one card per series, leaves out an unpublished
    title, passes an axe check and links back to the episode;
  - unit tests for the day math and the viewer keys; pruning checked by
    hand.

### Still to do
- **Image uploads:** posters and backdrops are links for now. Uploading
  files needs a storage service such as Vercel Blob.
- **Playback progress:** Continue Watching can't show how far someone got
  until the player has a real video source that reports it.

### Original plan

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
   - real email/password with hashing (Better Auth uses scrypt, which is
     also memory-hard);
   - real email verification codes: single use, expiring, with resend
     limited on the server;
   - Google OAuth;
   - password reset tokens;
   - login rate limiting and lockout.
5. **Admin auth:**
   - admin accounts with roles (e.g. `editor` and `admin`) and 2FA;
   - remove the Basic Auth gate only once this is live;
   - keep the proxy's `/admin` check as the first lock, in front of the
     role check.
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

- ✅ **Nonce-based CSP.** Shipped; see M4.
- ✅ **E2E tests in CI** with Playwright. Shipped; see M5.
- ✅ **Dependency hygiene.** Dependabot shipped; see M5. CI fails on high
  or critical production advisories.
- **Video embeds.** When a player provider is chosen, add its origin to
  `frame-src` (and `media-src` if streaming directly), and use `sandbox`
  on the iframe.
- ✅ **Tailwind 4 migration** (`tailwindcss` 4.3.3, `@tailwindcss/postcss`):
  - Tokens moved from `tailwind.config.ts` to the `@theme` block in
    `src/app/globals.css`, with their comments. Autoprefixer was dropped
    (Tailwind 4 handles prefixes).
  - Class renames came from the official upgrade tool (`outline-none` →
    `outline-hidden`, `bg-gradient-to-*` → `bg-linear-to-*`, `rounded` →
    `rounded-sm`, `backdrop-blur` → `backdrop-blur-sm` and so on).
  - v3 behaviour kept on purpose: borders default to `border-subtle`,
    buttons keep the pointer cursor, and the home hero title keeps its
    line height.
  - **Verified:** before/after screenshots of 31 pages at desktop and
    mobile sizes are pixel-identical apart from one intended change.
    Placeholder gradients defined in the mock data (`src/lib/`) now
    render; Tailwind 3 never scanned `src/lib`, so they were silently
    missing. The e2e and axe suite passes, and `npm audit` lists only the
    ESLint `braces` advisory above.
- **Monitoring.** Error reporting such as Sentry, wired into `error.tsx`
  and route handlers.

## Phase 4: before launch

- **L8. Legal copy.** Terms, Privacy and a Cookie Policy written or
  reviewed by a lawyer. Sign-up already requires agreeing to them.
  Consider a cookie banner if analytics or ads are added; the Ads settings
  tab suggests they will be.
- ✅ **L5. Mock data.** The catalog is in the database (Phase 2), and the
  sample catalog's dates are set when its migration runs, so nothing
  depends on build time anymore.
- ✅ **Sitemap.** `src/app/sitemap.ts` lists the public pages and every
  published title, and `robots.txt` points to it. It reads the published
  titles from the database on each request. Set `SITE_URL` to the
  production domain (on Vercel it defaults to the project's production
  domain).
- 🟡 **Accessibility pass.** axe runs in CI (see M5 and N3). Still to do:
  a keyboard-only walkthrough of the drawer, carousels and the player.

## How to verify locally

```bash
npm ci
npm run check            # lint, typecheck, unit tests, build
npm run test:e2e         # Playwright + axe against the build
npm audit --omit=dev     # expect: found 0 vulnerabilities
```

Optional admin gate:

```bash
ADMIN_BASIC_AUTH_USER=admin ADMIN_BASIC_AUTH_PASSWORD=secret npm start
# then open http://localhost:3000/admin
```

You should get a password prompt. Without the variables there is no
prompt, and `/admin` goes to the admin login.
