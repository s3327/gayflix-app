import { codeFrom, createVerifiedAccount, newAccount, waitForEmail } from "./accounts";
import { test, expect, logIn } from "./fixtures";

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
