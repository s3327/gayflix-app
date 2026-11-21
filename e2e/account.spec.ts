import {
  codeFrom,
  createVerifiedAccount,
  grantAdmin,
  newAccount,
  sql,
  waitForEmail,
} from "./accounts";
import { test, expect, logIn, seriousViolations, signedInPage } from "./fixtures";

test("edit the profile: name, email (with a code) and password", async ({ page, request, consoleProblems }) => {
  void consoleProblems;
  const account = newAccount("profile");
  await createVerifiedAccount(request, account);
  await logIn(page, account);
  await expect(page).toHaveURL(/\/account$/);
  const main = page.locator("main");
  await expect(main.getByText(account.email)).toBeVisible();

  // Display name
  await main.getByRole("button", { name: "Edit Profile" }).click();
  await main.getByLabel("Display Name").fill("Renamed Person");
  await main.getByRole("button", { name: "Save" }).click();
  await expect(main.getByText("Renamed Person")).toBeVisible();

  // Email: the password, then a code goes to each address (both are
  // needed), and the old address is told once it has changed.
  const newEmail = account.email.replace("@", "+new@");
  await main.getByRole("button", { name: "Edit Profile" }).click();
  await main.getByRole("button", { name: "Change Email" }).click();
  await main.getByLabel("New email").fill(newEmail);
  await main.getByLabel("Current password").fill("not-my-password");
  await main.getByRole("button", { name: "Continue" }).click();
  await expect(main.getByRole("alert")).toHaveText("That password isn't right.");
  const since = Date.now();
  await main.getByLabel("Current password").fill(account.password);
  await main.getByRole("button", { name: "Continue" }).click();
  const currentCode = codeFrom(await waitForEmail(account.email, since));
  const newCode = codeFrom(await waitForEmail(newEmail, since));
  await main
    .getByRole("group", { name: "Code from your current email" })
    .getByLabel("Digit 1 of 6")
    .fill(currentCode);
  await main.getByRole("group", { name: "Code from your new email" }).getByLabel("Digit 1 of 6").fill(newCode);
  const confirmedAt = Date.now();
  await main.getByRole("button", { name: "Confirm Email" }).click();
  await expect(main.getByText(`Email changed to ${newEmail}`)).toBeVisible();
  const notice = await waitForEmail(account.email, confirmedAt);
  expect(notice).toContain(`changed to ${newEmail}`);

  // Password: a wrong current password is rejected, the right one works.
  await main.getByRole("button", { name: "Change Password" }).click();
  await main.getByLabel("Current password").fill("not-my-password");
  await main.getByLabel("New password", { exact: true }).fill("my-new-password");
  await main.getByLabel("Confirm new password").fill("my-new-password");
  await main.getByRole("button", { name: "Continue" }).click();
  await expect(main.getByRole("alert")).toHaveText("That password isn't right.");
  await main.getByLabel("Current password").fill(account.password);
  await main.getByRole("button", { name: "Continue" }).click();
  await expect(main.getByText("Password changed")).toBeVisible();

  // The new email and password are what logs in now.
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Log Out" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await logIn(page, { ...account, email: newEmail, password: "my-new-password" });
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.locator("main").getByText("Renamed Person")).toBeVisible();
});

// That the email change can't skip the password, and deleting needs it,
// is checked on the server actions themselves (src/lib/account-actions.test.ts):
// the tests can't call a server action without the page.

test("see where the account is signed in, and sign other devices out", async ({
  page,
  browser,
  request,
  consoleProblems,
}) => {
  void consoleProblems;
  const account = newAccount("devices");
  // Confirming the email (straight with Supabase Auth) starts a session:
  // the oldest of three.
  await createVerifiedAccount(request, account);
  const otherBrowser = await signedInPage(browser, account);
  await logIn(page, account, "/account/setting");
  await expect(page).toHaveURL(/\/account\/setting$/);

  // This device first, then the most recently used.
  const devices = page.getByRole("region", { name: "Signed-in devices" }).getByRole("listitem");
  await expect(devices).toHaveCount(3);
  await expect(devices.first()).toContainText("This device");
  // Named from the browser that signed in, not from this server.
  await expect(devices.first()).toContainText("Chrome on Windows");
  await expect(devices.first().getByRole("button", { name: "Sign Out" })).toHaveCount(0);

  await devices.nth(1).getByRole("button", { name: "Sign Out" }).click();
  await expect(devices).toHaveCount(2);
  await otherBrowser.goto("/account");
  await expect(otherBrowser).toHaveURL(/\/login/);
  await otherBrowser.context().close();

  await page.getByRole("button", { name: "Sign Out All Other Devices" }).click();
  await expect(devices).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Sign Out All Other Devices" })).toHaveCount(0);
  // So was the first session.
  const sessions = await sql(
    `SELECT s.id FROM auth.sessions s JOIN auth.users u ON u.id = s.user_id WHERE u.email = $1`,
    [account.email]
  );
  expect(sessions).toHaveLength(1);
});

test("delete the account with its password", async ({ page, request, consoleProblems }) => {
  void consoleProblems;
  const account = newAccount("delete");
  await createVerifiedAccount(request, account);
  await logIn(page, account, "/account/setting");
  await expect(page).toHaveURL(/\/account\/setting$/);

  await page.locator("main").getByRole("button", { name: "Delete Account" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete your account?" });
  await expect(dialog.getByLabel("Your password")).toBeFocused();
  expect(await seriousViolations(page)).toEqual([]);
  await dialog.getByLabel("Your password").fill("not-my-password");
  await dialog.getByRole("button", { name: "Delete Forever" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("That password isn't right.");

  await dialog.getByLabel("Your password").fill(account.password);
  await dialog.getByRole("button", { name: "Delete Forever" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("status").filter({ hasText: "Your account has been deleted." })).toBeVisible();
  await expect(page.getByRole("banner").getByRole("link", { name: "Log in" })).toBeVisible();
  expect(await sql(`SELECT id FROM auth.users WHERE email = $1`, [account.email])).toEqual([]);

  // The account is gone, so its email and password no longer log in.
  await logIn(page, account);
  await expect(page.locator("main").getByRole("alert")).toHaveText("That email and password don't match.");
});

test("admin accounts can't be deleted", async ({ page, request }) => {
  const account = newAccount("keep");
  await createVerifiedAccount(request, account);
  await grantAdmin(account.email);

  // The page says why instead of offering the button.
  await logIn(page, account, "/account/setting");
  await expect(page.locator("main").getByText(/^Admin accounts can't be deleted/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete Account" })).toHaveCount(0);
  expect(await sql(`SELECT id FROM auth.users WHERE email = $1`, [account.email])).toHaveLength(1);
});
