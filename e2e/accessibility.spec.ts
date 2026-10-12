import { test, expect } from "@playwright/test";
import { ADMIN_STATE, USER_STATE } from "./accounts";
import { ADMIN_CREDENTIALS, seriousViolations } from "./fixtures";

const PUBLIC_PAGES = [
  "/",
  "/home",
  "/trending",
  "/genre",
  "/movie/chosen-family",
  "/series/the-brownstone",
  "/watch/chosen-family",
  "/search?q=loud",
  "/login",
  "/signup",
  "/verify-email?email=a%40b.co",
  "/forgot-password",
  "/reset-password?error=INVALID_TOKEN",
];

for (const path of PUBLIC_PAGES) {
  test(`${path} has no serious accessibility violations`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });
    expect(await seriousViolations(page)).toEqual([]);
  });
}

test.describe("account", () => {
  test.use({ storageState: USER_STATE });
  for (const path of ["/account", "/account/history", "/account/setting"]) {
    test(`${path} has no serious accessibility violations`, async ({ page }) => {
      await page.goto(path, { waitUntil: "networkidle" });
      expect(await seriousViolations(page)).toEqual([]);
    });
  }
});

test.describe("admin", () => {
  test.use({ httpCredentials: ADMIN_CREDENTIALS, storageState: ADMIN_STATE });
  for (const path of [
    "/admin/login",
    "/admin/library/movies",
    "/admin/library/series/the-brownstone",
    "/admin/library/episodes",
    "/admin/library/episodes/the-brownstone-season-1-episode-1",
    "/admin/upload/movies",
    "/admin/import?q=E2E+Many&by=title&type=movie",
    "/admin/upload/movies?tmdb=movie%2F990003",
    "/admin/upload/episodes?series=the-brownstone",
    "/admin/trash",
    "/admin/setting",
    "/admin/reports",
  ]) {
    test(`${path} has no serious accessibility violations`, async ({ page }) => {
      await page.goto(path, { waitUntil: "networkidle" });
      expect(await seriousViolations(page)).toEqual([]);
    });
  }
});
