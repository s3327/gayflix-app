import { test, expect, logIn } from "./fixtures";

test("header search suggests titles from /api/search", async ({ page, consoleProblems }) => {
  void consoleProblems;
  await page.goto("/home", { waitUntil: "networkidle" });
  const apiCall = page.waitForResponse((r) => r.url().includes("/api/search?q=loud"));
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByPlaceholder("Search titles...").fill("loud");
  expect((await apiCall).ok()).toBe(true);
  await expect(page.getByRole("link", { name: /Loud Address/ })).toBeVisible();
});

test("guests are sent to login and brought back afterwards", async ({ page, consoleProblems }) => {
  void consoleProblems;
  await page.goto("/account/history");
  await expect(page).toHaveURL(/\/login\?next=%2Faccount%2Fhistory$/);
  await page.getByLabel("Email").fill("e2e@example.com");
  await page.getByLabel("Password").fill("anything");
  await page.getByRole("button", { name: "Log In" }).click();
  await expect(page).toHaveURL(/\/account\/history$/);
});

test("login ignores off-site ?next= targets", async ({ page }) => {
  await logIn(page, "https://evil.example/");
  await expect(page).toHaveURL(/\/account$/);
});

test("played episodes link back to the episode page", async ({ page, consoleProblems }) => {
  void consoleProblems;
  await logIn(page);
  await expect(page).toHaveURL(/\/account$/);
  await page.goto("/episode/the-brownstone-season-1-episode-1", { waitUntil: "networkidle" });
  await page.locator("main").getByRole("button").first().click();
  await page.goto("/account/history");
  await expect(
    page.locator('main a[href="/episode/the-brownstone-season-1-episode-1"]')
  ).toBeVisible();
});

test("dialogs trap focus, lock scroll and restore focus", async ({ page, consoleProblems }) => {
  void consoleProblems;
  await page.goto("/watch/chosen-family", { waitUntil: "networkidle" });
  const opener = page.getByRole("button", { name: "Report an issue" });
  await opener.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  }
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test("a pasted or autofilled code fills every OTP box", async ({ page }) => {
  await page.goto("/verify-email?email=a%40b.co");
  await page.getByLabel("Digit 1 of 6").fill("123456");
  for (let i = 1; i <= 6; i++) {
    await expect(page.getByLabel(`Digit ${i} of 6`)).toHaveValue(String(i));
  }
  await expect(page.getByRole("button", { name: "Verify" })).toBeEnabled();
});
