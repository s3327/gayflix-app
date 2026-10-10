# Gayflix

LGBTQ+ films and series, picked by the community. This is the web app:
the public site and the admin panel, deployed as one Next.js app.

**Status: UI phase.** Every page is built, but there's no backend yet.
Catalog data is mock data (`src/lib/mock-*.ts`), and login, favorites,
lists, history and report limits live in the browser's `localStorage`.
See [docs/AUDIT_REMEDIATION_PLAN.md](docs/AUDIT_REMEDIATION_PLAN.md) for
what has to change before launch.

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + TypeScript (strict)
- **Tailwind CSS 3** with the approved design tokens in `tailwind.config.ts`
- Fonts self-hosted with `next/font`: **Baloo 2** (display) and **Inter** (body)
- **Vitest** for unit tests, **ESLint 9** (flat config) with `eslint-config-next`

## Getting started

Requires Node.js 20.9 or newer (CI uses 22).

```bash
npm install
cp .env.example .env.local   # optional; only needed to test the admin password gate
npm run dev
```

- Public site: http://localhost:3000 (the landing page; the app itself starts at `/home`)
- Admin panel: http://admin.localhost:3000/admin/dashboard (browsers resolve
  `*.localhost` to your machine, so no hosts-file edits are needed)

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve it |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generates Next's route types, then runs `tsc --noEmit` |
| `npm test` | Unit tests (Vitest) |
| `npm run check` | All of the above, in the order CI runs them |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests, build and
`npm audit --omit=dev` on every push to `main` and on every pull request.

## Environment variables

| Variable | Purpose |
|---|---|
| `ADMIN_BASIC_AUTH_USER`, `ADMIN_BASIC_AUTH_PASSWORD` | Password gate for the admin subdomain. **Required in production**: without them the admin panel answers 503. In development, leaving them unset keeps the panel open. |

On Vercel, set these under Project → Settings → Environment Variables,
and add `admin.<your-domain>` as a domain on the same project.

## Architecture

```
src/
  proxy.ts               → host routing: admin.<domain>/* is rewritten to /admin/*
                           (after the admin password check); /admin/* on the
                           public domain redirects to /
  app/
    layout.tsx           → fonts, <html>/<body>, AuthProvider
    page.tsx             → landing page (no header)
    (main)/              → the browsing app: Header, NavMenu, Footer, and the
                           Toast/Favorites/Lists/History providers
      account/           → profile, favorites, history (guests are sent to /login)
    admin/               → admin panel (noindex; access re-checked in layout.tsx)
      (panel)/           → pages with the sidebar
    api/search/          → header search suggestions (catalog stays server-side)
    robots.ts, icon.png, not-found.tsx, error.tsx
  components/            → UI components (admin/ for the panel)
  lib/                   → contexts, hooks, helpers and mock data
next.config.mjs          → image hosts and security headers (CSP, HSTS, ...)
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
- **Browser-stored state** uses `usePersistedState` / `usePersistedRecord`.
  They stay in sync across components and tabs. State updaters must be pure,
  so fire toasts and other side effects outside them.
- **Admin code** that reads or changes data (future API routes and server
  actions) must call `checkAdminAccess()` itself; the proxy rewrite doesn't
  cover `/api`.
- **Third-party origins** (CDNs, video embeds) need adding both to
  `images.remotePatterns` and to the CSP in `next.config.mjs`.

## Brand assets

`public/brand/` holds the full lockup, the icon-only "G" and the
wordmark + tagline. They're referenced by URL path, and `next/image`
serves them resized.
