#!/bin/sh
# Vercel's build command (set in vercel.json).
#
# Applies pending database migrations, then builds. If a required setting
# is missing or a migration fails, the build stops and Vercel keeps the
# previous deploy live. Preview deploys skip the migrations: they usually
# share the production database, and a pull request's schema change
# shouldn't reach it before the PR is merged.
set -e

if [ "$VERCEL_ENV" = "production" ]; then
  # On Supabase, production also needs the direct (session) connection for
  # migrations and Supabase's CA certificate, so the database's identity
  # is verified (src/lib/database-config.mjs).
  required="DATABASE_URL BETTER_AUTH_SECRET RESEND_API_KEY"
  case "$DATABASE_URL" in
    *.supabase.com* | *.supabase.co*) required="$required DIRECT_URL DATABASE_CA_CERT" ;;
  esac
  for name in $required; do
    if [ -z "$(printenv "$name")" ]; then
      echo "$name is not set. Add it in Vercel under Settings → Environment Variables (Production), then redeploy. See docs/DEPLOYMENT.md, Part 3." >&2
      exit 1
    fi
  done
fi

if [ "$VERCEL_ENV" != "preview" ]; then
  npm run db:deploy
fi
npm run build
