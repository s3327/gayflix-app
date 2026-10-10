<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project conventions

- **Commits:** don't add `Co-Authored-By` trailers to commit messages.
- **Admin panel:** lives at `/admin` on the main domain (not a subdomain).
  `src/proxy.ts` puts a password gate in front of it, and every admin page,
  server action and API route must also call `requireAdmin()`
  (`src/lib/session.ts`), which checks the account's "admin" role.
- **Database:** Prisma Postgres with Prisma ORM 7.x (decided 2026-10-10),
  through `@prisma/adapter-pg`. Pin Prisma versions exactly (npm's `latest`
  tag has pointed at pre-releases). Prisma 7 doesn't generate the client on
  `migrate`; run `npx prisma generate` after schema changes.
- **Accounts:** Better Auth (`src/lib/auth.ts`). Server code reads the
  session with `getSession()` / `requireUser()`; never trust client state
  for access decisions.
- **Before pushing,** run `npm run check` (lint, typecheck, tests, build);
  CI runs the same on every push to `main`.
