import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { ADMIN_CREDENTIALS } from "./fixtures";

const PUBLIC_PAGES = [
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
];

async function seriousViolations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s) — ${v.help}`);
}

for (const path of PUBLIC_PAGES) {
  test(`${path} has no serious accessibility violations`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });
    expect(await seriousViolations(page)).toEqual([]);
  });
}

test.describe("admin", () => {
  test.use({ httpCredentials: ADMIN_CREDENTIALS });
  for (const path of ["/admin/login", "/admin/library/movies", "/admin/setting"]) {
    test(`${path} has no serious accessibility violations`, async ({ page }) => {
      await page.goto(path, { waitUntil: "networkidle" });
      expect(await seriousViolations(page)).toEqual([]);
    });
  }
});
