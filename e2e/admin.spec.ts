import { test as base, expect } from "@playwright/test";
import { ADMIN_CREDENTIALS } from "./fixtures";

const test = base;

test("the admin panel asks for the admin password", async ({ request }) => {
  const response = await request.get("/admin/dashboard");
  expect(response.status()).toBe(401);
  expect(response.headers()["www-authenticate"]).toContain("Basic");
});

test.describe("with the admin password", () => {
  test.use({ httpCredentials: ADMIN_CREDENTIALS });

  test("pages load, are noindex, and the sidebar navigates", async ({ page }) => {
    const response = await page.goto("/admin/dashboard");
    expect(response?.status()).toBe(200);
    expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    await page.getByRole("link", { name: "Import" }).first().click();
    await expect(page).toHaveURL(/\/admin\/import$/);
  });

  test("the login form never puts the password in the URL", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill("admin@example.com");
    await page.getByLabel("Password").fill("hunter2");
    await page.getByRole("button", { name: "Log In" }).click();
    await expect(page.getByRole("status")).toBeVisible();
    expect(page.url()).not.toContain("hunter2");
  });
});
