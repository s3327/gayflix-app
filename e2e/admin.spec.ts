import { test as base, expect } from "@playwright/test";
import { accounts, ADMIN_STATE, USER_STATE } from "./accounts";
import { ADMIN_CREDENTIALS } from "./fixtures";

const test = base;

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
      await page.goto("/admin/library/movies");
      await expect(page).toHaveURL(/\/admin\/login$/);
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
  });
});
