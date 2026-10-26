import { ADMIN_STATE, sql } from "./accounts";
import { ADMIN_CREDENTIALS, expect, guestPage, seriousViolations, test } from "./fixtures";

/*
 * Curated collections (A11): an admin builds one in /admin/collections,
 * and it shows on /collections, its own page and the home page, with
 * only its published titles, in the admin's order, within its dates.
 */

test.use({ httpCredentials: ADMIN_CREDENTIALS, storageState: ADMIN_STATE });

function uniqueId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

test("an admin curates a collection that shows on the site within its dates", async ({ page, browser }) => {
  const uid = uniqueId();
  const id = `e2e-collection-${uid}`;
  const title = `E2E Pride ${uid}`;
  const draftId = `e2e-collection-draft-${uid}`;
  const draftTitle = `E2E Collection Draft ${uid}`;
  await sql(
    `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "createdAt", "updatedAt")
     VALUES ($1, 'movie', 'draft', $2, 2001, '1h 30m', '{Drama}', 'Canada', 'French',
             'https://picsum.photos/seed/e2e-collection/500/750', now(), now())`,
    [draftId, draftTitle]
  );

  try {
    // A new collection, published and on the home page.
    await page.goto("/admin/collections");
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Address").fill(id);
    await page.getByLabel("Description").fill("Queer joy, all month long.");
    await page.getByLabel("Published").check();
    await page.getByLabel("Row on the home page").check();
    await page.getByRole("button", { name: "Add Collection" }).click();
    await expect(page).toHaveURL(`/admin/collections/${id}`);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    // First in order, so earlier runs' collections don't crowd it off the home page.
    await sql(`UPDATE collection SET position = -1 WHERE id = $1`, [id]);

    // Its titles: two published ones and a draft, then the series moved first.
    const search = async (text: string) => {
      await page.getByLabel("Search the library").fill(text);
      await page.getByRole("button", { name: "Search", exact: true }).click();
    };
    for (const [query, name] of [
      ["Chosen Family", "Chosen Family"],
      ["Brownstone", "The Brownstone"],
      [draftTitle, draftTitle],
    ]) {
      await search(query);
      await page.getByRole("button", { name: `Add ${name}`, exact: true }).click();
      await expect(page.getByRole("button", { name: `Remove ${name}` })).toBeVisible();
    }
    await expect(page.getByText("Draft, not shown")).toBeVisible();
    await page.getByRole("button", { name: "Move The Brownstone up" }).click();
    const titles = page.getByRole("region", { name: /^Titles/ }).getByRole("listitem").first();
    await expect(titles).toContainText("The Brownstone");
    expect(await seriousViolations(page)).toEqual([]);

    // Visitors see it, with only the published titles, in that order.
    const guest = await guestPage(browser);
    await guest.goto("/collections");
    await guest.getByRole("link", { name: new RegExp(title) }).click();
    await expect(guest.getByRole("heading", { name: title })).toBeVisible();
    await expect(guest.getByText("Queer joy, all month long.")).toBeVisible();
    const cards = guest.getByRole("main").locator('a[href^="/movie/"], a[href^="/series/"]');
    await expect(cards.first()).toHaveAttribute("href", "/series/the-brownstone");
    await expect(guest.getByRole("main").locator('a[href="/movie/chosen-family"]').first()).toBeVisible();
    await expect(guest.getByText(draftTitle)).toHaveCount(0);
    expect(await seriousViolations(guest)).toEqual([]);

    await guest.goto("/home");
    const row = guest.locator("section").filter({ has: guest.getByRole("heading", { name: title }) });
    await expect(row.getByRole("link", { name: "See More" })).toHaveAttribute("href", `/collections/${id}`);

    // Past its last day, it's gone.
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await page.getByLabel("Show until").fill(yesterday);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
    const gone = await guest.goto(`/collections/${id}`);
    expect(gone?.status()).toBe(404);
    await guest.goto("/collections");
    await expect(guest.getByRole("link", { name: new RegExp(title) })).toHaveCount(0);

    // Deleting it asks first.
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("dialog", { name: "Delete Collection" }).getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL("/admin/collections");
    await expect(page.getByText(`Deleted "${title}".`)).toBeVisible();
  } finally {
    await sql(`DELETE FROM collection WHERE id = $1`, [id]);
    await sql(`DELETE FROM media WHERE id = $1`, [draftId]);
  }
});
