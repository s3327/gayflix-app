import { BASE_URL } from "../playwright.config";
import { expect, seriousViolations, test } from "./fixtures";

/*
 * The cookie notice (A15): shown until OK, then never again in that
 * browser; never in the admin panel. The other tests' browsers have said
 * OK already (fixtures.ts); this one asks to see it.
 */

test("the cookie notice shows until it's dismissed", async ({ page, context }) => {
  await context.addCookies([{ name: "e2e-cookie-notice", value: "show", url: BASE_URL }]);
  await page.goto("/home");
  const notice = page.getByRole("region", { name: "Cookie notice" });
  await expect(notice).toContainText("We use one cookie, only to keep you signed in");
  await expect(notice.getByRole("link", { name: "Learn more" })).toHaveAttribute("href", "/privacy#cookies");
  expect(await seriousViolations(page)).toEqual([]);

  await notice.getByRole("button", { name: "OK" }).click();
  await expect(notice).toHaveCount(0);
  await page.goto("/movie");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(notice).toHaveCount(0);
});
