import {
  accounts,
  codeFrom,
  createVerifiedAccount,
  linkFrom,
  newAccount,
  sql,
  waitForEmail,
} from "./accounts";
import { test, expect, logIn } from "./fixtures";

test("sign up, confirm the emailed code, log out", async ({ page, consoleProblems }) => {
  void consoleProblems;
  const account = newAccount("signup");
  const since = Date.now();

  await page.goto("/signup");
  await page.getByLabel("Name").fill(account.name);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  // Signing up needs the age and terms box, and says so.
  await page.getByRole("button", { name: "Sign Up" }).click();
  const terms = page.getByRole("checkbox", { name: /18 or older/ });
  await expect(terms).toBeFocused();
  await expect(terms).toHaveAccessibleDescription("Tick this box to create an account.");
  await expect(page).toHaveURL(/\/signup$/);
  await terms.check();
  await page.getByRole("button", { name: "Sign Up" }).click();
  await expect(page).toHaveURL(/\/verify-email\?email=/);

  // The code goes as soon as all six digits are in. A wrong one is
  // rejected...
  const firstDigit = page.getByLabel("Digit 1 of 6");
  await expect(firstDigit).toBeFocused();
  await firstDigit.fill("000000");
  await expect(page.locator("main").getByRole("alert")).toHaveText("That code isn't right. Check the email and try again.");

  // ...and the real one signs the user in.
  const code = codeFrom(await waitForEmail(account.email, since));
  await firstDigit.fill(code);
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
  await expect(page.getByRole("link", { name: "Sign up again" })).toHaveAttribute(
    "href",
    "/signup?next=%2Faccount"
  );
  const code = codeFrom(await waitForEmail(account.email, since));
  await page.getByLabel("Digit 1 of 6").fill(code);
  await expect(page).toHaveURL(/\/account$/);
});

test("password fields can show what's typed, and Google shows only where it's set up", async ({
  page,
}) => {
  await page.goto("/signup");
  const password = page.getByLabel("Password");
  await expect(password).toHaveAccessibleDescription("At least 8 characters");
  await password.fill("secret-words");
  const show = page.getByRole("button", { name: "Show" });
  await expect(show).toHaveAttribute("aria-pressed", "false");
  await show.click();
  await expect(password).toHaveAttribute("type", "text");
  await show.click();
  await expect(password).toHaveAttribute("type", "password");
  // The e2e server has no Google credentials.
  await expect(page.getByRole("button", { name: "Continue with Google" })).toHaveCount(0);
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toHaveCount(0);
});

test("a member without a password can set one from the account page", async ({
  page,
  request,
}) => {
  const account = newAccount("google-only");
  await createVerifiedAccount(request, account);
  await logIn(page, account);
  await expect(page).toHaveURL(/\/account$/);
  // As if they'd signed up with Google: no password on the account.
  await sql(
    `DELETE FROM account WHERE "providerId" = 'credential'
     AND "userId" = (SELECT id FROM "user" WHERE email = $1)`,
    [account.email]
  );
  await page.reload();
  const main = page.locator("main");
  await expect(main.getByText("None yet: you sign in with Google")).toBeVisible();

  await main.getByRole("button", { name: "Edit Profile" }).click();
  await expect(main.getByRole("button", { name: "Change Password" })).toHaveCount(0);
  const since = Date.now();
  await main.getByRole("button", { name: "Set a Password" }).click();
  await expect(main.getByText(`We've emailed ${account.email} a link to set one.`)).toBeVisible();

  await page.goto(linkFrom(await waitForEmail(account.email, since)));
  await page.getByLabel("New Password").fill("a-password-at-last");
  await page.getByRole("button", { name: "Set New Password" }).click();
  await expect(page.getByText("Your password has been changed")).toBeVisible();
  await logIn(page, { ...account, password: "a-password-at-last" });
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
  // Both codes are sent after the response. Wait for the new one by its
  // code, not its time: the first email can carry the same millisecond as
  // a timestamp taken just after it arrives.
  const first = codeFrom(await waitForEmail(account.email, since));
  await request.post("/api/auth/sign-up/email", { data: account });
  let code = first;
  for (let attempt = 0; attempt < 50 && code === first; attempt++) {
    code = codeFrom(await waitForEmail(account.email, since));
    if (code === first) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  expect(code).not.toBe("");
  expect(code).not.toBe(first);
  const verify = await request.post("/api/auth/email-otp/verify-email", {
    data: { email: account.email, otp: code },
  });
  expect(verify.ok()).toBe(true);
});
