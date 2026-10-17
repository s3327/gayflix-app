import { accounts, USER_STATE } from "./accounts";
import { test, expect, logIn } from "./fixtures";

test("header search suggests titles from /api/search", async ({ page, consoleProblems }) => {
  void consoleProblems;
  await page.goto("/home", { waitUntil: "networkidle" });
  const apiCall = page.waitForResponse((r) => r.url().includes("/api/search?q=loud"));
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByPlaceholder("Search titles...").fill("loud");
  expect((await apiCall).ok()).toBe(true);
  await expect(page.getByRole("option", { name: /Loud Address/ })).toBeVisible();
});

test("header search finds what the search page finds, and leads to it", async ({ page }) => {
  await page.goto("/home");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("combobox", { name: "Search titles" }).fill("drama");
  const options = page.getByRole("listbox", { name: "Suggestions" }).getByRole("option");
  // Genres match too, not just titles.
  await expect(options).toHaveCount(7);
  const seeAll = options.last();
  await expect(seeAll).toHaveText(/^See all \d+ titles$/);
  const total = Number(/\d+/.exec((await seeAll.textContent()) ?? "")![0]);
  await seeAll.click();
  await expect(page).toHaveURL(/\/search\?q=drama$/);
  await expect(page.getByRole("main")).toContainText(`${total} titles found`);

  // A title opens its page.
  await page.getByRole("banner").getByRole("button", { name: "Search" }).click();
  await page.getByRole("combobox", { name: "Search titles" }).fill("loud");
  await page.getByRole("option", { name: /^Loud Address/ }).click();
  await expect(page).toHaveURL(/\/series\/loud-address$/);
});

test("guests are sent to login and brought back afterwards", async ({ page, consoleProblems }) => {
  void consoleProblems;
  await page.goto("/account/history");
  await expect(page).toHaveURL(/\/login\?next=%2Faccount%2Fhistory$/);
  const { user } = accounts();
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Log In" }).click();
  await expect(page).toHaveURL(/\/account\/history$/);
});

test("login ignores off-site ?next= targets", async ({ page }) => {
  await logIn(page, accounts().user, "https://evil.example/");
  await expect(page).toHaveURL(/\/account$/);
});

test.describe("signed in", () => {
  test.use({ storageState: USER_STATE });

  test("played episodes link back to the episode page", async ({ page, consoleProblems }) => {
    void consoleProblems;
    await page.goto("/episode/the-brownstone-season-1-episode-1", { waitUntil: "networkidle" });
    // Playing saves to the account in the background; let it finish
    // before leaving the page.
    const saved = page.waitForResponse(
      (r) => r.request().method() === "POST" && "next-action" in r.request().headers()
    );
    await page.locator("main").getByRole("button").first().click();
    expect((await saved).ok()).toBe(true);
    await page.goto("/account/history");
    await expect(
      page.locator('main a[href="/episode/the-brownstone-season-1-episode-1"]')
    ).toBeVisible();
  });
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
