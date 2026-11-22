# Deploying Gayflix

This guide takes Gayflix from this GitHub repository to a live site with
real accounts, a database, email and a secured admin panel. Follow the
parts in order. Each step says what you should see, so you know it worked
before you move on.

**What you end up with**

- The site on Vercel, first at a `.vercel.app` address and later on your
  own domain.
- A Supabase project: its Postgres database for favorites, lists, watch
  history and reports, and Supabase Auth for accounts and sign-in.
- Sign-up codes and password-reset emails sent by Supabase Auth through
  Resend.
- Your own admin account, protected by a password and an authenticator
  app.

> **Keep secrets out of chats, issues and the repository.** The database
> connection string, `HASH_SECRET`, Supabase's secret key and API keys go only into
> Vercel's environment variables and your password manager.

## Checklist

- [ ] [Part 1: Get the accounts and tools ready](#part-1-get-the-accounts-and-tools-ready)
- [ ] [Part 2: Create the Vercel project](#part-2-create-the-vercel-project)
- [ ] [Part 3: Add the database](#part-3-add-the-database)
- [ ] [Part 4: Add the secrets and set up sign-in](#part-4-add-the-secrets-and-set-up-sign-in)
- [ ] [Part 5: Deploy the version with accounts](#part-5-deploy-the-version-with-accounts)
- [ ] [Part 6: Create your admin account](#part-6-create-your-admin-account)
- [ ] [Part 7: Use your own domain and email address](#part-7-use-your-own-domain-and-email-address)
- [ ] [Part 8 (optional): Turn on Google sign-in](#part-8-optional-turn-on-google-sign-in)
- [ ] [Part 9: Check that everything works](#part-9-check-that-everything-works)
- [ ] [Part 10 (optional): Turn on crash reports](#part-10-optional-turn-on-crash-reports)
- [ ] [Part 11 (optional): Turn on poster uploads](#part-11-optional-turn-on-poster-uploads)
- [ ] [Part 12 (optional): Turn on scheduled maintenance jobs](#part-12-optional-turn-on-scheduled-maintenance-jobs)

Then keep [Running the site](#running-the-site),
[Troubleshooting](#troubleshooting) and
[Before a public launch](#before-a-public-launch) at hand.

## Part 1: Get the accounts and tools ready

| What | What it's for | Cost |
|---|---|---|
| GitHub account with access to `s3327/gayflix-app` | Vercel deploys from it | You have it |
| Vercel account ([vercel.com](https://vercel.com), sign up with GitHub) | Hosting | The Hobby plan is free but only for personal, non-commercial sites. A site with ads or paid plans needs Pro. |
| Resend account ([resend.com](https://resend.com)) | Sign-up codes and password-reset emails | Free plan with daily and monthly sending limits |
| Supabase account ([supabase.com](https://supabase.com)) | The database, and accounts (Supabase Auth) | Free plan available |
| An authenticator app on your phone (1Password, Google Authenticator, Authy, Microsoft Authenticator, ...) | Admin two-factor sign-in | Free |
| A password manager | The secret and your admin password | |
| Optional: your own domain, e.g. `gayflix.com` | A real address, and email from your own domain | Yearly fee from a domain registrar |

Plans and limits change, so check each provider's pricing page before you
launch.

## Part 2: Create the Vercel project

1. Open [vercel.com/new](https://vercel.com/new) and sign in with GitHub.
2. Under **Import Git Repository**, find `gayflix-app`. If it isn't
   listed, use the link there to adjust the GitHub app's permissions, give
   Vercel access to the repository, and come back.
3. Click **Import**.
4. On the next screen:
   - **Framework Preset:** Next.js (detected for you).
   - **Root Directory:** leave it as is.
   - **Build and Output Settings:** leave them as they are. The
     repository's `vercel.json` sets the build command.
   - **Environment Variables:** skip for now.
5. Click **Deploy**.

**You should see** a finished deployment and an address like
`https://gayflix-app.vercel.app` that shows the landing page. Until pull
request #7 is merged, `main` is the earlier version without accounts,
which needs no database.

If #7 is already merged, this first deployment stops with
"`DATABASE_URL` is not set" instead. That's expected: carry on with Parts
3 and 4, and redeploy in Part 5.

From now on, every change merged into `main` deploys to production, and
every pull request gets its own preview address.

## Part 3: Add the database

The database is [Supabase](https://supabase.com) Postgres. The site talks
to it through Prisma ORM over a plain Postgres connection; it doesn't use
Supabase's client libraries or its Data API.

1. At [supabase.com/dashboard](https://supabase.com/dashboard), click
   **New project**:
   - **Region:** West US (North California). The site's server code runs
     next to it in San Francisco (`"regions": ["sfo1"]` in `vercel.json`);
     every page makes several database queries, so the two must be close.
     If you choose another region, change `regions` to the Vercel region
     nearest to it.
   - **Database password:** generate one and keep it in a password
     manager; it goes into both connection strings below.
   - **Plan:** the free plan is fine to start.
2. When the project is ready, click **Connect** at the top of its
   dashboard. Under **Connection String** (type **URI**), copy two of them,
   replacing `[YOUR-PASSWORD]` with the database password each time:
   - **Transaction pooler** (port `6543`): this is `DATABASE_URL`, the
     site's connection. It suits Vercel's short-lived functions.
   - **Session pooler** (port `5432`): this is `DIRECT_URL`, used only
     to apply migrations, which the transaction pooler can't run.

   Copy them exactly. The host (`aws-0-…` or `aws-1-…`, then the region)
   and the user (`postgres.<project ref>`) must match this project; a
   mismatch fails with "tenant/user … not found".
3. Open **Project Settings → Database → SSL Configuration** and download
   the certificate. That's `DATABASE_CA_CERT`: the site checks it's
   really talking to your database (src/lib/database-config.mjs), and
   without it the site won't connect to Supabase at all.
4. Turn off the Data API, which the site never uses: **Project Settings →
   Data API**, switch it off. (A migration also turns on row-level
   security for every table, so the API couldn't read them anyway.)
5. In Vercel, open **Settings → Environment Variables** and add all three
   for **Production** only, each marked **Sensitive**. For
   `DATABASE_CA_CERT`, paste the certificate file's whole text, from
   `-----BEGIN CERTIFICATE-----` to `-----END CERTIFICATE-----`.
   - **Not Development:** tools such as `vercel env pull` would copy the
     production database's address onto your computer, where a single
     `npm run db:migrate` could wipe it.
   - **Not Preview:** every pull request's preview would then run its
     unmerged code against your real data. Without the database, a
     preview shows only the pages that don't need it (see
     [How deploys work](#how-deploys-work)).

**You should see** `DATABASE_URL`, `DIRECT_URL` and `DATABASE_CA_CERT`
listed for Production only.

You don't create any tables yourself. The deploy in Part 5 does that.

## Part 4: Add the secrets and set up sign-in

Each variable goes in Vercel's **Settings → Environment Variables**.
Enter the name, paste the value, pick the environments listed, tick
**Sensitive**, and save.

### 4.1 `HASH_SECRET`

This keys the one-way codes the site keeps instead of IP addresses (view
counts, report and sign-in limits; `src/lib/visitor.ts`).

1. Make a random value on your computer, with one of these:
   - Mac or Linux terminal: `openssl rand -base64 32`
   - Any computer with Node.js:
     `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
   - Your password manager's generator, set to at least 40 random
     characters.
2. Add it as `HASH_SECRET` for **Production**, and save a copy in your
   password manager.

Moving a site that ran Better Auth? Use the old `BETTER_AUTH_SECRET`
value instead (see `docs/SUPABASE_CUTOVER.md`).

### 4.2 Supabase's address and keys

1. In the Supabase project, open **Project Settings → API Keys**.
2. Add, for **Production**:
   - `NEXT_PUBLIC_SUPABASE_URL`: the project URL,
     `https://<project ref>.supabase.co` (**Project Settings → Data API**
     shows it, even with the Data API off).
   - `SUPABASE_PUBLISHABLE_KEY`: the publishable key (`sb_publishable_…`).
   - `SUPABASE_SECRET_KEY`: a secret key (`sb_secret_…`). It can do
     anything to every account, so it stays in Vercel and your password
     manager; never give it a `NEXT_PUBLIC_` name.

The browser never talks to Supabase: every sign-in step runs on the
site's server.

### 4.3 Resend, for Supabase Auth's emails

1. Sign up at [resend.com](https://resend.com).
2. Open **API Keys** → **Create API Key**. Name it `gayflix-supabase`
   and give it **Sending access**. Copy the key (it starts with `re_`
   and is shown only once).
3. In Supabase, open **Authentication → Emails → SMTP Settings**, turn on
   **Custom SMTP**, and enter:
   - Host `smtp.resend.com`, port `465`, username `resend`, password the
     `re_` key.
   - Sender email: until you verify a domain (7.3), Resend only delivers
     from `onboarding@resend.dev` to the address you signed up to Resend
     with. Sender name `Gayflix`.

The key goes only into Supabase, not Vercel: the site sends no email of
its own.

### 4.4 Supabase Auth settings

All in the Supabase dashboard, under **Authentication**. The repository's
`supabase/config.toml` holds the same settings for the local stack only;
never `supabase config push` it to the real project (its rate limits are
for tests).

1. **Sign In / Providers → Email:** on, with **Confirm email** on,
   **Secure email change** on, and **Minimum password length** 8.
2. **Emails → Templates:** for each template below, set the subject and
   paste the file's whole text from `supabase/templates`:

   | Template | Subject | File |
   |---|---|---|
   | Confirm signup | Your Gayflix verification code | `confirmation.html` |
   | Reset password | Your Gayflix password reset code | `recovery.html` |
   | Change email address | Confirm your Gayflix email change | `email_change.html` |

   Under **Security notifications**, turn on **Email changed**, subject
   "Your Gayflix email was changed", with `email_changed_notification.html`.
   The site's flows use 6-digit codes (`{{ .Token }}`), never links.
3. **Hooks** (after the first deploy in Part 5, which creates the
   functions): add **Custom Access Token** → Postgres →
   `public.custom_access_token_hook`, and **Before User Created** →
   Postgres → `public.before_user_created_hook`.
4. **URL Configuration:** **Site URL** `https://<your site>` (the
   `SITE_URL` address, Part 7), and under **Redirect URLs**
   `https://<your site>/auth/callback`.
5. **Multi-Factor:** TOTP (App Authenticator) enabled.
6. **Rate Limits:** review them. Every request reaches Supabase from the
   site's server, so they count the site's few server addresses, not
   visitors; the site's own limits (`src/lib/auth-rate-limit.ts`) are
   the real per-visitor ones. Keep the email limit high enough for
   sign-ups.
7. **JWT Keys** (Project Settings): use asymmetric signing keys (ECC
   P-256 or RSA). The site checks sessions against them without a call
   to Supabase per page.

**You should see** each setting saved. Part 9 checks them working.

### 4.5 Optional: an extra password in front of `/admin`

`ADMIN_BASIC_AUTH_USER` and `ADMIN_BASIC_AUTH_PASSWORD` add a browser
password prompt in front of the admin panel, on top of the admin account
and two-factor. Set both or neither: with only one set, the admin panel is
turned off and says so.

### Summary

| Variable | Production | Preview | Development |
|---|---|---|---|
| `DATABASE_URL` | ✅ added in Part 3 | | |
| `DIRECT_URL` | ✅ added in Part 3 | | |
| `DATABASE_CA_CERT` | ✅ added in Part 3 | | |
| `HASH_SECRET` | ✅ | | |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | ✅ | | |
| `SITE_URL` | Part 7 | | |
| `ADMIN_BASIC_AUTH_USER`, `ADMIN_BASIC_AUTH_PASSWORD` | Optional, both or neither | | |
| `IMAGE_HOSTS` | Optional, for posters on your own image host (see [Managing titles](#managing-titles)) and for imports (see [Importing titles](#importing-titles)) | | |
| `TMDB_API_KEY`, `OMDB_API_KEY` | Optional, for the Import page (see [Importing titles](#importing-titles)) | | |
| `VIDEO_HOSTS` | For video: the hosts sources may come from (see [Video](#video)) | | |
| `NEXT_PUBLIC_SENTRY_DSN` | Part 10 (optional) | | |
| `BLOB_READ_WRITE_TOKEN` | Part 11 (optional), added by Vercel | | |
| `CRON_SECRET` | Part 12 (optional), for automated maintenance jobs | | |

Google sign-in and the email settings live in Supabase, not here (4.3,
4.4, Part 8).

## Part 5: Deploy the version with accounts

Accounts arrive in `main` with
[pull request #7](https://github.com/s3327/gayflix-app/pull/7).

1. Open the pull request. At the bottom, check that the **check** job is
   green and GitHub says the branch can be merged. If the check is red,
   don't merge; say so in the project thread.
2. Click **Merge pull request**, then **Confirm merge**. GitHub may offer
   to delete the branch afterwards; that's fine.
3. In Vercel, open **Deployments**. A new production deployment starts
   within a minute. (If #7 was already merged before you created the
   Vercel project, open the latest deployment's **⋯** menu and click
   **Redeploy** instead.)
4. Open the deployment and look at its build log. **You should see**, in
   this order:
   - an `Applied <file>.sql` line for each migration in
     `supabase/migrations` the database doesn't have yet (all of them on
     the first deploy). A deploy with no new migrations says
     `No pending migrations.` instead.
   - the Next.js build, ending with a list of routes.
5. When the deployment says **Ready**, open the site.

After the first deploy, register the two hooks (4.4, step 3).

If the build stops with "`SOME_NAME` is not set": add that variable for
Production (Parts 3 and 4), then open the failed deployment's **⋯** menu
and click **Redeploy**. Your previous deploy stays live until a build
succeeds.

Vercel reads environment variables when it builds. Whenever you add or
change one, redeploy.

## Part 6: Create your admin account

### 6.1 Sign up

1. Open `https://<your site>/signup`.
2. Fill in your name, email and a password (8 characters or more), tick
   the terms box, and continue.
   - Use **email and password**, not "Continue with Google": the admin
     two-factor setup asks for your password.
   - Until you finish Part 7, use **the email address you signed up to
     Resend with**.
3. Enter the 6-digit code from the email. If it hasn't arrived after a
   minute, check your spam folder.

**You should see** that you're signed in on the site.

### 6.2 Make the account an admin

**Option A, in the browser (no tools needed):**

1. Open your project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Open the **SQL Editor** and run this with your own email:

```sql
UPDATE public.profile SET role = 'admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'you@example.com');
```

It should say `1 row affected`.

The role must be exactly `admin`. Any other text, such as `user admin`,
is saved as typed but doesn't open the admin panel.

**Option B, from a terminal** (needs git and Node.js 22.12 or newer):

```bash
git clone https://github.com/s3327/gayflix-app.git
cd gayflix-app
npm ci
DATABASE_URL='<production connection string>' npm run make-admin -- you@example.com
```

On Windows PowerShell, run
`$env:DATABASE_URL='<production connection string>'` on its own line
first, then `npm run make-admin -- you@example.com`.

Copy the transaction pooler connection string from Supabase (**Connect**
on the project's dashboard, as in Part 3), with the database password in
place of `[YOUR-PASSWORD]`. If you don't have the password, use Option A,
which doesn't need it. Don't save it in a
`.env` file in the project: `npm run dev` and `npm run db:deploy` would
then work on the production database.

**You should see** `you@example.com is now an admin.`

### 6.3 Turn on two-factor

1. Open `https://<your site>/admin/login` and log in with the same email
   and password.
2. You land on **Set up two-factor sign-in**. Enter your password again
   and click **Continue**.
3. Scan the QR code with your authenticator app, or type in the key shown
   under it.
4. Enter the 6-digit code from the app and click **Turn on two-factor**.

There are no backup codes. If you lose the phone, see "Lost phone or
authenticator app" below.

**You should see** the admin dashboard.

From now on:

- Every admin sign-in asks for a code from the app.
- An admin sign-in lasts 12 hours. After that, you sign in again.
- 5 wrong codes for one account within 15 minutes lock its code step
  until the 15 minutes are up.
- The same account asks for a code on the main site's login too.

## Part 7: Use your own domain and email address

Do this before you share the site. You can skip it while you're only
testing.

### 7.1 Connect the domain to Vercel

1. In the Vercel project, open **Settings → Domains** and add your domain,
   e.g. `gayflix.com`.
2. Vercel suggests adding `www.gayflix.com` too, with one redirecting to
   the other. Accept, and note which one is the main address (the one that
   doesn't redirect).
3. Vercel shows the DNS records to add, usually an A record for the bare
   domain and a CNAME for `www`. Add them exactly as shown in your domain
   registrar's DNS settings.
4. Wait until Vercel shows **Valid Configuration** for each domain. That
   can take from a few minutes to a few hours.

### 7.2 Tell the site its address

1. Add `SITE_URL` for Production: the main address with `https://` and no
   trailing slash, e.g. `https://gayflix.com`, or `https://www.gayflix.com`
   if `www` is your main one.
2. Redeploy.

3. In Supabase, **Authentication → URL Configuration**: set **Site URL**
   to the same address, and add `https://<that address>/auth/callback`
   under **Redirect URLs** (4.4, step 4). For Google sign-in on preview
   addresses too, add their pattern as well, e.g.
   `https://gayflix-app-*-<your team>.vercel.app/auth/callback`.

The sitemap, link previews and Google sign-in's return address use it.

### 7.3 Send email from your domain

1. In Resend, open **Domains** → **Add Domain**. Enter your domain, or a
   subdomain such as `mail.gayflix.com`.
2. Resend lists a few DNS records (for SPF, DKIM and bounces; a DMARC
   record is recommended). Add each one exactly as shown where your
   domain's DNS is managed: usually your registrar, or Vercel's
   **Domains** page if you bought the domain through Vercel.
3. Click **Verify** in Resend and wait until the domain shows
   **Verified**.
4. In Supabase, **Authentication → Emails → SMTP Settings**, change the
   sender email to an address on that domain, e.g. `no-reply@gayflix.com`,
   and save.

**You should see** sign-up codes arrive at any email address, not just your
Resend one.

## Part 8 (optional): Turn on Google sign-in

1. In Supabase, open **Authentication → Sign In / Providers → Google** and
   copy its **Callback URL** (`https://<project ref>.supabase.co/auth/v1/callback`).
2. Open [console.cloud.google.com](https://console.cloud.google.com) and
   create a project, e.g. "Gayflix".
3. Set up the consent screen (under **Google Auth Platform**, or **APIs &
   Services → OAuth consent screen**):
   - App name **Gayflix**, your support email, audience **External**.
   - Your domain under authorized domains.
   - Links to `https://<your site>/privacy` and `https://<your site>/terms`.
4. Create an OAuth client of type **Web application**:
   - Authorized JavaScript origins: `https://<your site>`
   - Authorized redirect URIs: Supabase's callback URL from step 1.
5. Copy the client ID and client secret into Supabase's Google provider,
   turn it on and save. Nothing goes into Vercel.
6. Publish the app (on the **Audience** page) so anyone can use it, not
   only test users. Sign-in that only asks for name and email doesn't need
   a review by Google.

**You should see** "Continue with Google" on `/login` and `/signup`
within five minutes (the site checks Supabase's settings), and it signs
you in, back at `https://<your site>/auth/callback`. Google sign-in never
opens the admin panel: admins always use their password and a code.

## Part 9: Check that everything works

Use a private browser window for the guest checks.

**As a guest**

- [ ] The landing page, `/home`, a movie page and a watch page load.
- [ ] `/sitemap.xml` and `/robots.txt` show your main address.
- [ ] Reporting an issue on a watch page works once, then says today's
      limit is used.

**With an account** (a second email address, once Part 7 is done)

- [ ] Sign up: the code arrives and you're signed in.
- [ ] Add a favorite and make a list, then sign in on your phone: both
      are there.
- [ ] Log out, use **Forgot password**, and reset it with the emailed code.
- [ ] Change your display name on `/account`.

**As the admin**

- [ ] `/admin/login` asks for your password, then a code.
- [ ] `/admin/reports` shows the guest report. **Resolve** and **Reopen**
      work.
- [ ] Your second account gets "This account doesn't have admin access."
      at `/admin/login`.

**Previews**

- [ ] A pull request's Vercel preview address shows the landing page.
      Pages with titles show an error page there and signing in fails,
      which is expected (see [How deploys work](#how-deploys-work)).

## Part 10 (optional): Turn on crash reports

When something breaks, Sentry emails you the error and where in the code
it happened, so you don't have to hear it from a visitor. Until you do
this part, the site sends nothing anywhere and carries none of Sentry's
code.

1. Sign up at [sentry.io](https://sentry.io). The free plan is enough to
   start.
2. Create a project with the platform **Next.js**. Keep the default alert
   setting, so Sentry emails you about new errors (change it later under
   **Alerts**). Skip the setup wizard and the code Sentry shows: the site
   already has it.
3. Copy the project's DSN, an address like
   `https://abc123@o123456.ingest.us.sentry.io/1234567`. It's also under
   **Settings → Projects → (your project) → Client Keys (DSN)**.
4. In the same project settings, under **Security & Privacy**, turn on
   **Prevent Storing of IP Addresses**. The site already leaves them out;
   this makes sure.
5. In Vercel, add `NEXT_PUBLIC_SENTRY_DSN` with the DSN for
   **Production** only. Previews show error pages by design (they have no
   database), which would only fill Sentry with noise. The DSN isn't a
   secret, since it ends up in the site's JavaScript, so it doesn't need
   Sensitive.
6. Redeploy. The DSN is built into the site, so it only takes effect with
   a new build.

**You should see** a test report arrive. Open your site, open the
browser's developer console (F12 → Console) and run:

```js
setTimeout(() => { throw new Error("Testing crash reports") })
```

Within a minute, **Issues** in Sentry lists "Testing crash reports".
Resolve it there.

A report holds the error, where in the code it happened, the page's
address without anything after the `?`, and the browser and system.
Never the visitor's IP address, cookies, anything they typed, or which
account they use. Some visitors' ad blockers stop their browser's
reports; errors on the server always get through.

## Part 11 (optional): Turn on poster uploads

Without this part, posters and backdrops are links to images hosted
elsewhere. With it, the title editor gets **Upload a poster** and
**Upload a backdrop** buttons, and the images are kept in a Vercel Blob
store that belongs to your Vercel project.

1. In your Vercel project, open the **Storage** tab.
2. Click **Create Database** and choose **Blob**.
3. Follow the prompts:
   - **Name:** for example `gayflix-images`.
   - **Region**, if it asks: the same as the database's (Part 3).
   - If it asks whether the store is **public** or **private**, choose
     **Public**: posters are shown to every visitor.
4. When Vercel asks which environments to connect the store to, choose
   **Production** only, as for the database: the title editor needs the
   database, so previews can't use uploads anyway.
5. Open **Settings → Environment Variables**. **You should see**
   `BLOB_READ_WRITE_TOKEN` listed for Production. Vercel added it, so
   there's nothing to copy.
6. Redeploy (**Deployments**, the latest one's **⋯** menu, **Redeploy**):
   the site works out the store's address when it's built.

**You should see** the buttons under the image links on **Upload →
Movies**. Upload a poster, a JPEG, PNG, WebP or AVIF image up to 4 MB:
the button's line says "Uploaded. Save to use it." and the link fills
with an address ending in `.public.blob.vercel-storage.com`. Add the
title, and its edit page shows the poster. The file is also listed in
the store's **Browser** on the Storage tab.

Uploaded images are public, like any poster, under a random name. An
image you replace, or upload and never save, stays in the store; delete
ones you don't need in the store's **Browser** if they pile up. Links
keep working alongside uploads.

## Part 12 (optional): Turn on scheduled maintenance jobs

The site includes automated maintenance jobs (configured in `vercel.json`):
- **30-Day Trash Auto-Purge (`/api/cron/purge-trash`):** Daily at 03:00 UTC, permanently deletes movies and series in trash for longer than 30 days.
- **Publish Due Scheduled Drafts (`/api/cron/publish-due`):** Daily at 03:15 UTC, publishes draft titles whose scheduled publication date has arrived.

Vercel Cron triggers these endpoints automatically using an Authorization bearer header.

1. Generate a secure secret:
   ```bash
   openssl rand -hex 32
   ```
2. In your Vercel project, open **Settings → Environment Variables**.
3. Add `CRON_SECRET` with the generated secret for **Production**.
4. Redeploy for the environment variable to take effect.

Admins can also trigger these background jobs manually anytime at `/admin/jobs`.

## Running the site

### How deploys work

- Merging into `main` deploys to production. The build
  (`scripts/vercel-build.sh`) first stops if `DATABASE_URL`,
  `HASH_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`
  or `SUPABASE_SECRET_KEY` is missing, then applies any new database
  migrations, then builds.
- Each pull request gets a preview address. Previews have no database
  (Part 3) and never run migrations, so only the pages that don't need
  the database work there, such as the landing page and the legal pages.
  Pages with titles (home, title pages, listings, search) show an error
  page. Sign-in doesn't work either: previews have no Supabase keys. The pull request's **check** runs the end-to-end
  tests against a database of its own instead.
- By default, preview addresses only open for people signed in to your
  Vercel account.
- A changed environment variable only takes effect after a redeploy.

### Rolling back

In **Deployments**, open the last good production deployment and use
**Instant Rollback** (or **Promote to Production**). That brings the
code back, but not the database: migrations stay applied. Before rolling
back past a change that altered the database, ask in the project thread.

### Adding and removing admins

- **Add:** the person signs up (6.1). In the admin panel, open **Users**,
  find their account and choose **Make admin** (only the first admin
  needs 6.2). They set up two-factor on their first admin login (6.3).
  An account has to confirm its email before it can be made an admin.
- **Remove:** **Users** → their account → **Remove admin access**. It
  applies right away. Setting their `profile.role` back to `user` in the
  SQL Editor, or `npm run make-admin -- them@example.com --revoke`, still
  works too.
- Nobody can change their own account on the Users page, so the panel
  always keeps at least one admin.

### Banning accounts

On an account's page under **Users**:

- **Ban** signs the account out everywhere and stops it signing in, until
  you unban it or for 1, 7 or 30 days. The reason you give is only shown
  to admins. An admin has to lose admin access before a ban.
- **Unban** lets it sign in again.
- **Sign out everywhere** ends every session the account has without
  banning it, for example after a lost phone.

### Managing titles

The movies and shows are rows in the database: one per title in the
`media` table, and each series' episodes in the `episode` table. They
start as the sample catalog (see
[Before a public launch](#before-a-public-launch)). Manage them in the
admin panel; changes show on the site right away.

- **Add a title:** **Upload → Movies** or **Upload → Series** (or **Add a
  movie** on **Library → Movies**). A new title is a draft, seen only in
  the admin panel, until you set its status to **Published**. Its address
  (such as `/movie/wildflower`) is made from its title and doesn't change
  later, even if the title does.
- **Add episodes:** **Add an episode** on the series' page, or **Upload →
  Episodes**. After each one, the form stays open for the next. A series'
  card shows how many seasons it has episodes in.
- **Edit a title or an episode:** click it in **Library → Movies**,
  **Series** or **Episodes**.
- **Add a video:** in the **Video** section of a movie's page or an
  episode's page (a series' video is on its episodes). See
  [Video](#video) below.
- **Hide or show titles:** the eye button on a title's row, or tick
  several rows and use **Publish** or **Unpublish** above the list. A
  hidden title's page, its episodes and its place in listings, search and
  the sitemap disappear until it's published again.
- **Change the home page's main title:** tick **Feature on the home page**
  on the new one and save. The title featured before stops being
  featured. With none featured, the home page shows the newest title.
- **Remove a title:** **Move to trash**, on its row or its page. It's off
  the site at once. In **Trash**, **Restore** brings it back as a draft,
  and **Delete for good** deletes it with its episodes, which can't be
  undone. People who saved a deleted title still see it in their
  favorites, lists and history, but its page is gone.
- **Delete an episode:** on the episode's page. It's deleted for good:
  episodes don't go to the trash.

**Trending** isn't set by hand. It ranks published titles by how many
people pressed Play on them in the last 7 days, counting each person once
a day per title, so it starts empty and fills as people watch.

**Posters and backdrops** are uploaded or linked. With uploads on
([Part 11](#part-11-optional-turn-on-poster-uploads)), **Upload a poster**
and **Upload a backdrop** take a JPEG, PNG, WebP or AVIF image up to 4 MB
and fill in the link to it; save the title to use it. A link must start
with `https://` and point to an allowed image host. At first that's only
the sample catalog's `picsum.photos`, and your Blob store once uploads
are on. To use your own, add `IMAGE_HOSTS` in Vercel (**Settings →
Environment Variables**, Production) with the host names, separated by
commas, such as `images.example.com,cdn.example.org`, then redeploy: the
site reads the list when it's built. Leave the poster link empty for a
title that has no poster yet: it shows the **No poster yet** image (the
logo and that text) until you add one.

#### Video

Each movie and each episode can have up to 10 video sources. Each source
is one of the player's server tabs, in the order the **Video** section
lists them (the arrow buttons move one up or down). A source is one of:

- **Embed:** a player page from your video provider, shown in a frame.
  Paste its link, or the whole `<iframe …>` code the provider gives you:
  the link is taken out of it.
- **HLS stream:** an `.m3u8` playlist.
- **Video file:** an `.mp4` or `.webm` file played as it is.

**Type** can stay on **Work it out from the link**: `.m3u8` links are
streams, `.mp4`, `.m4v` and `.webm` links are files, and anything else is
an embed. Choose the type yourself for a stream or file whose link doesn't
end that way. **Turn off** hides a source from the player but keeps it;
**Delete** removes it for good.

Video links must start with `https://` and be on a host listed in
`VIDEO_HOSTS` (Vercel: **Settings → Environment Variables**,
Production), separated by commas, then redeploy. `*.` allows every
subdomain of a host, which suits providers that give each library its own
subdomain: `player.example.com,*.b-cdn.net`. An HLS stream needs the host
of its playlist and the hosts its segments come from. The site's
Content-Security-Policy lets browsers load video from exactly these hosts,
so a source whose host is taken out of the list stops playing; the
**Video** section marks it. Until the new player is in, the watch pages
still show a placeholder.

To hide every title at once, a SQL editor (as in 6.2) is quicker than the
list's 50 rows a page. Set them back to `'published'` to undo it:

```sql
UPDATE "media" SET "status" = 'draft';
```

### Importing titles

**Import** in the admin panel finds movies and series on
[TMDB](https://www.themoviedb.org/), checks each one against IMDb
through [OMDb](https://www.omdbapi.com/), and adds it as a draft with its
details filled in. Both sources are free for a non-commercial site, with
the credit that's in the site's footer. To turn it on:

1. **TMDB key:** sign up at themoviedb.org, open **Settings → API**, and
   request a key for non-commercial use. Copy the **API Read Access
   Token** (the long one). The shorter **API Key** works too.
2. **OMDb key:** request a free key at
   [omdbapi.com/apikey.aspx](https://www.omdbapi.com/apikey.aspx) and
   activate it from the email. A free key allows 1,000 requests a day,
   and an import uses one or two.
3. In Vercel, open **Settings → Environment Variables** and add these
   for Production. Mark the two keys **Sensitive**:

   | Variable | Value |
   |---|---|
   | `TMDB_API_KEY` | The token from step 1 |
   | `OMDB_API_KEY` | The key from step 2 |
   | `IMAGE_HOSTS` | `image.tmdb.org,m.media-amazon.com`, after any hosts you already have, separated by commas |

4. Redeploy (**Deployments**, the latest one's **⋯** menu, **Redeploy**):
   the site reads `IMAGE_HOSTS` when it's built.

Without `TMDB_API_KEY`, the Import page says the setting is missing.
Without `OMDB_API_KEY`, imports still work but aren't checked against
IMDb.

**Search** by title (pick **Movie** or **Series**) or by IMDb ID (such as
`tt0133093`, or a link to the IMDb page). Results come 40 to a page. A
title imported before shows **In library** or **In trash** instead of
**Import**, and links to it. **Import**:

- saves the draft and opens it when TMDB and IMDb agree and nothing is
  missing. Fields TMDB leaves empty, such as a runtime, are filled from
  IMDb. When neither has a poster, the title gets the **No poster yet**
  image.
- opens the **Add a movie** or **Add a series** form, filled in, when
  IMDb's title or year doesn't match TMDB's, or when neither has a field
  the form needs. The problem is shown above the form; save it from
  there.
- asks which type to import it as when TMDB and IMDb disagree on movie
  or series.

Imported titles are drafts, never featured. A title's admin page says it
came from TMDB, and either which IMDb title it matches or **Not checked
against IMDb** (OMDb was down, out of requests, or had no match). Series
arrive without episodes for now; add them as usual.

### Lost phone or authenticator app

There are no backup codes. Members who lose the device with their
authenticator app ask staff through **Contact** (the site tells them
so); staff who lose theirs ask another admin. Check that the request
really comes from the account's owner (for example, a reply from the
account's email address) before turning their two-factor off:

1. In the Supabase dashboard, open **SQL Editor** and run, with the
   account's email:

   ```sql
   DELETE FROM auth.mfa_factors
   WHERE user_id = (SELECT id FROM auth.users WHERE email = 'them@example.com');
   ```

2. They log in with their password alone. A member can turn two-factor
   on again in **Account → Setting**; an admin goes through the
   two-factor setup (6.3) again at `/admin/login`.

### Backups

Supabase takes daily backups on paid plans (**Database → Backups**); the
free plan has none. To keep your own copy, use `pg_dump` with the session
pooler connection string (`DIRECT_URL`). Its version must be at least the
database's Postgres version:

```bash
pg_dump '<session pooler connection string>' --format=custom --no-owner --file=gayflix-backup.dump
```

Keep backups private: they hold everyone's account data.

### Logs and email delivery

- **Vercel → Logs** shows server errors. On the Hobby plan, logs are kept
  only for a short time.
- **Supabase → Logs → Auth** shows sign-in errors, such as an email
  Supabase couldn't send.
- **Resend → Emails** lists every email sent and whether it was delivered
  or bounced.
- **Sentry → Issues** (once you've done Part 10) lists the errors from the
  server and from visitors' browsers, grouped, with how often each one
  happens.

### Dependency updates

Dependabot opens update pull requests every week, and CI tests each one.
Merge them when the check is green. Ask in the project thread about the
red ones.

### Protect `main` (recommended)

In GitHub, open the repository's **Settings → Rules → Rulesets** (or
**Branches**) and add a rule for `main` that requires the **check** status
to pass before merging. Then broken code can't reach production by
accident. Private repositories need a paid GitHub plan for this.

### Rules for the database

- Production only ever gets `npm run db:deploy` (the SQL files in
  `supabase/migrations`), which the build runs for you. Never run
  `npm run db:migrate` (`prisma migrate dev`) against it: it can reset
  the database it runs on.
- Never connect the production database to Vercel's Development
  environment, and never put its address in a `.env` file.
- Don't edit tables in Studio or a SQL editor beyond the steps in this
  guide.

### Changing the secret

Only change the production `HASH_SECRET` if it leaked. Afterwards,
today's view counts may count a viewer twice, and the guest report and
sign-in limits start over. Nobody is signed out: sessions are Supabase
Auth's. If Supabase's secret key leaked, make a new one in **Project
Settings → API Keys**, put it in `SUPABASE_SECRET_KEY`, redeploy, then
delete the old key.

## Troubleshooting

| What you see | Likely cause | Fix |
|---|---|---|
| The build stops with "`DATABASE_URL` is not set" (or another name) | That variable is missing for Production | Add it (Parts 3 and 4), then redeploy |
| The build fails at the migrations with `P1001` or "Can't reach database server" | Wrong or outdated connection string | Copy both connection strings from Supabase again (Part 3), update `DATABASE_URL` and `DIRECT_URL`, redeploy |
| The build fails at the migrations with "tenant/user postgres.… not found" | The pooler host doesn't match the project (wrong region, or `aws-0` instead of `aws-1`), or the project is paused | Copy both strings from **Connect** in Supabase exactly as shown, update `DATABASE_URL` and `DIRECT_URL`, redeploy. Restore a paused free project first |
| The site's logs show "self-signed certificate in certificate chain" | `DATABASE_CA_CERT` is missing a line or isn't this project's certificate | Paste the whole certificate file again (Part 3, step 3), redeploy |
| Signing in or up shows an error page | The Supabase variables are missing for that environment | Add them (4.2), redeploy |
| The sign-up code never arrives | Supabase's SMTP settings are wrong; or no verified domain and the address isn't your Resend email; or the sender isn't on the verified domain | Check Supabase → Logs → Auth and Resend → Emails; fix 4.3 or finish 7.3 |
| Google sign-in comes back to the site without signing you in | That address isn't in Supabase's Redirect URLs | Add `https://<that address>/auth/callback` (4.4, step 4) |
| `/admin/login` says "This account doesn't have admin access." | The account's `role` isn't exactly `admin` | Part 6.2 |
| Pages with titles show an error page on a preview address | Previews have no database | Expected; see [How deploys work](#how-deploys-work) |
| The title form says "Images can only come from …" | The image's host isn't allowed | Add it to `IMAGE_HOSTS` and redeploy (see [Managing titles](#managing-titles)) |
| A title's poster is a broken image | The image was moved or deleted on its host, or its host was taken out of `IMAGE_HOSTS` | Edit the title and use a working link on an allowed host |
| The title form has no Upload buttons | No Blob store is connected for Production, or the site wasn't redeployed after connecting one | Part 11 |
| An upload says "The upload didn't go through" | The store refused it, for instance after it was deleted or disconnected | Check **Logs** for a line starting `[uploads]`; reconnect the store (Part 11) and redeploy |
| An upload says "this site can't show it" | The store gave the image an address the site didn't expect | Ask in the project thread with the `[uploads]` line from **Logs** |
| `/admin/login` says "Confirm this account's email first" | The email was never confirmed | Log in on the main site to get a code |
| The app's codes are always wrong | The phone's clock is off | Turn on automatic date and time on the phone |
| "Two-factor sign-in is locked for 15 minutes." | 10 wrong codes in a row | Wait 15 minutes |
| The admin panel says it's disabled | Only one of `ADMIN_BASIC_AUTH_USER` and `ADMIN_BASIC_AUTH_PASSWORD` is set | Set both or remove both, redeploy |
| Google says `redirect_uri_mismatch` | Google's redirect URI isn't Supabase's callback | Add Supabase's callback URL (Part 8, step 1) to the OAuth client |
| `sitemap.xml` shows `.vercel.app` addresses | `SITE_URL` wasn't set when the site was built | Set `SITE_URL`, redeploy |
| Too many sign-in attempts | Sign-in allows 3 tries every 10 seconds from the same IP address | Wait a few seconds |

For anything else, ask in the project thread with the step you're on and
what the screen or the build log says. Never paste a secret.

## Before a public launch

- **Legal pages.** `/terms` and `/privacy` hold placeholder text. Have
  them written or reviewed by a lawyer, and add a cookie policy if you add
  analytics or ads. Tell them what the site stores: account details,
  favorites, lists and watch history, and a keyed hash of a guest's IP
  address for reports and for counting views (view rows are deleted
  after 7 days). With crash reports on (Part 10), errors also go to
  Sentry, without IP addresses, cookies or account details.
- **Catalog.** The movies and shows start as a sample catalog with
  placeholder posters. Replace them with your own titles in the admin
  panel (see [Managing titles](#managing-titles)).
- **Admin panel.** Dashboard, Library, Upload, Import, Trash, Reports
  and Users work. Setting is still a placeholder.
- **Crash reports.** Optional, but without them only Vercel's logs show
  what went wrong, and nothing tells you about errors in visitors'
  browsers. Turn them on with
  [Part 10](#part-10-optional-turn-on-crash-reports).
- **Plans and limits.** Check Vercel (Hobby is non-commercial only),
  Supabase, Resend and, with uploads on, Vercel Blob's storage and
  transfer against the traffic you expect.
