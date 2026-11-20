import { ADMIN_STATE, createVerifiedAccount, newAccount, sql, totp } from "./accounts";
import { ADMIN_CREDENTIALS, expect, seriousViolations, signedInPage, test } from "./fixtures";

/*
 * Two-factor sign-in for members (A14): optional, off until a member
 * turns it on in Account → Setting. Then signing in with a password asks
 * for a code from the authenticator app; they can turn it off again with
 * their password. There are no backup codes: a member who loses the
 * device asks staff. Staff accounts can't turn it off while the admin
 * panel requires it.
 */

/** Whether the account has a verified TOTP factor in Supabase Auth. */
async function hasTwoFactor(email: string) {
  const [row] = await sql<{ enabled: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM auth.mfa_factors f JOIN auth.users u ON u.id = f.user_id
       WHERE u.email = $1 AND f.factor_type = 'totp' AND f.status = 'verified'
     ) AS enabled`,
    [email]
  );
  return row.enabled;
}

test("a member turns on two-factor, signs in with a code, and turns it off", async ({ browser, request }) => {
  const member = newAccount("member2fa");
  await createVerifiedAccount(request, member);
  const page = await signedInPage(browser, member);
  await page.goto("/account/setting");
  const section = page.getByRole("region", { name: "Two-factor sign-in" });
  await expect(section).toContainText("Off.");
  expect(await seriousViolations(page)).toEqual([]);

  await section.getByRole("button", { name: "Turn On Two-Factor" }).click();
  await section.getByRole("button", { name: "Continue" }).click();
  const secret = (await section.locator("code").innerText()).replace(/\s/g, "");
  await expect(section.getByRole("img", { name: "QR code for your authenticator app" })).toBeVisible();
  await section.getByLabel("Digit 1 of 6").fill(totp(secret));
  await expect(page.getByText("Two-factor sign-in is on")).toBeVisible();
  await expect(section.getByText("On", { exact: true })).toBeVisible();
  await expect(section).not.toContainText(/backup code/i);
  expect(await hasTwoFactor(member.email)).toBe(true);

  // Signing in now asks for a code; until it's entered, the member isn't signed in.
  const other = await (await browser.newContext({ storageState: { cookies: [], origins: [] } })).newPage();
  await other.goto("/login");
  await other.getByLabel("Email").fill(member.email);
  await other.getByLabel("Password").fill(member.password);
  await other.getByRole("button", { name: "Log In" }).click();
  await expect(other.getByLabel("Digit 1 of 6")).toBeVisible();
  await expect(other.getByRole("button", { name: /backup code/i })).toHaveCount(0);
  await other.getByLabel("Digit 1 of 6").fill(totp(secret) === "000000" ? "111111" : "000000");
  await expect(other.locator("main").getByRole("alert")).toHaveText(
    "That code isn't right. Check your authenticator app and try again."
  );
  await other.getByLabel("Digit 1 of 6").fill(totp(secret));
  await expect(other).toHaveURL(/\/account$/);

  // And it can be turned off, with the password.
  await section.getByRole("button", { name: "Turn Off" }).click();
  await section.getByLabel("Confirm your password to turn off two-factor").fill("not-the-password");
  await section.getByRole("button", { name: "Turn Off" }).click();
  await expect(section.getByRole("alert")).toHaveText("That password isn't right.");
  await section.getByLabel("Confirm your password to turn off two-factor").fill(member.password);
  await section.getByRole("button", { name: "Turn Off" }).click();
  await expect(page.getByText("Two-factor sign-in is off")).toBeVisible();
  await expect(section).toContainText("Off.");
  expect(await hasTwoFactor(member.email)).toBe(false);
});

test("staff accounts can't turn two-factor off", async ({ browser }) => {
  const context = await browser.newContext({ httpCredentials: ADMIN_CREDENTIALS, storageState: ADMIN_STATE });
  const page = await context.newPage();
  await page.goto("/account/setting");
  const section = page.getByRole("region", { name: "Two-factor sign-in" });
  await expect(section.getByText("Staff accounts keep two-factor on.")).toBeVisible();
  await expect(section.getByRole("button", { name: "Turn Off" })).toHaveCount(0);
});
