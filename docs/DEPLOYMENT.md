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
   - **Not Preview:** preview addresses can't sign in anyway (see
     [How deploys work](#how-deploys-work)), so they don't need the
     database.
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
   - `4 migrations found in prisma/migrations`, four
     `Applying migration ...` lines, then
     `All migrations have been successfully applied.`
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
or Prisma Console). Don't save it in a `.env` file in the project:
`npm run dev` and `npm run db:migrate` would then work on the production
database.

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

- [ ] A pull request's Vercel preview address shows the site. Signing in
      fails there, which is expected.

## Running the site

### How deploys work

- Merging into `main` deploys to production. The build
  (`scripts/vercel-build.sh`) first stops if `DATABASE_URL`,
  `BETTER_AUTH_SECRET` or `RESEND_API_KEY` is missing, then applies any
  new database migrations, then builds.
- Each pull request gets a preview address. Previews have no database
  (Part 3) and never run migrations. Sign-in doesn't work on them, because
  it only accepts the production address.
- By default, preview addresses only open for people signed in to your
  Vercel account.
- A changed environment variable only takes effect after a redeploy.

### Rolling back

In **Deployments**, open the last good production deployment and use
**Instant Rollback** (or **Promote to Production**). That brings the
code back, but not the database: migrations stay applied. Before rolling
back past a change that altered the database, ask in the project thread.

### Adding and removing admins

- **Add:** the person signs up (6.1), you make them an admin (6.2), and
  they set up two-factor on their first admin login (6.3).
- **Remove:** set their `role` back to `user` in Studio, or run
  `npm run make-admin -- them@example.com --revoke`. It applies right
  away.

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
- Don't edit tables in Studio beyond the steps in this guide.

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
| `/admin/login` says "This account doesn't have admin access." | The account's `role` isn't `admin` | Part 6.2 |
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
  analytics or ads.
- **Catalog.** The movies and shows are still the built-in sample catalog.
  The next change moves them into the database and deploys the same way:
  merge, and the build applies its migration.
- **Admin panel.** Reports is live. The other admin pages are placeholders
  or show the sample catalog until then.
- **Error reporting.** Apart from Vercel's logs, nothing tells you about
  server errors yet. Error reporting such as Sentry is in the remediation
  plan (Phase 3).
- **Plans and limits.** Check Vercel (Hobby is non-commercial only),
  Prisma Postgres and Resend against the traffic you expect.
