# Gayflix

LGBTQ+ films and series, picked by the community. This is the web app:
the public site and the admin panel, deployed as one Next.js app.

**Status:** accounts are real (Supabase Auth: sign-up
with an emailed code, login, password reset, Google sign-in, signing
out other devices, deleting the account, admin roles), and favorites, lists, watch history and reports are stored in
the database. So is the catalog, which starts out as a sample catalog of
placeholder titles; admins add, edit, publish and remove titles and
episodes in the admin panel. See
[docs/AUDIT_REMEDIATION_PLAN.md](docs/AUDIT_REMEDIATION_PLAN.md) for what
has to change before launch.

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + TypeScript (strict)
- **Tailwind CSS 4** with the approved design tokens in `src/app/globals.css` (`@theme`)
- Fonts self-hosted with `next/font`: **Baloo 2** (display) and **Inter** (body)
- **Kysely** on **Supabase** Postgres (any Postgres locally), through
  the `pg` driver adapter
- **Supabase Auth** for accounts and sessions (called only from the
  server); roles in the site's own `profile` table
- **Vitest** for unit tests, **Playwright** + axe for end-to-end and
  accessibility tests, **ESLint 9** (flat config) with `eslint-config-next`

## Getting started

Requires Node.js 20.19+, 22.12+ or 24+ (CI uses 22)
and Docker (for Supabase's local stack: Postgres, Auth and Mailpit).

```bash
npx supabase@3.2.0 start -x studio,imgproxy,storage-api,realtime,edge-runtime,logflare,vector
npx supabase@3.2.0 status -o env   # DB_URL, API_URL, PUBLISHABLE_KEY, SECRET_KEY

npm install
cp .env.example .env.local   # set DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL,
                             # SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY
                             # from the status output (the secret key stays
                             # server-only)
npm run db:deploy            # "No pending migrations." (start applied them)
npm run dev
```

Sign up at http://localhost:3000/signup. The verification code arrives
in the local stack's Mailpit, http://127.0.0.1:54424. To make that
account an admin:

```bash
npm run make-admin -- you@example.com
```

The first time that account logs in at `/admin/login`, it sets up
two-factor sign-in with an authenticator app. After that, every admin
sign-in needs a code, and lasts 12 hours.

- Public site: http://localhost:3000 (the landing page; the app itself starts at `/home`)
- Admin panel: http://localhost:3000/admin (needs an admin account with
  two-factor; also behind an extra password when the optional
  `ADMIN_BASIC_AUTH_*` variables are set)

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve it |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generates Next's route types, then runs `tsc --noEmit` |
| `npm test` | Unit tests (Vitest) |
| `npm run check` | All of the above, in the order CI runs them |
| `npm run test:e2e` | End-to-end and accessibility (axe) tests with Playwright, against the production build and the database (run `npm run build` and `npm run db:deploy` first) |
| `npm run db:deploy` | Applies pending migrations, for production and CI |
| `npm run make-admin -- <email> [--revoke]` | Gives an existing account the admin role, or takes it away |

