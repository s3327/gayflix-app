import AxeBuilder from "@axe-core/playwright";
import { test as base, expect, type APIRequestContext, type Browser } from "@playwright/test";
import {
  accounts,
  adminPasswordStep,
  ADMIN_STATE,
  ageSessions,
  createVerifiedAccount,
  grantAdmin,
  newAccount,
  setUpTwoFactor,
  totp,
  unverifySessions,
  USER_STATE,
} from "./accounts";
import { ADMIN_CREDENTIALS, guestPage } from "./fixtures";

const test = base;

/** A fresh admin account, signed in and through two-factor setup, in its own browser. */
async function newAdmin(browser: Browser, request: APIRequestContext) {
  const admin = newAccount("admin2fa");
  await createVerifiedAccount(request, admin);
  await grantAdmin(admin.email);
  const context = await browser.newContext({ httpCredentials: ADMIN_CREDENTIALS });
  const page = await context.newPage();
  await adminPasswordStep(page, admin);
  await setUpTwoFactor(page, admin);
  return { admin, page };
}

test("the admin panel asks for the admin password", async ({ request }) => {
  const response = await request.get("/admin/dashboard");
  expect(response.status()).toBe(401);
  expect(response.headers()["www-authenticate"]).toContain("Basic");
});

test.describe("with the admin password", () => {
  test.use({ httpCredentials: ADMIN_CREDENTIALS });

  test("guests are sent to the admin login", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test("the login form never puts the password in the URL", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill("nobody@example.com");
    await page.getByLabel("Password").fill("hunter2-wrong");
    await page.getByRole("button", { name: "Log In" }).click();
    await expect(page.locator("main").getByRole("alert")).toHaveText("That email and password don't match.");
    expect(page.url()).not.toContain("hunter2");
  });

  test.describe("signed in as a regular user", () => {
    test.use({ storageState: USER_STATE });

    test("can't reach admin pages", async ({ page }) => {
      for (const path of [
        "/admin/library/movies",
        "/admin/import?q=E2E+Harbor+Lights",
        "/admin/upload/movies?tmdb=movie%2F990001",
      ]) {
        await page.goto(path);
        await expect(page).toHaveURL(/\/admin\/login$/);
      }
    });

    test("is told the account isn't an admin", async ({ page }) => {
      const { user } = accounts();
      await page.goto("/admin/login");
      await page.getByLabel("Email").fill(user.email);
      await page.getByLabel("Password").fill(user.password);
      await page.getByRole("button", { name: "Log In" }).click();
      await expect(page.locator("main").getByRole("alert")).toHaveText("This account doesn't have admin access.");
    });
  });

  test.describe("signed in as an admin", () => {
    test.use({ storageState: ADMIN_STATE });

    test("pages load, are noindex, and the sidebar navigates", async ({ page }) => {
      const response = await page.goto("/admin/dashboard");
      expect(response?.status()).toBe(200);
      expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
      await page.getByRole("link", { name: "Import" }).first().click();
      await expect(page).toHaveURL(/\/admin\/import$/);
    });

    test("/admin goes straight to the dashboard", async ({ page }) => {
      await page.goto("/admin");
      await expect(page).toHaveURL(/\/admin\/dashboard$/);
    });

    test("can resolve and reopen reports", async ({ browser, page }) => {
      const details = `e2e report ${Date.now()}`;
      const guest = await guestPage(browser);
      await guest.goto("/watch/chosen-family", { waitUntil: "networkidle" });
      await guest.getByRole("button", { name: "Report an issue" }).click();
      await guest.getByLabel("What's the issue?").selectOption("Wrong video for this title");
      await guest.getByLabel("Additional details (optional)").fill(details);
      await guest.getByRole("button", { name: "Submit" }).click();
      await expect(guest.getByText("Report submitted")).toBeVisible();

      await page.goto("/admin/reports");
      const open = page.getByRole("listitem").filter({ hasText: details });
      await expect(open).toContainText("Chosen Family");
      await expect(open).toContainText("Wrong video for this title");
      await expect(open).toContainText("Guest");
      await open.getByRole("button", { name: "Resolve report on Chosen Family" }).click();
      await expect(open).toBeHidden();

      await page.getByRole("link", { name: "Resolved" }).click();
      const resolved = page.getByRole("listitem").filter({ hasText: details });
      await expect(resolved).toContainText(`Resolved by ${accounts().admin.email}`);
      await resolved.getByRole("button", { name: "Reopen report on Chosen Family" }).click();
      await expect(resolved).toBeHidden();
    });

    test("can use the admin API", async ({ page }) => {
      const response = await page.request.get("/api/auth/admin/list-users");
      expect(response.status()).toBe(200);
    });
  });

  test("a new admin sets up two-factor before seeing the panel", async ({ browser, request }) => {
    const admin = newAccount("admin-setup");
    await createVerifiedAccount(request, admin);
    await grantAdmin(admin.email);
    const page = await (await browser.newContext({ httpCredentials: ADMIN_CREDENTIALS })).newPage();
    await adminPasswordStep(page, admin);
    await expect(page).toHaveURL(/\/admin\/setup-2fa$/);
    await page.goto("/admin/library/movies");
    await expect(page).toHaveURL(/\/admin\/setup-2fa$/);
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);

    await page.getByLabel("Confirm your password").fill("not-the-password");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator("main").getByRole("alert")).toHaveText("That password isn't right.");
    await expect(page.getByRole("list", { name: "Backup codes" })).toBeHidden();
    await setUpTwoFactor(page, admin);
  });

  test("admins sign in with an authenticator code or a backup code", async ({ browser, request }) => {
    const { admin } = await newAdmin(browser, request);
    const page = await (await browser.newContext({ httpCredentials: ADMIN_CREDENTIALS })).newPage();

    await adminPasswordStep(page, admin);
    await page.getByLabel("Digit 1 of 6").fill(totp(admin.totpSecret!) === "000000" ? "111111" : "000000");
    await expect(page.locator("main").getByRole("alert")).toHaveText(
      "That code isn't right. Check your authenticator app and try again."
    );
    await page.getByLabel("Digit 1 of 6").fill(totp(admin.totpSecret!));
    await expect(page).toHaveURL(/\/admin\/dashboard$/);

    // The same password-then-code step is on the public login page, and
    // each backup code works once.
    const [backupCode] = admin.backupCodes!;
    for (const attempt of ["first use", "second use"]) {
      await page.context().clearCookies();
      await page.goto("/login");
      await page.getByLabel("Email").fill(admin.email);
      await page.getByLabel("Password").fill(admin.password);
      await page.getByRole("button", { name: "Log In" }).click();
      await page.getByRole("button", { name: "Use a backup code instead" }).click();
      await page.getByLabel("Backup code").fill(backupCode);
      await page.getByRole("button", { name: "Verify" }).click();
      if (attempt === "first use") {
        await expect(page).toHaveURL(/\/account$/);
      } else {
        await expect(page.locator("main").getByRole("alert")).toHaveText(
          "That backup code isn't right, or it has already been used."
        );
      }
    }
  });

  test("admin sign-ins last 12 hours", async ({ browser, request }) => {
    const { admin, page } = await newAdmin(browser, request);
    await ageSessions(admin.email, 13);
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/admin\/login$/);
    // Still signed in on the public site.
    await page.goto("/account");
    await expect(page).toHaveURL(/\/account$/);
  });

  test("a session that skipped two-factor can't use the panel or the admin API", async ({
    browser,
    request,
  }) => {
    const { admin, page } = await newAdmin(browser, request);
    await unverifySessions(admin.email);
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/admin\/login$/);
    const response = await page.request.get("/api/auth/admin/list-users");
    expect(response.status()).toBe(403);
  });
});
