import { sql } from "./accounts";
import { expect, seriousViolations, test } from "./fixtures";

/*
 * Smarter search (A13): close spellings when nothing matches as typed,
 * people in the header's suggestions, and this browser's recent searches.
 */

test("a typo still finds the title, on the search page and in the header", async ({ page }) => {
  await page.goto("/search?q=chosen%20famly");
  await expect(page.getByText("Nothing matched “chosen famly” exactly, so here are titles spelled like it.")).toBeVisible();
  await expect(page.getByRole("main").locator('a[href="/movie/chosen-family"]').first()).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  await page.getByRole("banner").getByRole("button", { name: "Search" }).click();
  await page.getByRole("combobox", { name: "Search titles" }).fill("chosen famly");
  await expect(page.getByText("Nothing matched exactly. Titles spelled like it:")).toBeVisible();
  await page.getByRole("option", { name: /^Chosen Family/ }).click();
  await expect(page).toHaveURL(/\/movie\/chosen-family$/);
});

test("the header suggests people named on titles", async ({ page }) => {
  const [{ director }] = await sql<{ director: string }>(
    `SELECT director FROM media WHERE id = 'chosen-family'`
  );
  await page.goto("/home");
  await page.getByRole("banner").getByRole("button", { name: "Search" }).click();
  await page.getByRole("combobox", { name: "Search titles" }).fill(director);
  const person = page.getByRole("option", { name: new RegExp(`^${director} Person`) });
  await expect(person).toBeVisible();
  await person.click();
  await expect(page).toHaveURL(`/people/${encodeURIComponent(director)}`);
  await expect(page.getByRole("heading", { name: director, level: 1 })).toBeVisible();
});

test("recent searches come back when the box opens, until they're cleared", async ({ page }) => {
  await page.goto("/home");
  const button = page.getByRole("banner").getByRole("button", { name: "Search" });
  const box = page.getByRole("combobox", { name: "Search titles" });
  await button.click();
  await box.fill("brownstone");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=brownstone$/);
  // The search page keeps its searches too.
  await page.goto("/search?q=drama");

  await button.click();
  const recent = page.getByRole("listbox", { name: "Recent searches" }).getByRole("option");
  await expect(recent).toHaveText(["drama", "brownstone"]);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=brownstone$/);

  await button.click();
  await expect(recent.first()).toHaveText("brownstone");
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByRole("listbox", { name: "Recent searches" })).toHaveCount(0);
  await expect(box).toBeFocused();
});
