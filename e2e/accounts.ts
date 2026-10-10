import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { APIRequestContext } from "@playwright/test";
import pg from "pg";
import { BASE_URL, OUTBOX_FILE } from "../playwright.config";

export type Account = { name: string; email: string; password: string };

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

/** Same as `npm run make-admin -- <email>`. */
export async function grantAdmin(email: string) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`UPDATE "user" SET role = 'admin' WHERE email = $1`, [email]);
  } finally {
    await client.end();
  }
}
