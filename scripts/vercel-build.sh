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
  for name in DATABASE_URL BETTER_AUTH_SECRET RESEND_API_KEY; do
    if [ -z "$(printenv "$name")" ]; then
      echo "$name is not set. Add it in Vercel under Settings → Environment Variables (Production), then redeploy." >&2
      exit 1
    fi
  done
fi

if [ "$VERCEL_ENV" != "preview" ]; then
  npm run db:deploy
fi
npm run build
