import {
  accounts,
  codeFrom,
  confirmSignUp,
  createVerifiedAccount,
  newAccount,
  signUpUnverified,
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
  await expect(page.locator("main").getByRole("alert")).toHaveText(
    "That code isn't right, or it has expired. Check the email, or send a new code."
  );

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
  // Logging in sends a fresh code, which replaces the sign-up one; the
  // newest email is read only after it has gone.
  const since = Date.now();
  await signUpUnverified(request, account);

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

// Account settings move to Supabase Auth in their own step (Task 9 of
// the Supabase plan): a Google-only member is one without an "email"
// identity, and "Set a Password" sends a reset code. Rewritten there.
test.fixme("a member without a password can set one from the account page", async () => {});

test("reset a forgotten password with the emailed code", async ({ page, request }) => {
  const account = newAccount("reset");
  await createVerifiedAccount(request, account);

  const since = Date.now();
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(account.email);
  await page.getByRole("button", { name: "Send Reset Code" }).click();
  await expect(page).toHaveURL(/\/reset-password\?email=/);
  await expect(page.getByText("we've emailed it a 6-digit code")).toBeVisible();

  // A wrong code changes nothing...
  await page.getByLabel("Digit 1 of 6").fill("000000");
  await page.getByLabel("New Password").fill("a-brand-new-password");
  await page.getByRole("button", { name: "Set New Password" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("That code isn't right");

  // ...and the emailed one sets the new password.
  await page.getByLabel("Digit 1 of 6").fill(codeFrom(await waitForEmail(account.email, since)));
  await page.getByRole("button", { name: "Set New Password" }).click();
  await expect(page.getByText("Your password has been changed")).toBeVisible();

  await logIn(page, account);
  await expect(page.locator("main").getByRole("alert")).toHaveText("That email and password don't match.");
  await logIn(page, { ...account, password: "a-brand-new-password" });
  await expect(page).toHaveURL(/\/account$/);
});

test("forgot-password answers the same for unknown emails", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill("nobody-here@example.com");
  await page.getByRole("button", { name: "Send Reset Code" }).click();
  await expect(page).toHaveURL(/\/reset-password\?email=/);
  await expect(page.getByText("we've emailed it a 6-digit code")).toBeVisible();
});

test("signing up again with a taken email reveals nothing, and finishes an unconfirmed sign-up", async ({
  page,
  request,
}) => {
  // Confirmed: the page can't tell, so nobody can find out who has an
  // account, and Supabase emails nothing.
  const owner = accounts().user;
  let since = Date.now();
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Someone Else");
  await page.getByLabel("Email").fill(owner.email);
  await page.getByLabel("Password").fill("another-password");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Sign Up" }).click();
  await expect(page).toHaveURL(/\/verify-email\?email=/);
  await expect(waitForEmail(owner.email, since)).rejects.toThrow(/No email/);

  // Never confirmed: a fresh code, which finishes the first sign-up.
  const account = newAccount("signup-again");
  since = Date.now();
  await signUpUnverified(request, account);
  const first = codeFrom(await waitForEmail(account.email, since));
  // Supabase sends at most one sign-up email a second per address.
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await signUpUnverified(request, account);
  let code = first;
  for (let attempt = 0; attempt < 50 && code === first; attempt++) {
    code = codeFrom(await waitForEmail(account.email, since));
    if (code === first) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  expect(code).not.toBe("");
  expect(code).not.toBe(first);
  expect((await confirmSignUp(request, account.email, code)).ok()).toBe(true);
});
