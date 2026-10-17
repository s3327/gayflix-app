import { accounts, codeFrom, linkFrom, newAccount, waitForEmail } from "./accounts";
import { test, expect, logIn } from "./fixtures";

test("sign up, confirm the emailed code, log out", async ({ page, consoleProblems }) => {
  void consoleProblems;
  const account = newAccount("signup");
  const since = Date.now();

  await page.goto("/signup");
  await page.getByLabel("Name").fill(account.name);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Sign Up" }).click();
  await expect(page).toHaveURL(/\/verify-email\?email=/);

  // A wrong code is rejected...
  await page.getByLabel("Digit 1 of 6").fill("000000");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("That code isn't right. Check the email and try again.");

  // ...and the real one signs the user in.
  const code = codeFrom(await waitForEmail(account.email, since));
  await page.getByLabel("Digit 1 of 6").fill(code);
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/account$/);

  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Log Out" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login\?next=%2Faccount$/);
});

test("a wrong password is rejected", async ({ page }) => {
  await logIn(page, { ...accounts().user, password: "not-the-password" });
  await expect(page.locator("main").getByRole("alert")).toHaveText("That email and password don't match.");
  await expect(page).toHaveURL(/\/login$/);
});

test("logging in before confirming the email asks for the code", async ({ page, request }) => {
  const account = newAccount("unverified");
  await request.post("/api/auth/sign-up/email", { data: account });

  const since = Date.now();
  await logIn(page, account);
  await expect(page).toHaveURL(/\/verify-email\?email=.+&next=%2Faccount$/);
  const code = codeFrom(await waitForEmail(account.email, since));
  await page.getByLabel("Digit 1 of 6").fill(code);
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/account$/);
});

test("reset a forgotten password from the emailed link", async ({ page, request }) => {
  const account = newAccount("reset");
  const signUpSince = Date.now();
  await request.post("/api/auth/sign-up/email", { data: account });
  const otp = codeFrom(await waitForEmail(account.email, signUpSince));
  await request.post("/api/auth/email-otp/verify-email", { data: { email: account.email, otp } });

  const since = Date.now();
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(account.email);
  await page.getByRole("button", { name: "Send Reset Link" }).click();
  await expect(page.getByText("a password reset link is on its way")).toBeVisible();

  await page.goto(linkFrom(await waitForEmail(account.email, since)));
  await expect(page).toHaveURL(/\/reset-password\?token=/);
  await page.getByLabel("New Password").fill("a-brand-new-password");
  await page.getByRole("button", { name: "Set New Password" }).click();
  await expect(page.getByText("Your password has been changed")).toBeVisible();

  await logIn(page, { ...account, password: "a-brand-new-password" });
  await expect(page).toHaveURL(/\/account$/);
});

test("forgot-password answers the same for unknown emails", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill("nobody-here@example.com");
  await page.getByRole("button", { name: "Send Reset Link" }).click();
  await expect(page.getByText("a password reset link is on its way")).toBeVisible();
});

test("signing up again with a taken email emails the owner instead", async ({ page, request }) => {
  // Confirmed: the owner gets log-in and reset links, and no code.
  const owner = accounts().user;
  let since = Date.now();
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Someone Else");
  await page.getByLabel("Email").fill(owner.email);
  await page.getByLabel("Password").fill("another-password");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Sign Up" }).click();
  // The page can't tell, so nobody can find out who has an account.
  await expect(page).toHaveURL(/\/verify-email\?email=/);
  const notice = await waitForEmail(owner.email, since);
  expect(notice).toContain("already has an account");
  expect(notice).toContain("/login");
  expect(notice).toContain("/forgot-password");
  expect(codeFrom(notice)).toBe("");

  // Never confirmed: a fresh code, which finishes the first sign-up.
  const account = newAccount("signup-again");
  since = Date.now();
  await request.post("/api/auth/sign-up/email", { data: account });
  // The first code is sent after the response; wait for it, so it isn't
  // mistaken for the new one.
  await waitForEmail(account.email, since);
  since = Date.now();
  await request.post("/api/auth/sign-up/email", { data: account });
  const code = codeFrom(await waitForEmail(account.email, since));
  expect(code).not.toBe("");
  const verify = await request.post("/api/auth/email-otp/verify-email", {
    data: { email: account.email, otp: code },
  });
  expect(verify.ok()).toBe(true);
});