CI (`.github/workflows/ci.yml`) runs on every push to `main` and on every
pull request, in jobs that run side by side: lint, typecheck, unit tests
and `npm audit --omit=dev` in one, and the build plus the e2e + axe suite
split five ways (`playwright test --shard`), each with its own database
and running two tests at a time.
The build reuses the Next.js cache that the last run on `main` saved. The
`check` job passes once all of them have. Dependabot opens weekly
dependency update PRs.

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | **Required.** Postgres connection string. In production, Supabase's transaction pooler (port 6543). |
| `DIRECT_URL` | Production, for migrations: Supabase's session pooler (port 5432). Locally, leave it empty and `DATABASE_URL` is used. |
| `DATABASE_CA_CERT` | Production: Supabase's SSL certificate (PEM text), so the database's identity is verified. |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | **Required.** The Supabase project's API URL and keys, for Supabase Auth. The keys are server-only. Google sign-in, SMTP (Resend) and the email templates are set in Supabase itself (docs/DEPLOYMENT.md, Parts 4 and 8). |
| `HASH_SECRET` | **Required in production.** Keys the one-way hashes of IP addresses (views, report and sign-in limits; `openssl rand -base64 32`). |
| `ADMIN_BASIC_AUTH_USER`, `ADMIN_BASIC_AUTH_PASSWORD` | Optional extra password in front of `/admin`. Admin pages always need an admin account with two-factor; set both of these for a second lock, or neither. Setting only one disables the panel (503). |
| `SITE_URL` | Public origin for `sitemap.xml`, `robots.txt` and metadata URLs, read at build time. Optional on Vercel, which defaults to the production domain. |
| `IMAGE_HOSTS` | Optional. Hosts that posters and backdrops may come from besides `picsum.photos`, comma-separated (`images.example.com,cdn.example.org`). Read at build time, so redeploy after changing it. |
| `VIDEO_HOSTS` | Hosts that movies and episodes may play from, comma-separated; `*.` allows every subdomain (`player.example.com,*.b-cdn.net`). The admin panel only takes video links on them, and the Content-Security-Policy only loads video from them (`src/lib/video-hosts.ts`). Redeploy after changing it. Without it, no video can be added. |
| `BLOB_READ_WRITE_TOKEN` | Optional. Turns on poster and backdrop uploads in the title editor, kept in this Vercel Blob store (`src/lib/admin-image-actions.ts`). Vercel sets it when a Blob store is connected to the project; redeploy after connecting one. |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional. Sends crash reports from the server and browsers to this Sentry project, without IP addresses, cookies or form data (`src/lib/error-reporting.ts`). Read at build time; unset, the site has none of Sentry's code. |

## Deploying to Vercel

The full walkthrough, with your own domain, email, Google sign-in,
day-to-day operations and troubleshooting, is in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). In short:

