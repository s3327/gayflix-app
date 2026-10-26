import { createVerifiedAccount, newAccount, sql, waitForEmail } from "./accounts";
import { expect, logIn, test } from "./fixtures";

/*
 * Emails on new sign-ins (A14): signing in from a device an account
 * hasn't used before emails it; signing in there again doesn't.
 */

const FIREFOX_ON_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0";

async function devices(email: string) {
  return (
    await sql<{ device: string }>(
      `SELECT d.device FROM sign_in_device d JOIN "user" u ON u.id = d."userId" WHERE u.email = $1 ORDER BY d.device`,
      [email]
    )
  ).map((row) => row.device);
}

test("a sign-in from a new device emails the account, once", async ({ browser, request }) => {
  const account = newAccount("signin-alert");
  await createVerifiedAccount(request, account);
  // Confirming the email signed in the first device: no email for that.
  await expect.poll(() => devices(account.email)).toHaveLength(1);

  const since = Date.now();
  const context = await browser.newContext({
    userAgent: FIREFOX_ON_LINUX,
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await logIn(page, account);
  await expect(page).not.toHaveURL(/\/login/);
  const email = await waitForEmail(account.email, since);
  expect(email).toContain("was just signed in to on Firefox on Linux");
  expect(email).toContain("/account/setting");
  await expect.poll(() => devices(account.email)).toContain("Firefox on Linux");

  // The same device again: known now, no new row and no email.
  const again = Date.now();
  await context.clearCookies();
  await logIn(page, account);
  await expect(page).not.toHaveURL(/\/login/);
  await page.waitForTimeout(1500);
  await expect(waitForEmail(account.email, again)).rejects.toThrow("No email");
  expect((await devices(account.email)).filter((device) => device === "Firefox on Linux")).toHaveLength(1);
});
