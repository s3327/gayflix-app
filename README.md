# Gayflix

LGBTQ+ films and series, picked by the community. This is the web app:
the public site and the admin panel, deployed as one Next.js app.

**Status:** accounts are real (Better Auth on Prisma Postgres: sign-up
with an emailed code, login, password reset, Google sign-in, admin
roles), and favorites, lists, watch history and reports are stored in
the database. The catalog is still mock data (`src/lib/mock-*.ts`). See
[docs/AUDIT_REMEDIATION_PLAN.md](docs/AUDIT_REMEDIATION_PLAN.md) for what
has to change before launch.

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + TypeScript (strict)
- **Tailwind CSS 4** with the approved design tokens in `src/app/globals.css` (`@theme`)
- Fonts self-hosted with `next/font`: **Baloo 2** (display) and **Inter** (body)
- **Prisma ORM 7** on **Prisma Postgres** (any Postgres locally), through
  the `pg` driver adapter
- **Better Auth** for accounts, sessions and roles
- **Vitest** for unit tests, **Playwright** + axe for end-to-end and
  accessibility tests, **ESLint 9** (flat config) with `eslint-config-next`

## Getting started

Requires Node.js 20.19+, 22.12+ or 24+ (Prisma 7's range; CI uses 22)
and a Postgres database.

```bash
# A local Postgres, if you don't have one (Docker):
docker run -d --name gayflix-db -p 5432:5432 \
  -e POSTGRES_USER=gayflix -e POSTGRES_PASSWORD=gayflix -e POSTGRES_DB=gayflix postgres:16

npm install                  # also generates the Prisma client
cp .env.example .env.local   # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
npm run db:migrate           # creates the tables
npm run dev
```

Sign up at http://localhost:3000/signup. Without an email provider, the
verification code is printed in the `npm run dev` terminal. To make that
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
| `npm run test:e2e` | End-to-end and accessibility (axe) tests with Playwright, against the production build and the database (run `npm run build` and `npm run db:migrate` first) |
| `npm run db:migrate` | Applies migrations locally and creates new ones after a schema change (`prisma migrate dev`) |
| `npm run db:deploy` | Applies pending migrations, for production and CI (`prisma migrate deploy`) |
| `npm run make-admin -- <email> [--revoke]` | Gives an existing account the admin role, or takes it away |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, build,
the e2e + axe suite and `npm audit --omit=dev` on every push to `main` and
on every pull request. Dependabot opens weekly dependency update PRs.

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | **Required.** Postgres connection string. In production, Prisma Postgres's direct connection string. |
| `BETTER_AUTH_SECRET` | **Required.** Signs session cookies (`openssl rand -base64 32`). |
| `BETTER_AUTH_URL` | The site's public URL. Defaults to `SITE_URL` / Vercel's production domain. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in. Redirect URI: `<BETTER_AUTH_URL>/api/auth/callback/google`. |
| `RESEND_API_KEY`, `EMAIL_FROM` | **Required in production.** Sends verification codes and reset links through Resend. In development, emails print to the server console. |
| `ADMIN_BASIC_AUTH_USER`, `ADMIN_BASIC_AUTH_PASSWORD` | Optional extra password in front of `/admin`. Admin pages always need an admin account with two-factor; set both of these for a second lock, or neither. Setting only one disables the panel (503). |
| `SITE_URL` | Public origin for `sitemap.xml`, `robots.txt` and metadata URLs, read at build time. Optional on Vercel, which defaults to the production domain. |

## Deploying to Vercel

The full walkthrough, with your own domain, email, Google sign-in,
day-to-day operations and troubleshooting, is in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). In short:

1. Import the repository at [vercel.com/new](https://vercel.com/new).
2. In the project's **Storage** tab, add a Prisma Postgres database. That
   sets `DATABASE_URL` for you. (Or create one at console.prisma.io and
   add its direct `postgres://` connection string yourself.)
3. Under **Settings → Environment Variables**, add `BETTER_AUTH_SECRET`
   and `RESEND_API_KEY`, plus `EMAIL_FROM` with an address on a domain
   you've verified in Resend. Without `EMAIL_FROM`, emails come from
   Resend's test address, which only delivers to your own Resend account's
   email. Add any of the optional variables above too.
4. Deploy. `vercel.json` runs `scripts/vercel-build.sh`, which stops a
   production build if `DATABASE_URL`, `BETTER_AUTH_SECRET` or
   `RESEND_API_KEY` is missing, then applies pending migrations before
   building. Preview deploys skip both steps, since they usually share the
   production database, so a pull request that changes the schema only
   works on its preview once it's merged.
5. Sign up on the live site, then make that account an admin: run
   `npm run make-admin -- you@example.com` with `DATABASE_URL` set to the
   production connection string, or set its `role` to `admin` in the
   `user` table with Prisma Console's Studio.
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
                           (reports/ is the queue of "Report an issue" submissions)
      setup-2fa/         → where a new admin turns on two-factor
    api/auth/            → Better Auth (sign-up, sign-in, codes, reset, sessions)
    api/search/          → header search suggestions (catalog stays server-side)
    login/, signup/, verify-email/, forgot-password/, reset-password/
    robots.ts, sitemap.ts, icon.png, not-found.tsx, error.tsx
  components/            → UI components (admin/ for the panel)
  lib/                   → contexts, hooks, helpers and mock data
    auth.ts              → Better Auth config (server only)
    auth-client.ts       → browser auth calls
    session.ts           → getSession / requireUser / requireAdmin (server only)
    db.ts                → the Prisma client (server only)
    email.ts             → transactional email (Resend, or console in dev)
    library*.ts          → favorites, lists and history: loading (library.ts),
                           server functions (library-actions.ts), input checks
    report*.ts           → reports and their daily limits
  generated/prisma/      → Prisma client (generated on npm install; not committed)
prisma/                  → schema.prisma and migrations
scripts/make-admin.mjs   → grant or revoke the admin role
scripts/vercel-build.sh  → Vercel's build command: migrations, then the build
vercel.json              → points Vercel at that build command
e2e/                     → Playwright end-to-end and axe accessibility tests
next.config.mjs          → image hosts and security headers (HSTS, framing, ...)
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
- **Drafts are never public.** Listings, search and detail lookups use the
  `published*` collections.
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
- **Schema changes:** edit `prisma/schema.prisma`, run `npm run db:migrate
  -- --name <change>`, commit the migration, then `npx prisma generate`
  (Prisma 7 no longer generates on migrate). After changing Better Auth
  plugins, regenerate its models first:
  `npx auth@1.7.7 generate --config src/lib/auth.ts`.
- **Third-party origins** (CDNs, video embeds) need adding both to
  `images.remotePatterns` and to the CSP in `src/lib/csp.ts`.
- **Contrast.** Muted text uses `text-ink-muted` and pink text uses
  `text-ink-brand`; both clear WCAG AA on every background. The e2e axe
  checks fail the build on contrast regressions.

## Brand assets

`public/brand/` holds the full lockup, the icon-only "G" and the
wordmark + tagline. They're referenced by URL path, and `next/image`
serves them resized.