1. Import the repository at [vercel.com/new](https://vercel.com/new).
2. Create a Supabase project and add its transaction pooler string as
   `DATABASE_URL`, its session pooler string as `DIRECT_URL` and its SSL
   certificate as `DATABASE_CA_CERT` (Part 3 of the walkthrough).
3. Under **Settings → Environment Variables**, add `HASH_SECRET` and
   Supabase's `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and
   `SUPABASE_SECRET_KEY`. Set up Supabase Auth in its dashboard: SMTP
   through Resend, the templates in `supabase/templates`, the two hooks,
   the redirect URL `https://<site>/auth/callback` (Part 4 of the
   walkthrough). Add any of the optional variables above too.
4. Deploy. `vercel.json` runs `scripts/vercel-build.sh`, which stops a
   production build if `DATABASE_URL`, `HASH_SECRET` or a Supabase
   variable is missing (and, on Supabase, `DIRECT_URL` or
   `DATABASE_CA_CERT`), then applies pending migrations before
   building. Preview deploys skip both steps, since they usually share the
   production database, so a pull request that changes the schema only
   works on its preview once it's merged.
5. Sign up on the live site, then make that account an admin: run
   `npm run make-admin -- you@example.com` with `DATABASE_URL` set to the
   production connection string, or set its `role` to `admin` in the
   `profile` table with Supabase's SQL Editor.
6. Log in at `/admin/login` and set up two-factor.

## Architecture

```
src/
  proxy.ts               → per-request CSP nonce on every page, plus the admin
                           optional password gate on /admin and /admin/* (noindex, no-store)
  app/
    layout.tsx           → fonts, <html>/<body>, AuthProvider; renders per
                           request so scripts get the CSP nonce
    page.tsx             → landing page (no header)
    (main)/              → the browsing app: Header, NavMenu, Footer, and the
                           Toast/Favorites/Lists/History providers (the layout
                           loads a signed-in user's library on the server)
      account/           → profile, favorites, history (the layout sends guests
                           to /login on the server)
      list/[id]/         → a shared list: anyone with the link can view it
    admin/               → admin panel (noindex; password gate re-checked in layout.tsx)
      (panel)/           → pages with the sidebar; admin role + two-factor required
                           (dashboard/ is the panel's front page: counts,
                           most played and recently added titles;
                           library/, upload/ and trash/ are the title editor;
                           reports/ is the queue of "Report an issue" submissions;
                           users/ finds accounts, sets admins, bans and signs out)
      setup-2fa/         → where a new admin turns on two-factor
    auth/callback/       → where Google sign-in comes back (Supabase Auth)
    api/search/          → header search suggestions (catalog stays server-side)
    login/, signup/, verify-email/, forgot-password/, reset-password/
    robots.ts, sitemap.ts, icon.png, not-found.tsx, error.tsx
  components/            → UI components (admin/ for the panel)
  lib/                   → contexts, hooks and helpers
    catalog.ts           → every read of titles and episodes (server only;
                           the public site only ever gets published titles)
    admin-catalog-actions.ts → the title editor's server functions; title-form.ts
                           checks their fields
    admin-user*.ts       → the Users page's reads (admin-users.ts) and server
                           functions (admin-user-actions.ts); user-admin.ts
                           holds the rules (nobody changes their own account)
    auth-actions.ts      → sign-up, sign-in and reset (Supabase Auth, server only)
    session.ts           → getSession / requireUser / requireAdmin (server only)
    database.ts          → the Kysely database client (server only)
    library*.ts          → favorites, lists and history: loading (library.ts),
                           server functions (library-actions.ts), input checks
    report*.ts           → reports and their daily limits
    view*.ts             → counting views for Trending (once per person per
                           title per day); visitor.ts hashes IPs and accounts
supabase/                → migrations (one of them loads the sample catalog),
                           the local stack's config.toml, email templates
scripts/make-admin.mjs   → grant or revoke the admin role
scripts/move-accounts-to-supabase.mjs → one-off move from Better Auth
                           (docs/SUPABASE_CUTOVER.md)
scripts/vercel-build.sh  → Vercel's build command: migrations, then the build
vercel.json              → points Vercel at that build command
e2e/                     → Playwright end-to-end, keyboard and axe accessibility tests
next.config.mjs          → image hosts (src/lib/image-hosts.mjs) and security
                           headers (HSTS, framing, ...)
docs/                    → design notes (build log) and the audit plan
```

### Conventions

- **Design tokens only.** Don't hardcode hex values; use token classes such as
  `bg-brand-pink`, `bg-bg-surface` and `text-ink-secondary`. The full table
  is in [docs/DESIGN_NOTES.md](docs/DESIGN_NOTES.md#design-tokens).
- **Links to titles** go through `titleHref()` (`src/lib/title-href.ts`),
  so episodes, movies and series always link to the right page.
- **Query params** are read through `src/lib/search-params.ts` (`pageParam`,
  `firstParam`), because a repeated key arrives as an array.
- **Drafts are never public.** Pages and routes read titles through
  `src/lib/catalog.ts`, which only returns published titles to the public
  site; drafts appear in the admin panel alone. Moving a title to the
  trash also makes it a draft, so public reads don't need to know about
  the trash. Each catalog read waits for a request (`connection()`), so a
  build never queries the database.
- **Title gradients** are stored in the database, where Tailwind can't
  see them, so `src/app/globals.css` generates every gradient stop in the
  brand and pride colors. A gradient in a new color needs adding there.
- **A user's data lives in the database.** Favorites, lists and history
  change through the server functions in `src/lib/library-actions.ts`; the
  providers update the screen first and undo it with a toast if the save
  fails. The only browser-stored state left is a guest's watch history
  (`usePersistedRecord`), which moves into the account at sign-in. State
  updaters must be pure, so fire toasts and other side effects outside them.
- **Auth checks happen on the server.** Account pages, server actions and
  API routes call `requireUser()` / `getSession()`; admin pages, actions and
  routes call `requireAdmin()` (`src/lib/session.ts`). Layouts don't run for
  server actions or `/api`, so each of those checks for itself, and
  validates its input, since anyone can call it with any arguments.
  `useAuth()` in client components is for display only.
- **Schema changes:** write a new SQL file in `supabase/migrations/`
  (a new table also enables row-level security), apply it with
  `npm run db:deploy`, then `npm run db:types`.
- **Third-party origins.** Images load through `next/image`, so a new
  image host only needs adding to `IMAGE_HOSTS` (`src/lib/image-hosts.mjs`).
  Anything the browser loads directly, such as a video embed, needs adding
  to the CSP in `src/lib/csp.ts`.
- **Contrast.** Muted text uses `text-ink-muted` and pink text uses
  `text-ink-brand`; both clear WCAG AA on every background. The e2e axe
  checks fail the build on contrast regressions.

## Brand assets

`public/brand/` holds the full lockup, the icon-only "G" and the
wordmark + tagline. They're referenced by URL path, and `next/image`
serves them resized.
