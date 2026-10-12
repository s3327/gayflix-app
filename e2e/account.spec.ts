import { BASE_URL } from "../playwright.config";
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

  // Email: confirm the current one, then a code goes to the new one.
  const newEmail = account.email.replace("@", "+new@");
  await main.getByRole("button", { name: "Edit Profile" }).click();
  await main.getByRole("button", { name: "Change Email" }).click();
  await main.getByLabel("Current email").fill(account.email);
  await main.getByRole("button", { name: "Continue" }).click();
  const since = Date.now();
  await main.getByLabel("New email").fill(newEmail);
  await main.getByRole("button", { name: "Continue" }).click();
  await main.getByLabel("Digit 1 of 6").fill(codeFrom(await waitForEmail(newEmail, since)));
  await expect(main.getByText(`Email changed to ${newEmail}`)).toBeVisible();

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

test("see where the account is signed in, and sign other devices out", async ({
  page,
  browser,
  request,
  consoleProblems,
}) => {
  void consoleProblems;
  const account = newAccount("devices");
  // Confirming the email signs `request` in: the oldest of three sessions.
  await createVerifiedAccount(request, account);
  const otherBrowser = await signedInPage(browser, account);
  await logIn(page, account, "/account/setting");
  await expect(page).toHaveURL(/\/account\/setting$/);

  // This device first, then the most recently used.
  const devices = page.getByRole("region", { name: "Signed-in devices" }).getByRole("listitem");
  await expect(devices).toHaveCount(3);
  await expect(devices.first()).toContainText("This device");
  await expect(devices.first().getByRole("button", { name: "Sign Out" })).toHaveCount(0);

  await devices.nth(1).getByRole("button", { name: "Sign Out" }).click();
  await expect(devices).toHaveCount(2);
  await otherBrowser.goto("/account");
  await expect(otherBrowser).toHaveURL(/\/login/);
  await otherBrowser.context().close();

  await page.getByRole("button", { name: "Sign Out All Other Devices" }).click();
  await expect(devices).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Sign Out All Other Devices" })).toHaveCount(0);
  // So was `request`.
  expect(await (await request.get("/api/auth/get-session")).json()).toBeNull();
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
  expect(await sql(`SELECT id FROM "user" WHERE email = $1`, [account.email])).toEqual([]);

  // The account is gone, so its email and password no longer log in.
  await logIn(page, account);
  await expect(page.locator("main").getByRole("alert")).toHaveText("That email and password don't match.");
});

test("deleting an account needs its password, and admin accounts can't be deleted", async ({
  page,
  request,
}) => {
  const account = newAccount("keep");
  // Confirming the email signs `request` in.
  await createVerifiedAccount(request, account);
  const headers = { Origin: BASE_URL };

  // The page asks for the password, and so does the server.
  const noPassword = await request.post("/api/auth/delete-user", { data: {}, headers });
  expect(noPassword.status()).toBe(400);
  expect((await noPassword.json()).message).toBe("Enter your password to delete your account.");

  await grantAdmin(account.email);
  const asAdmin = await request.post("/api/auth/delete-user", {
    data: { password: account.password },
    headers,
  });
  expect(asAdmin.status()).toBe(400);
  expect((await asAdmin.json()).message).toMatch(/^Admin accounts can't be deleted/);
  expect(await sql(`SELECT id FROM "user" WHERE email = $1`, [account.email])).toHaveLength(1);

  // The page says why instead of offering the button.
  await logIn(page, account, "/account/setting");
  await expect(page.locator("main").getByText(/^Admin accounts can't be deleted/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete Account" })).toHaveCount(0);
});
