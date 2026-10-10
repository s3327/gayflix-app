import { test as base, expect, type Page } from "@playwright/test";
import type { Account } from "./accounts";

export const ADMIN_CREDENTIALS = { username: "e2e-admin", password: "e2e-password" };

/**
 * Every test page fails the test on uncaught errors, CSP violations and
 * hydration mismatches. Failed resource loads are ignored: poster images
 * come from a third-party placeholder service that may be unreachable.
 */
export const test = base.extend<{ consoleProblems: string[] }>({
  consoleProblems: async ({ page }, provide) => {
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() !== "error" && message.type() !== "warning") return;
      const text = message.text();
      if (text.startsWith("Failed to load resource")) return;
      problems.push(text);
    });
    await provide(problems);
    expect(problems, "console errors, CSP violations or hydration errors").toEqual([]);
  },
});

export { expect };

/** Logs in through the login form (optionally with a ?next= target). */
export async function logIn(page: Page, account: Account, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Log In" }).click();
}
