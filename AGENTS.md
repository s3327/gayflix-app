<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project conventions

- **Commits:** don't add `Co-Authored-By` trailers to commit messages.
- **Admin panel:** lives at `/admin` on the main domain (not a subdomain).
  Every admin page, server action and API route must call `requireAdmin()`
  (`src/lib/session.ts`): it checks the "admin" role and that the session
  passed two-factor in the last 12 hours (`src/lib/admin-access.ts`).
  `src/proxy.ts` can also put an optional password gate in front.
- **Database:** Prisma Postgres with Prisma ORM 7.x (decided 2026-10-10),
  through `@prisma/adapter-pg`. Pin Prisma versions exactly (npm's `latest`
  tag has pointed at pre-releases). Prisma 7 doesn't generate the client on
  `migrate`; run `npx prisma generate` after schema changes.
- **Accounts:** Better Auth (`src/lib/auth.ts`). Server code reads the
  session with `getSession()` / `requireUser()`; never trust client state
  for access decisions.
- **Server functions** (`"use server"` files such as
  `src/lib/library-actions.ts` and `src/lib/report-actions.ts`) check the
  session and validate every argument themselves; list functions also
  check ownership. Title snapshots go through `parseEntry()`.
- **Catalog:** titles live in the `media` and `episode` tables and are
  read only through `src/lib/catalog.ts`. Its public reads return
  published titles only; drafts and trashed titles appear only in its
  admin reads, which call `requireAdmin()`. Every read awaits
  `connection()` first, because nothing may query the database at build
  time (CI builds before it migrates, and previews have no database).
  Titles change only through `src/lib/admin-catalog-actions.ts`, whose
  field checks are in `src/lib/title-form.ts`.
- **Before pushing,** run `npm run check` (lint, typecheck, tests, build);
  CI runs the same on every push to `main`.
