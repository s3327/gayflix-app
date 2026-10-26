import { ADMIN_STATE, createVerifiedAccount, newAccount, sql, totp } from "./accounts";
import { ADMIN_CREDENTIALS, expect, seriousViolations, signedInPage, test } from "./fixtures";
import { BASE_URL } from "../playwright.config";

/*
 * Two-factor sign-in for members (A14): optional, off until a member
 * turns it on in Account → Setting. Then signing in with a password asks
 * for a code; they can get new backup codes or turn it off again. Staff
 * accounts can't turn it off, since the admin panel needs it.
 */

test("a member turns on two-factor, signs in with a code, and turns it off", async ({ browser, request }) => {
  const member = newAccount("member2fa");
  await createVerifiedAccount(request, member);
  const page = await signedInPage(browser, member);
  await page.goto("/account/setting");
  const section = page.getByRole("region", { name: "Two-factor sign-in" });
  await expect(section).toContainText("Off.");
  expect(await seriousViolations(page)).toEqual([]);

  await section.getByRole("button", { name: "Turn On Two-Factor" }).click();
  await section.getByLabel("Confirm your password").fill(member.password);
  await section.getByRole("button", { name: "Continue" }).click();
  const secret = (await section.locator("code").innerText()).replace(/\s/g, "");
  const [backupCode] = await section.getByRole("list", { name: "Backup codes" }).getByRole("listitem").allInnerTexts();
  await section.getByLabel("Digit 1 of 6").fill(totp(secret));
  await expect(page.getByText("Two-factor sign-in is on")).toBeVisible();
  await expect(section.getByText("On", { exact: true })).toBeVisible();
  const [row] = await sql<{ twoFactorEnabled: boolean }>(
    `SELECT "twoFactorEnabled" FROM "user" WHERE email = $1`,
    [member.email]
  );
  expect(row.twoFactorEnabled).toBe(true);

  // Signing in now asks for a code; a backup code works too.
  const other = await (await browser.newContext({ storageState: { cookies: [], origins: [] } })).newPage();
  await other.goto("/login");
  await other.getByLabel("Email").fill(member.email);
  await other.getByLabel("Password").fill(member.password);
  await other.getByRole("button", { name: "Log In" }).click();
  await other.getByRole("button", { name: "Use a backup code instead" }).click();
  await other.getByLabel("Backup code").fill(backupCode);
  await other.getByRole("button", { name: "Verify" }).click();
  await expect(other).toHaveURL(/\/account$/);

  // New backup codes replace the old ones.
  await section.getByRole("button", { name: "New Backup Codes" }).click();
  await section.getByLabel("Confirm your password to get new backup codes").fill(member.password);
  await section.getByRole("button", { name: "Get New Codes" }).click();
  await expect(section.getByText("Your new backup codes")).toBeVisible();

  // And it can be turned off, with the password.
  await section.getByRole("button", { name: "Turn Off" }).click();
  await section.getByLabel("Confirm your password to turn off two-factor").fill(member.password);
  await section.getByRole("button", { name: "Turn Off" }).click();
  await expect(page.getByText("Two-factor sign-in is off")).toBeVisible();
  await expect(section).toContainText("Off.");
});

test("staff accounts can't turn two-factor off", async ({ browser }) => {
  const context = await browser.newContext({ httpCredentials: ADMIN_CREDENTIALS, storageState: ADMIN_STATE });
  const page = await context.newPage();
  await page.goto("/account/setting");
  const section = page.getByRole("region", { name: "Two-factor sign-in" });
  await expect(section.getByText("Staff accounts keep two-factor on.")).toBeVisible();
  await expect(section.getByRole("button", { name: "Turn Off" })).toHaveCount(0);

  // Nor straight through the sign-in API.
  const response = await context.request.post("/api/auth/two-factor/disable", {
    data: { password: "whatever" },
    headers: { Origin: BASE_URL },
  });
  expect(response.status()).toBe(403);
});
