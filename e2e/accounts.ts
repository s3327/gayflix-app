import { createHmac } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import pg from "pg";
import { BASE_URL, OUTBOX_FILE } from "../playwright.config";

export type Account = {
  name: string;
  email: string;
  password: string;
  /** Base32 authenticator key, once two-factor is set up. */
  totpSecret?: string;
  backupCodes?: string[];
};

const ACCOUNTS_FILE = ".playwright/accounts.json";
export const USER_STATE = ".playwright/user.json";
export const ADMIN_STATE = ".playwright/admin.json";

/** A fresh, unique account (the database outlives test runs). */
export function newAccount(label: string): Account {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { name: `E2E ${label}`, email: `e2e-${label}-${id}@example.com`, password: `pw-${id}` };
}

export function saveAccounts(accounts: { user: Account; admin: Account }) {
  writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts));
}

/** The verified user and admin made by accounts.setup.ts. */
export function accounts(): { user: Account; admin: Account } {
  return JSON.parse(readFileSync(ACCOUNTS_FILE, "utf8"));
}

/**
 * The newest code or link emailed to `to` after `since` (ms), read from
 * the server's outbox file. Polls, since the server sends after
 * responding.
 */
export async function waitForEmail(to: string, since: number): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (existsSync(OUTBOX_FILE)) {
      const emails = readFileSync(OUTBOX_FILE, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { to: string; text: string; sentAt: number })
        .filter((email) => email.to === to && email.sentAt >= since);
      if (emails.length > 0) return emails[emails.length - 1].text;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`No email to ${to} arrived`);
}

export const codeFrom = (text: string) => /\b(\d{6})\b/.exec(text)?.[1] ?? "";
export const linkFrom = (text: string) => /(https?:\/\/\S+)/.exec(text)?.[1] ?? "";

/** Signs up through the API and confirms the email with the emailed code. */
export async function createVerifiedAccount(request: APIRequestContext, account: Account) {
  const headers = { Origin: BASE_URL };
  const since = Date.now();
  const signUp = await request.post("/api/auth/sign-up/email", { data: account, headers });
  if (!signUp.ok()) throw new Error(`sign-up failed: ${signUp.status()} ${await signUp.text()}`);
  const otp = codeFrom(await waitForEmail(account.email, since));
  const verify = await request.post("/api/auth/email-otp/verify-email", {
    data: { email: account.email, otp },
    headers,
  });
  if (!verify.ok()) throw new Error(`verify failed: ${verify.status()} ${await verify.text()}`);
}

/** Runs one statement against the test database; returns the rows it selects. */
export async function sql<Row = Record<string, unknown>>(query: string, params: unknown[]) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return (await client.query(query, params)).rows as Row[];
  } finally {
    await client.end();
  }
}

/** Same as `npm run make-admin -- <email>`. */
export async function grantAdmin(email: string) {
  await sql(`UPDATE "user" SET role = 'admin' WHERE email = $1`, [email]);
}

/** Makes every session of this account look `hours` old. */
export async function ageSessions(email: string, hours: number) {
  await sql(
    `UPDATE "session" SET "createdAt" = now() - make_interval(hours => $2)
     WHERE "userId" = (SELECT id FROM "user" WHERE email = $1)`,
    [email, hours]
  );
}

/** Marks every session of this account as not having passed two-factor. */
export async function unverifySessions(email: string) {
  await sql(
    `UPDATE "session" SET "twoFactorVerified" = false
     WHERE "userId" = (SELECT id FROM "user" WHERE email = $1)`,
    [email]
  );
}

/** The current 6-digit code for a base32 key, as an authenticator app shows it (RFC 6238). */
export function totp(base32Secret: string, now = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...base32Secret.toUpperCase()]
    .map((char) => alphabet.indexOf(char).toString(2).padStart(5, "0"))
    .join("");
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const hmac = createHmac("sha1", key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
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

/** Completes /admin/setup-2fa and records the authenticator key and backup codes on `account`. */
export async function setUpTwoFactor(page: Page, account: Account) {
  await expect(page).toHaveURL(/\/admin\/setup-2fa$/);
  await page.getByLabel("Confirm your password").fill(account.password);
  await page.getByRole("button", { name: "Continue" }).click();
  account.totpSecret = (await page.locator("main code").innerText()).replace(/\s/g, "");
  account.backupCodes = await page
    .getByRole("list", { name: "Backup codes" })
    .getByRole("listitem")
    .allInnerTexts();
  await page.getByLabel("Digit 1 of 6").fill(totp(account.totpSecret));
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
}
