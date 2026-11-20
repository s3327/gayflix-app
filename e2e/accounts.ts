import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import pg from "pg";
import { totp } from "../src/test/totp";

export { totp };

export type Account = {
  name: string;
  email: string;
  password: string;
  /** Base32 authenticator key, once two-factor is set up. */
  totpSecret?: string;
};

const ACCOUNTS_FILE = ".playwright/accounts.json";
export const USER_STATE = ".playwright/user.json";
export const ADMIN_STATE = ".playwright/admin.json";

/** A fresh, unique account (the database outlives test runs). */
export function newAccount(label: string): Account {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { name: `E2E ${label}`, email: `e2e-${label}-${id}@example.com`, password: `pw-${id}` };
}

/** Records the setup's user or admin, keeping the other one (accounts.setup.ts makes them one at a time). */
export function saveAccount(role: "user" | "admin", account: Account) {
  // The user is made first, so it starts the file afresh.
  const saved = role === "user" || !existsSync(ACCOUNTS_FILE) ? {} : JSON.parse(readFileSync(ACCOUNTS_FILE, "utf8"));
  writeFileSync(ACCOUNTS_FILE, JSON.stringify({ ...saved, [role]: account }));
}

/** The verified user and admin made by accounts.setup.ts. */
export function accounts(): { user: Account; admin: Account } {
  return JSON.parse(readFileSync(ACCOUNTS_FILE, "utf8"));
}

/**
 * The newest email to `to` sent after `since` (ms), as text, read from
 * the Supabase local stack's Mailpit, which catches Supabase Auth's
 * emails (sign-up and password-reset codes). Polls, since Auth sends
 * after responding.
 */
export async function waitForEmail(to: string, since: number): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const [newest] = await mailpitMessages(to, since);
    if (newest) {
      const message = await fetch(`${MAILPIT}/api/v1/message/${newest.ID}`);
      if (message.ok) return ((await message.json()) as { Text: string }).Text;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`No email to ${to} arrived in Mailpit`);
}

/**
 * Fails if any email to `to` sent after `since` has arrived after
 * `withinMs` (Auth sends inside its own request, so a short wait is
 * enough; polling waitForEmail to its end would take far longer).
 */
export async function expectNoEmail(to: string, since: number, withinMs = 2000) {
  await new Promise((resolve) => setTimeout(resolve, withinMs));
  expect(await mailpitMessages(to, since)).toEqual([]);
}

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54424";

/** Mailpit's messages to `to` created at or after `since`, newest first. */
async function mailpitMessages(to: string, since: number) {
  const search = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
  if (!search.ok) return [];
  const { messages } = (await search.json()) as { messages?: { ID: string; Created: string }[] };
  return (messages ?? [])
    .filter((message) => new Date(message.Created).getTime() >= since)
    .sort((a, b) => new Date(b.Created).getTime() - new Date(a.Created).getTime());
}

export const codeFrom = (text: string) => /\b(\d{6})\b/.exec(text)?.[1] ?? "";

/**
 * Supabase Auth's own API, as the site's server actions call it (the
 * tests can't call server actions directly). Same publishable key as
 * the server, from the environment.
 */
function authApi(path: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const apikey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !apikey) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY for e2e.");
  return { url: `${url}/auth/v1/${path}`, headers: { apikey } };
}

/** Signs up without confirming the email (Supabase emails a code). */
export async function signUpUnverified(request: APIRequestContext, account: Account) {
  const { url, headers } = authApi("signup");
  const response = await request.post(url, {
    headers,
    data: { email: account.email, password: account.password, data: { name: account.name } },
  });
  if (!response.ok()) throw new Error(`sign-up failed: ${response.status()} ${await response.text()}`);
}

/** Confirms a sign-up with the emailed code. */
export async function confirmSignUp(request: APIRequestContext, email: string, code: string) {
  const { url, headers } = authApi("verify");
  return request.post(url, { headers, data: { type: "signup", email, token: code } });
}

/** Signs up and confirms the email with the emailed code. */
export async function createVerifiedAccount(request: APIRequestContext, account: Account) {
  const since = Date.now();
  await signUpUnverified(request, account);
  const verify = await confirmSignUp(request, account.email, codeFrom(await waitForEmail(account.email, since)));
  if (!verify.ok()) throw new Error(`verify failed: ${verify.status()} ${await verify.text()}`);
}

/** Runs one statement against the test database; returns the rows it selects. */
export async function sql<Row = Record<string, unknown>>(query: string, params: unknown[] = []) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return (await client.query(query, params)).rows as Row[];
  } finally {
    await client.end();
  }
}

/** Makes the account an admin (its role lives in `profile`). */
export async function grantAdmin(email: string) {
  await sql(`UPDATE profile SET role = 'admin' WHERE id = (SELECT id FROM auth.users WHERE email = $1)`, [email]);
}

/**
 * Makes every sign-in of this account look `hours` old: Supabase Auth
 * keeps each session's sign-in times (password, TOTP) in
 * auth.mfa_amr_claims, and puts them in every token it issues (the
 * `amr` claim, which src/lib/session.ts reads). The browser's token only
 * changes when it's refreshed: see expireAccessToken().
 */
export async function ageSessions(email: string, hours: number) {
  await sql(
    `UPDATE auth.mfa_amr_claims SET created_at = created_at - make_interval(hours => $2),
       updated_at = updated_at - make_interval(hours => $2)
     WHERE session_id IN (SELECT s.id FROM auth.sessions s JOIN auth.users u ON u.id = s.user_id WHERE u.email = $1)`,
    [email, hours]
  );
}

/**
 * Marks the page's session token as expired, so the next request
 * refreshes it (src/proxy.ts) and gets a token with what the database
 * says now. The cookie holds the session as base64url JSON, maybe split
 * into numbered chunks.
 */
export async function expireAccessToken(page: Page) {
  const context = page.context();
  const all = await context.cookies();
  const chunks = all
    .filter((cookie) => /^sb-.*-auth-token(\.\d+)?$/.test(cookie.name))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
  if (chunks.length === 0) throw new Error("No session cookie to expire");
  const raw = chunks.map((cookie) => cookie.value).join("");
  const session = JSON.parse(Buffer.from(raw.replace(/^base64-/, ""), "base64url").toString("utf8"));
  session.expires_at = Math.floor(Date.now() / 1000) - 60;
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  const base = chunks[0].name.replace(/\.\d+$/, "");
  for (const chunk of chunks) await context.clearCookies({ name: chunk.name });
  // Split as @supabase/ssr splits it (3180 characters a cookie).
  const parts = value.match(/.{1,3180}/g) ?? [value];
  await context.addCookies(
    parts.map((part, i) => ({ ...chunks[0], name: parts.length === 1 ? base : `${base}.${i}`, value: part }))
  );
}

/**
 * Logs in at /admin/login with email and password only. Admins with
 * two-factor get the code step next; admins without it get sent to set
 * it up.
 */
export async function adminPasswordStep(page: Page, account: Account) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Log In" }).click();
}

/** Completes /admin/setup-2fa and records the authenticator key on `account`. */
export async function setUpTwoFactor(page: Page, account: Account) {
  await expect(page).toHaveURL(/\/admin\/setup-2fa$/);
  await page.getByRole("button", { name: "Continue" }).click();
  account.totpSecret = (await page.locator("main code").innerText()).replace(/\s/g, "");
  await page.getByLabel("Digit 1 of 6").fill(totp(account.totpSecret));
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
}
