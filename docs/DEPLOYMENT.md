# Deploying Gayflix

This guide takes Gayflix from this GitHub repository to a live site with
real accounts, a database, email and a secured admin panel. Follow the
parts in order. Each step says what you should see, so you know it worked
before you move on.

**What you end up with**

- The site on Vercel, first at a `.vercel.app` address and later on your
  own domain.
- A Prisma Postgres database for accounts, favorites, lists, watch history
  and reports.
- Sign-up codes and password-reset emails sent through Resend.
- Your own admin account, protected by a password and an authenticator
  app.

> **Keep secrets out of chats, issues and the repository.** The database
> connection string, `BETTER_AUTH_SECRET`, API keys and your backup codes
> go only into Vercel's environment variables and your password manager.

## Checklist

- [ ] [Part 1: Get the accounts and tools ready](#part-1-get-the-accounts-and-tools-ready)
- [ ] [Part 2: Create the Vercel project](#part-2-create-the-vercel-project)
- [ ] [Part 3: Add the database](#part-3-add-the-database)
- [ ] [Part 4: Add the secret and the email key](#part-4-add-the-secret-and-the-email-key)
- [ ] [Part 5: Deploy the version with accounts](#part-5-deploy-the-version-with-accounts)
- [ ] [Part 6: Create your admin account](#part-6-create-your-admin-account)
- [ ] [Part 7: Use your own domain and email address](#part-7-use-your-own-domain-and-email-address)
- [ ] [Part 8 (optional): Turn on Google sign-in](#part-8-optional-turn-on-google-sign-in)
- [ ] [Part 9: Check that everything works](#part-9-check-that-everything-works)
- [ ] [Part 10 (optional): Turn on crash reports](#part-10-optional-turn-on-crash-reports)
- [ ] [Part 11 (optional): Turn on poster uploads](#part-11-optional-turn-on-poster-uploads)

Then keep [Running the site](#running-the-site),
[Troubleshooting](#troubleshooting) and
[Before a public launch](#before-a-public-launch) at hand.

## Part 1: Get the accounts and tools ready

| What | What it's for | Cost |
|---|---|---|
| GitHub account with access to `s3327/gayflix-app` | Vercel deploys from it | You have it |
| Vercel account ([vercel.com](https://vercel.com), sign up with GitHub) | Hosting | The Hobby plan is free but only for personal, non-commercial sites. A site with ads or paid plans needs Pro. |
| Resend account ([resend.com](https://resend.com)) | Sign-up codes and password-reset emails | Free plan with daily and monthly sending limits |
| Prisma account | The database | Created for you when you add the database from Vercel (Part 3). Free plan available. |
| An authenticator app on your phone (1Password, Google Authenticator, Authy, Microsoft Authenticator, ...) | Admin two-factor sign-in | Free |
| A password manager | The secret, your admin password and backup codes | |
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

1. In your Vercel project, open the **Storage** tab.
2. Click **Create Database** and choose **Prisma Postgres**.
3. Follow the prompts:
   - **Region:** the one closest to where Vercel runs the site's server
     code. Vercel's default is Washington, D.C. (`iad1`), so choose US East
     (N. Virginia) unless you changed it under **Settings → Functions**.
   - **Plan:** the free plan is fine to start.
   - **Name:** for example `gayflix`.
4. When Vercel asks which environments to connect the database to, choose
   **Production** only:
   - **Not Development:** tools such as `vercel env pull` would copy the
     production database's address onto your computer, where a single
     `npm run db:migrate` could wipe it.
   - **Not Preview:** every pull request's preview would then run its
     unmerged code against your real data. Without the database, a
     preview shows only the pages that don't need it (see
     [How deploys work](#how-deploys-work)).
5. Open **Settings → Environment Variables**.

**You should see** `DATABASE_URL` listed for Production, with a value that
starts with `postgres://`. If it's also listed for Preview or Development,
change the connection's environments in the Storage tab so it only applies
to Production.

You don't create any tables yourself. The deploy in Part 5 does that.

*If you'd rather create the database at [console.prisma.io](https://console.prisma.io):*
create a Prisma Postgres database there, copy its direct connection string
(the one starting with `postgres://`, not `prisma+postgres://`), and add
it in Vercel as `DATABASE_URL` for Production, marked **Sensitive**.

## Part 4: Add the secret and the email key

Each of these goes in **Settings → Environment Variables**. Enter the
name, paste the value, pick the environments listed, tick **Sensitive**,
and save.

### 4.1 `BETTER_AUTH_SECRET`

This signs everyone's login cookies and encrypts admins' two-factor keys.

1. Make a random value on your computer, with one of these:
   - Mac or Linux terminal: `openssl rand -base64 32`
   - Any computer with Node.js:
     `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
   - Your password manager's generator, set to at least 40 random
     characters.
2. Add it as `BETTER_AUTH_SECRET` for **Production**, and save a copy in
   your password manager.
3. Make a **second, different** value and add it as `BETTER_AUTH_SECRET`
   for **Preview**. Without it, preview addresses show error pages
   instead of the site.

**Treat the production value as permanent.** Changing it later signs
everyone out and breaks every admin's two-factor sign-in (see
[Changing the secret](#changing-the-secret)).

### 4.2 `RESEND_API_KEY`

1. Sign up at [resend.com](https://resend.com).
2. Open **API Keys** → **Create API Key**. Name it `gayflix-production`
   and give it **Sending access**.
3. Copy the key. It starts with `re_` and is shown only once.
4. Add it as `RESEND_API_KEY` for **Production**.

### 4.3 `EMAIL_FROM`: leave it for now

Leave `EMAIL_FROM` unset until you verify a domain in Resend (Part 7).
Until then, emails come from Resend's test address, which only delivers to
**the email address you signed up to Resend with**. That's enough to create
your admin account, as long as you use that same address in Part 6.

### 4.4 Optional: an extra password in front of `/admin`

`ADMIN_BASIC_AUTH_USER` and `ADMIN_BASIC_AUTH_PASSWORD` add a browser
password prompt in front of the admin panel, on top of the admin account
and two-factor. Set both or neither: with only one set, the admin panel is
turned off and says so.

### Summary

| Variable | Production | Preview | Development |
|---|---|---|---|
| `DATABASE_URL` | ✅ added in Part 3 | | |
| `BETTER_AUTH_SECRET` | ✅ | ✅ a different value | |
| `RESEND_API_KEY` | ✅ | | |
| `EMAIL_FROM` | Part 7 | | |
| `SITE_URL` | Part 7 | | |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Part 8 (optional) | | |
| `ADMIN_BASIC_AUTH_USER`, `ADMIN_BASIC_AUTH_PASSWORD` | Optional, both or neither | | |
| `IMAGE_HOSTS` | Optional, for posters on your own image host (see [Managing titles](#managing-titles)) and for imports (see [Importing titles](#importing-titles)) | | |
| `TMDB_API_KEY`, `OMDB_API_KEY` | Optional, for the Import page (see [Importing titles](#importing-titles)) | | |
| `NEXT_PUBLIC_SENTRY_DSN` | Part 10 (optional) | | |
| `BLOB_READ_WRITE_TOKEN` | Part 11 (optional), added by Vercel | | |

`BETTER_AUTH_URL` isn't needed. It follows `SITE_URL`, or Vercel's
production address when `SITE_URL` isn't set.

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
   - `... migrations found in prisma/migrations`, an
     `Applying migration ...` line for each one the database doesn't have
     yet (all of them on the first deploy), then
     `All migrations have been successfully applied.` A deploy with no
     new migrations says `No pending migrations to apply.` instead.
   - the Next.js build, ending with a list of routes.
5. When the deployment says **Ready**, open the site.

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

1. In Vercel's **Storage** tab, open the database and follow its link to
   Prisma Console (or sign in at
   [console.prisma.io](https://console.prisma.io)).
2. Open the database's **Studio**.
3. Open the `user` table and find the row with your email.
4. Change its `role` from `user` to `admin` (lowercase, exactly) and save.

If your database page has a SQL editor instead (such as the data editor
in Vercel's Storage tab), run this with your own email:

```sql
UPDATE "user" SET "role" = 'admin' WHERE "email" = 'you@example.com';
```

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

Copy the connection string from the database's page (Vercel's Storage tab
or Prisma Console). Both can keep it hidden once it's created; if you
can't see it, use Option A, which doesn't need it. Don't save it in a
`.env` file in the project: `npm run dev` and `npm run db:migrate` would
then work on the production database.

**You should see** `you@example.com is now an admin.`

### 6.3 Turn on two-factor

1. Open `https://<your site>/admin/login` and log in with the same email
   and password.
2. You land on **Set up two-factor sign-in**. Enter your password again
   and click **Continue**.
3. Scan the QR code with your authenticator app, or type in the key shown
   under it.
4. **Save the backup codes** in your password manager. They're shown only
   once. Each one gets you in once if you lose your phone.
5. Enter the 6-digit code from the app and click **Turn on two-factor**.

**You should see** the admin dashboard.

From now on:

- Every admin sign-in asks for a code from the app, or a backup code.
- An admin sign-in lasts 12 hours. After that, you sign in again.
- 10 wrong codes in a row lock two-factor sign-in for 15 minutes.
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

This matters because sign-up and sign-in only accept requests from this
address. Links in emails, the sitemap and link previews use it too.
Visitors on any other address (the `.vercel.app` one, or a `www` that
isn't redirected) can browse but can't sign in.

### 7.3 Send email from your domain

1. In Resend, open **Domains** → **Add Domain**. Enter your domain, or a
   subdomain such as `mail.gayflix.com`.
2. Resend lists a few DNS records (for SPF, DKIM and bounces; a DMARC
   record is recommended). Add each one exactly as shown where your
   domain's DNS is managed: usually your registrar, or Vercel's
   **Domains** page if you bought the domain through Vercel.
3. Click **Verify** in Resend and wait until the domain shows
   **Verified**.
4. Add `EMAIL_FROM` for Production with an address on that domain, e.g.
   `Gayflix <no-reply@gayflix.com>`.
5. Redeploy.

**You should see** sign-up codes arrive at any email address, not just your
Resend one.

## Part 8 (optional): Turn on Google sign-in

1. Open [console.cloud.google.com](https://console.cloud.google.com) and
   create a project, e.g. "Gayflix".
2. Set up the consent screen (under **Google Auth Platform**, or **APIs &
   Services → OAuth consent screen**):
   - App name **Gayflix**, your support email, audience **External**.
   - Your domain under authorized domains.
   - Links to `https://<your site>/privacy` and `https://<your site>/terms`.
3. Create an OAuth client of type **Web application**:
   - Authorized JavaScript origins: `https://<your site>`
   - Authorized redirect URIs:
     `https://<your site>/api/auth/callback/google`

   Use exactly the address in `SITE_URL`.
4. Copy the client ID and client secret.
5. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for Production
   (Sensitive), then redeploy.
6. Publish the app (on the **Audience** page) so anyone can use it, not
   only test users. Sign-in that only asks for name and email doesn't need
   a review by Google.

**You should see** "Continue with Google" working on `/login` and
`/signup`. Google sign-in never opens the admin panel: admins always use
their password and a code.

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
- [ ] Log out, use **Forgot password**, and reset it from the email link.
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

## Running the site

### How deploys work

- Merging into `main` deploys to production. The build
  (`scripts/vercel-build.sh`) first stops if `DATABASE_URL`,
  `BETTER_AUTH_SECRET` or `RESEND_API_KEY` is missing, then applies any
  new database migrations, then builds.
- Each pull request gets a preview address. Previews have no database
  (Part 3) and never run migrations, so only the pages that don't need
  the database work there, such as the landing page and the legal pages.
  Pages with titles (home, title pages, listings, search) show an error
  page. Sign-in doesn't work either, because it only accepts the
  production address. The pull request's **check** runs the end-to-end
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
  applies right away. Setting their `role` back to `user` in Studio, or
  `npm run make-admin -- them@example.com --revoke`, still works too.
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

- **To get in once:** at `/admin/login`, after your password, choose
  **Use a backup code instead**.
- **To move two-factor to a new phone,** or if no backup codes are left:
  1. In Studio, open the `user` table, find the account and copy its
     `id`.
  2. In the `twoFactor` table, delete the row whose `userId` is that id.
  3. Back in the `user` table, set that account's `twoFactorEnabled` to
     `false` and save.
  4. Log in at `/admin/login`. You go through the two-factor setup (6.3)
     again.

### Backups

Check which backups your Prisma Postgres plan includes, on the database's
page in Prisma Console. To keep your own copy, use `pg_dump` with the
connection string. Its version must be at least the database's Postgres
version:

```bash
pg_dump '<production connection string>' --format=custom --file=gayflix-backup.dump
```

Keep backups private: they hold everyone's account data.

### Logs and email delivery

- **Vercel → Logs** shows server errors, such as "Email provider rejected
  the message". On the Hobby plan, logs are kept only for a short time.
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

- Never run `npm run db:migrate` (`prisma migrate dev`) against
  production. It's for your local database and can reset the database it
  runs on. Production only ever gets `npm run db:deploy`, which the build
  runs for you.
- Never connect the production database to Vercel's Development
  environment, and never put its address in a `.env` file.
- Don't edit tables in Studio or a SQL editor beyond the steps in this
  guide.

### Changing the secret

Only change the production `BETTER_AUTH_SECRET` if it leaked. Afterwards:

- everyone is signed out;
- every admin's two-factor stops working, so reset it as in
  [Lost phone or authenticator app](#lost-phone-or-authenticator-app) and
  set it up again;
- today's guest report limits start over.

## Troubleshooting

| What you see | Likely cause | Fix |
|---|---|---|
| The build stops with "`DATABASE_URL` is not set" (or another name) | That variable is missing for Production | Add it (Parts 3 and 4), then redeploy |
| The build fails at the migrations with `P1001` or "Can't reach database server" | Wrong or outdated connection string | Copy the connection string from the database's page again, update `DATABASE_URL`, redeploy |
| Most pages show an error page | `BETTER_AUTH_SECRET` is missing for that environment | Add it (4.1), redeploy |
| The sign-up code never arrives | Wrong `RESEND_API_KEY`; or no verified domain and the address isn't your Resend email; or `EMAIL_FROM` isn't on the verified domain | Check Resend → Emails and Vercel → Logs; fix the key or finish 7.3 |
| Sign-in fails on one address but works on another | Only the `SITE_URL` address can sign in (`.vercel.app` and `www` count as other addresses) | Use the main address, redirect the others in **Settings → Domains**, check `SITE_URL` |
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
| Google says `redirect_uri_mismatch` | The redirect URI doesn't match the site's address exactly | Add `https://<your site>/api/auth/callback/google` with the `SITE_URL` address |
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
  Prisma Postgres, Resend and, with uploads on, Vercel Blob's storage and
  transfer against the traffic you expect.
