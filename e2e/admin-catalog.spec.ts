import type { Page } from "@playwright/test";
import { ADMIN_STATE, sql } from "./accounts";
import { ADMIN_CREDENTIALS, expect, test } from "./fixtures";

/*
 * The admin title editor (src/lib/admin-catalog-actions.ts). Every test
 * makes titles of its own and deletes them after; none touches the
 * sample catalog, which other tests read. Nothing here features a title:
 * that would take the home page's hero away from Chosen Family.
 */

const POSTER = "https://picsum.photos/seed/e2e-admin/500/750";

/** Letters, digits and dashes only, so a title's address is predictable. */
function uniqueId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** The fields every title needs. */
async function fillTitle(page: Page, title: string, runtime?: string) {
  const main = page.locator("main");
  await main.getByLabel("Title", { exact: true }).fill(title);
  await main.getByLabel("Year").fill("2024");
  if (runtime) await main.getByLabel("Runtime in minutes").fill(runtime);
  await main.getByLabel("Genres").fill("Drama, Comedy");
  await main.getByLabel("Country").fill("Canada");
  await main.getByLabel("Language").fill("English");
  await main.getByLabel("Poster image link").fill(POSTER);
}

test.describe("admin title editor", () => {
  test.use({ httpCredentials: ADMIN_CREDENTIALS, storageState: ADMIN_STATE });

  test("adds a movie as a draft, publishes it, then trashes, restores and deletes it", async ({
    page,
    request,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const title = `E2E Movie ${uid}`;
    const id = `e2e-movie-${uid}`;
    const main = page.locator("main");
    try {
      await page.goto("/admin/library/movies");
      await main.getByRole("link", { name: "Add a movie" }).click();
      await expect(page).toHaveURL(/\/admin\/upload\/movies$/);
      await fillTitle(page, title, "95");
      await main.getByRole("button", { name: "Add movie" }).click();

      await expect(page).toHaveURL(`/admin/library/movies/${id}?added=1`);
      await expect(main.getByRole("status")).toHaveText(
        "Added as a draft. Set its status to Published when it's ready."
      );
      expect((await request.get(`/movie/${id}`)).status()).toBe(404);

      await main.getByLabel("Status").selectOption("published");
      await main.getByLabel("Title", { exact: true }).fill(`${title} Redux`);
      await main.getByRole("button", { name: "Save changes" }).click();
      await expect(main.getByText("Saved.", { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${title} Redux`);

      await page.goto(`/movie/${id}`);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(`${title} Redux`);
      await expect(page.getByText("95 min")).toBeVisible();

      // A row's own buttons.
      await page.goto(`/admin/library/movies?q=${uid}`);
      const row = page.getByRole("row", { name: new RegExp(uid) });
      await expect(row).toContainText("Published");
      await row.getByRole("button", { name: /^Unpublish / }).click();
      await expect(row).toContainText("Draft");
      expect((await request.get(`/movie/${id}`)).status()).toBe(404);
      await row.getByRole("button", { name: /^Publish / }).click();
      await expect(row).toContainText("Published");
      await row.getByRole("button", { name: /to trash$/ }).click();
      await expect(row).toHaveCount(0);
      expect((await request.get(`/movie/${id}`)).status()).toBe(404);

      // Restored titles come back with their previous status (Published).
      await page.goto("/admin/trash");
      const trashed = main.getByRole("listitem").filter({ hasText: uid });
      await expect(trashed).toContainText("Movie · 2024 · Moved to the trash");
      await trashed.getByRole("button", { name: /^Restore / }).click();
      await expect(trashed).toHaveCount(0);
      await page.goto(`/admin/library/movies/${id}`);
      await expect(main.locator("span").filter({ hasText: "Published" })).toBeVisible();

      // In the trash, a title can only be restored or deleted.
      await main.getByRole("button", { name: "Move to trash", exact: true }).click();
      await expect(main.getByText("This title is in the trash")).toBeVisible();
      await expect(main.getByRole("button", { name: "Save changes" })).toHaveCount(0);

      await page.goto("/admin/trash");
      await trashed.getByRole("button", { name: /for good$/ }).click();
      await page
        .getByRole("dialog", { name: "Delete for good?" })
        .getByRole("button", { name: "Delete for good" })
        .click();
      await expect(trashed).toHaveCount(0);
      expect(await sql(`SELECT id FROM media WHERE id = $1`, [id])).toEqual([]);
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [id]);
    }
  });

  test("refuses a poster from a site that isn't allowed, keeping what was typed", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const title = `E2E Refused ${uniqueId()}`;
    const main = page.locator("main");
    await page.goto("/admin/upload/movies");
    await fillTitle(page, title, "80");
    await main.getByLabel("Poster image link").fill("https://images.example.invalid/poster.jpg");
    await main.getByRole("button", { name: "Add movie" }).click();

    await expect(main.getByRole("alert")).toHaveText("Some fields need fixing. They're marked above.");
    // The first field to fix gets the focus.
    await expect(main.getByLabel("Poster image link")).toBeFocused();
    await expect(main.getByLabel("Poster image link")).toHaveAttribute("aria-invalid", "true");
    await expect(main.getByText(/^Images can only come from /)).toBeVisible();
    await expect(main.getByLabel("Title", { exact: true })).toHaveValue(title);
    await expect(main.getByLabel("Runtime in minutes")).toHaveValue("80");
    await expect(page).toHaveURL(/\/admin\/upload\/movies$/);
    expect(await sql(`SELECT id FROM media WHERE title = $1`, [title])).toEqual([]);
  });

  test("adds a series and its episodes, then edits and deletes an episode", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const id = `e2e-series-${uid}`;
    const main = page.locator("main");
    try {
      await page.goto("/admin/upload/series");
      await fillTitle(page, `E2E Series ${uid}`);
      await main.getByLabel("Status").selectOption("published");
      await main.getByRole("button", { name: "Add series" }).click();
      await expect(page).toHaveURL(`/admin/library/series/${id}?added=1`);
      await expect(main.getByRole("status")).toHaveText(
        "Added and published. Next, add its episodes below."
      );
      await expect(main.getByText("No episodes yet.")).toBeVisible();

      await main.getByRole("link", { name: "Add an episode" }).click();
      await expect(page).toHaveURL(`/admin/upload/episodes?series=${id}`);
      await expect(main.getByLabel("Series")).toHaveValue(id);
      await expect(main.getByLabel("Season")).toHaveValue("1");
      await expect(main.getByLabel("Episode", { exact: true })).toHaveValue("1");

      await main.getByLabel("Title", { exact: true }).fill("Pilot");
      await main.getByLabel("Length in minutes").fill("42");
      await main.getByRole("button", { name: "Add episode" }).click();
      await expect(main.getByRole("status")).toHaveText("Added season 1, episode 1.");
      // Ready for the next one.
      await expect(main.getByLabel("Episode", { exact: true })).toHaveValue("2");
      await expect(main.getByLabel("Title", { exact: true })).toHaveValue("");

      await main.getByLabel("Title", { exact: true }).fill("Second Act");
      await main.getByRole("button", { name: "Add episode" }).click();
      await expect(main.getByRole("status")).toHaveText("Added season 1, episode 2.");

      await main.getByLabel("Episode", { exact: true }).fill("2");
      await main.getByLabel("Title", { exact: true }).fill("Twice");
      await main.getByRole("button", { name: "Add episode" }).click();
      await expect(main.getByText("Season 1 already has an episode 2.")).toBeVisible();

      await page.goto(`/series/${id}`);
      await expect(page.getByText("Second Act")).toBeVisible();

      // Moving an episode to another season updates the series' card.
      await page.goto(`/admin/library/series/${id}`);
      await main.getByRole("link", { name: /Second Act/ }).click();
      await expect(page).toHaveURL(`/admin/library/episodes/${id}-season-1-episode-2`);
      await main.getByLabel("Season").fill("2");
      await main.getByLabel("Episode", { exact: true }).fill("1");
      await main.getByRole("button", { name: "Save changes" }).click();
      await expect(main.getByRole("status")).toHaveText("Saved.");
      await page.goto(`/admin/library/series?q=${uid}`);
      await expect(page.getByRole("row", { name: new RegExp(uid) })).toContainText(
        "2 Seasons · 2 Episodes"
      );

      await page.goto(`/admin/library/episodes/${id}-season-1-episode-2`);
      await main.getByRole("button", { name: "Delete episode" }).click();
      await page
        .getByRole("dialog", { name: "Delete this episode?" })
        .getByRole("button", { name: "Delete episode" })
        .click();
      await expect(page).toHaveURL(`/admin/library/series/${id}`);
      await expect(main.getByRole("link", { name: /Pilot/ })).toBeVisible();
      await expect(main.getByRole("link", { name: /Second Act/ })).toHaveCount(0);
      expect(await sql(`SELECT duration FROM media WHERE id = $1`, [id])).toEqual([
        { duration: "1 Season" },
      ]);
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [id]);
    }
  });

  test("publishes and trashes the checked rows", async ({ page }) => {
    const uid = uniqueId();
    const ids = [`e2e-bulk-a-${uid}`, `e2e-bulk-b-${uid}`];
    for (const [index, id] of ids.entries()) {
      await sql(
        `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "updatedAt")
         VALUES ($1, 'movie', 'draft', $2, 2026, '1h 30m', ARRAY['Drama'], 'Canada', 'French', $3, now())`,
        [id, `E2E Bulk ${index === 0 ? "A" : "B"} ${uid}`, POSTER]
      );
    }
    try {
      await page.goto(`/admin/library/movies?q=${uid}`);
      const rows = page.getByRole("row", { name: new RegExp(uid) });
      await expect(rows).toHaveCount(2);
      await page.getByLabel("Select all").check();
      await page.getByRole("button", { name: "Publish", exact: true }).click();
      await expect(rows.filter({ hasText: "Published" })).toHaveCount(2);

      await page.getByLabel(`Select E2E Bulk A ${uid}`).check();
      await page.getByRole("button", { name: "Move to trash", exact: true }).click();
      await expect(rows).toHaveCount(1);
      await expect(rows).toContainText(`E2E Bulk B ${uid}`);
      expect(
        await sql(`SELECT id, status FROM media WHERE id = ANY($1) AND "trashedAt" IS NOT NULL`, [ids])
      ).toEqual([{ id: ids[0], status: "draft" }]);
    } finally {
      await sql(`DELETE FROM media WHERE id = ANY($1)`, [ids]);
    }
  });

  test("edit pages fix the type in the address and explain a missing title", async ({ page }) => {
    await page.goto("/admin/library/movies/the-brownstone");
    await expect(page).toHaveURL(/\/admin\/library\/series\/the-brownstone$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("The Brownstone");

    await page.goto("/admin/library/movies/no-such-title");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Not in the library");
  });

  test("featuring a draft does not replace the live home page hero", async ({ page }) => {
    const uid = uniqueId();
    const id = `e2e-draft-hero-${uid}`;
    const title = `E2E Draft Hero ${uid}`;
    try {
      await page.goto("/admin/upload/movies");
      await fillTitle(page, title, "90");
      await page.getByLabel("Feature on the home page").check();
      await page.getByRole("button", { name: "Add movie" }).click();

      await expect(page).toHaveURL(new RegExp(`/admin/library/movies/${id}`));
      const hero = await sql<{ id: string }>(`SELECT id FROM media WHERE status = 'published' AND featured = true LIMIT 1`, []);
      expect(hero.length).toBeGreaterThan(0);
      expect(hero[0].id).not.toBe(id);
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [id]);
    }
  });
});
