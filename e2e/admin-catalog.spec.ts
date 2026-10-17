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

      await expect(page).toHaveURL(`/admin/library/movies/${id}`);
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
      await expect(page).toHaveURL(`/admin/library/series/${id}`);
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

test.describe("bulk season table editor and slug management", () => {
  test.use({ httpCredentials: ADMIN_CREDENTIALS, storageState: ADMIN_STATE });

  async function seedSeriesWithEpisodes(seriesId: string, title: string, episodeCount = 3) {
    await sql(
      `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "createdAt", "updatedAt")
       VALUES ($1, 'series', 'published', $2, 2024, '1 Season', ARRAY['Drama'], 'Canada', 'English', 'https://picsum.photos/seed/e2e/500/750', now(), now())`,
      [seriesId, title]
    );
    for (let i = 1; i <= episodeCount; i++) {
      const epId = `${seriesId}-season-1-episode-${i}`;
      await sql(
        `INSERT INTO episode (id, "mediaId", "seasonNumber", "episodeNumber", title, duration, "stillUrl")
         VALUES ($1, $2, 1, $3, $4, '45 min', 'https://image.tmdb.org/t/p/w300/mock-still-s1e1.jpg')`,
        [epId, seriesId, i, `Episode ${i}`]
      );
    }
  }

  // Tier 1: Feature Coverage (>=5 cases)

  test("T1-Catalog-1: season table editor displays all episodes of a season in an editable table format", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-table-disp-${uid}`;
    await seedSeriesWithEpisodes(seriesId, `E2E Table Display ${uid}`, 3);
    try {
      await page.goto(`/admin/library/series/${seriesId}`);
      const editor = page.getByRole("region", { name: /season table editor|season 1/i }).or(
        page.locator("section").filter({ hasText: /season 1/i })
      );
      await expect(editor.getByRole("textbox").or(editor.getByRole("row")).first()).toBeVisible();

      // Ensure 3 episodes are present in table rows
      const rows = editor.getByRole("row").filter({ hasText: /episode/i });
      await expect(rows).toHaveCount(3);
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  test("T1-Catalog-2: performs inline batch edits across multiple episodes and saves all changes at once", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-batch-edit-${uid}`;
    await seedSeriesWithEpisodes(seriesId, `E2E Batch Edit ${uid}`, 3);
    try {
      await page.goto(`/admin/library/series/${seriesId}`);
      const editor = page.locator("section").filter({ hasText: /season 1|episodes/i });

      // Inline edits on episode titles & runtimes
      const titleInput1 = page.locator("input[value='Episode 1']");
      await titleInput1.fill("Pilot Revamped");

      const titleInput2 = page.locator("input[value='Episode 2']");
      await titleInput2.fill("Second Flight");

      // Save season
      const saveBtn = editor.getByRole("button", { name: /save season|save changes/i }).first();
      await saveBtn.click();
      await expect(page.getByText(/saved/i).first()).toBeVisible();

      // Verify database updated in batch
      const eps = await sql<{ episodeNumber: number; title: string }>(
        `SELECT "episodeNumber", title FROM episode WHERE "mediaId" = $1 ORDER BY "episodeNumber"`,
        [seriesId]
      );
      expect(eps[0].title).toBe("Pilot Revamped");
      expect(eps[1].title).toBe("Second Flight");
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  test("T1-Catalog-3: renumbering swaps episode numbers, keeps each episode's address, and saves again", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-renumber-${uid}`;
    await seedSeriesWithEpisodes(seriesId, `E2E Renumber ${uid}`, 3);
    const numbers = () =>
      sql<{ id: string; episodeNumber: number }>(
        `SELECT id, "episodeNumber" FROM episode WHERE "mediaId" = $1 ORDER BY id`,
        [seriesId]
      );
    try {
      await page.goto(`/admin/library/series/${seriesId}`);
      const editor = page.getByRole("region", { name: "Season table editor Season 1" });
      const numberOf = (n: number) => editor.getByRole("row").filter({ hasText: `Episode ${n}` }).getByLabel("Episode");
      const save = editor.getByRole("button", { name: /save season|save changes/i }).first();

      // Swap 1 and 2.
      await numberOf(1).fill("2");
      await numberOf(2).fill("1");
      await save.click();
      await expect(editor.getByText("Saved.")).toBeVisible();
      expect(await numbers()).toEqual([
        { id: `${seriesId}-season-1-episode-1`, episodeNumber: 2 },
        { id: `${seriesId}-season-1-episode-2`, episodeNumber: 1 },
        { id: `${seriesId}-season-1-episode-3`, episodeNumber: 3 },
      ]);

      // Shift 3 to 4, from the same page without reloading.
      await numberOf(3).fill("4");
      await save.click();
      await expect(editor.getByText("Saved.")).toBeVisible();
      expect((await numbers())[2]).toEqual({ id: `${seriesId}-season-1-episode-3`, episodeNumber: 4 });

      // The address still opens the episode, now numbered 4.
      await page.goto(`/episode/${seriesId}-season-1-episode-3`);
      await expect(page).toHaveURL(new RegExp(`/episode/${seriesId}-season-1-episode-3$`));
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  test("T1-Catalog-4: renumbering an episode keeps its video sources", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-mig-src-${uid}`;
    await seedSeriesWithEpisodes(seriesId, `E2E Mig Src ${uid}`, 3);
    const slug = `${seriesId}-season-1-episode-2`;
    const sourceId = `src-${uid}`;

    // Attach video source to Episode 2
    await sql(
      `INSERT INTO video_source (id, "episodeId", label, kind, url, position, enabled, "updatedAt")
       VALUES ($1, $2, 'Server 1', 'embed'::video_source_kind, 'https://player.e2e.example/embed/1', 1, true, now())`,
      [sourceId, slug]
    );

    try {
      await page.goto(`/admin/library/series/${seriesId}`);
      const editor = page.getByRole("region", { name: "Season table editor Season 1" });
      const ep2Row = editor.getByRole("row").filter({ hasText: /Episode 2/ });
      await ep2Row.getByLabel("Episode").fill("4");

      const saveBtn = editor.getByRole("button", { name: /save season|save changes/i }).first();
      await saveBtn.click();
      await expect(editor.getByText("Saved.")).toBeVisible();

      const [src] = await sql<{ episodeId: string }>(`SELECT "episodeId" FROM video_source WHERE id = $1`, [sourceId]);
      expect(src.episodeId).toBe(slug);
      const [episode] = await sql<{ episodeNumber: number }>(`SELECT "episodeNumber" FROM episode WHERE id = $1`, [slug]);
      expect(episode.episodeNumber).toBe(4);
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  test("T1-Catalog-5: episode list searchable combobox filters episodes by series", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-combo-filter-${uid}`;
    await seedSeriesWithEpisodes(seriesId, `E2E Series Filter ${uid}`, 2);
    try {
      await page.goto("/admin/library/episodes");
      const seriesSelect = page.getByLabel("Series");
      await seriesSelect.selectOption(seriesId);
      await page.getByRole("button", { name: "Show" }).click();

      // Only the selected series episodes are displayed
      const rows = page.getByRole("row").filter({ hasText: uid });
      await expect(rows).toHaveCount(2);
      await expect(rows.first()).toContainText(`E2E Series Filter ${uid}`);
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  test("T1-Catalog-6: episode list title search filters episodes by title text", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-txt-search-${uid}`;
    await seedSeriesWithEpisodes(seriesId, `E2E Text Search ${uid}`, 3);
    // Custom unique title for episode 3
    const customTitle = `Distinct Episode Title ${uid}`;
    await sql(
      `UPDATE episode SET title = $1 WHERE id = $2`,
      [customTitle, `${seriesId}-season-1-episode-3`]
    );
    try {
      await page.goto(`/admin/library/episodes?series=${seriesId}`);
      const searchInput = page.getByPlaceholder(/search|filter/i).or(page.getByLabel(/search by title|title/i));
      if (await searchInput.isVisible()) {
        await searchInput.fill(uid);
        await page.keyboard.press("Enter");
        const rows = page.getByRole("row").filter({ hasText: uid });
        await expect(rows).toHaveCount(1);
        await expect(rows.first()).toContainText(customTitle);
      }
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  test("T1-Catalog-7: episode list displays contextual empty message when filter matches no episodes", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    await page.goto("/admin/library/episodes?series=non-existent-series-id-xyz");
    await expect(
      page.getByText(/no episodes yet|this series has no episodes yet|no episodes found/i)
    ).toBeVisible();
  });

  // Tier 2: Boundary & Corner Cases (>=5 cases)

  test("T2-Catalog-1: validates and rejects duplicate episode numbers within the same season", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-dup-ep-${uid}`;
    await seedSeriesWithEpisodes(seriesId, `E2E Dup Ep ${uid}`, 2);
    try {
      await page.goto(`/admin/library/series/${seriesId}`);
      const editor = page.locator("section").filter({ hasText: /season 1|episodes/i });

      // Change Episode 2 to Episode 1
      const ep2Row = editor.getByRole("row").filter({ hasText: /Episode 2/ });
      const epNumInput = ep2Row.getByRole("spinbutton").or(ep2Row.getByLabel(/episode/i)).or(ep2Row.locator("input[type='number']"));
      await epNumInput.fill("1");

      const saveBtn = editor.getByRole("button", { name: /save season|save changes/i }).first();
      await saveBtn.click();

      // Check validation error
      await expect(
        page.getByText(/season 1 already has an episode 1|duplicate episode number/i)
      ).toBeVisible();
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  test("T2-Catalog-2: validates and rejects invalid episode numbers and runtimes", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-inv-num-${uid}`;
    await seedSeriesWithEpisodes(seriesId, `E2E Inv Num ${uid}`, 1);
    try {
      await page.goto(`/admin/library/series/${seriesId}`);
      const editor = page.locator("section").filter({ hasText: /season 1|episodes/i });
      const ep1Row = editor.getByRole("row").filter({ hasText: /Episode 1/ });

      // Set episode number to 0
      const epNumInput = ep1Row.getByRole("spinbutton").or(ep1Row.getByLabel(/episode/i)).or(ep1Row.locator("input[type='number']"));
      await epNumInput.fill("0");

      const saveBtn = editor.getByRole("button", { name: /save season|save changes/i }).first();
      await saveBtn.click();
      await expect(epNumInput).toHaveAttribute("aria-invalid", "true");
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  test("T2-Catalog-3: rejects empty episode title in season table editor", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-empty-title-${uid}`;
    await seedSeriesWithEpisodes(seriesId, `E2E Empty Title ${uid}`, 1);
    try {
      await page.goto(`/admin/library/series/${seriesId}`);
      const editor = page.locator("section").filter({ hasText: /season 1|episodes/i });
      const titleInput = page.locator("input[value='Episode 1']");
      await titleInput.fill("");

      const saveBtn = editor.getByRole("button", { name: /save season|save changes/i }).first();
      await saveBtn.click();
      await expect(titleInput).toHaveAttribute("aria-invalid", "true");
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  test("T2-Catalog-4: rejects disallowed image host for episode stillUrl", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-bad-host-${uid}`;
    await seedSeriesWithEpisodes(seriesId, `E2E Bad Host ${uid}`, 1);
    try {
      await page.goto(`/admin/library/series/${seriesId}`);
      const editor = page.locator("section").filter({ hasText: /season 1|episodes/i });
      const stillInput = editor.getByPlaceholder(/still|image/i).or(editor.getByLabel(/still|thumbnail/i));
      if (await stillInput.isVisible()) {
        await stillInput.fill("https://malicious.example.com/bad.jpg");
        const saveBtn = editor.getByRole("button", { name: /save season|save changes/i }).first();
        await saveBtn.click();
        await expect(page.getByText(/images can only come from/i)).toBeVisible();
      }
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  test("T2-Catalog-5: clearing episode list search filter restores full episode list", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    // Its own episodes, so episodes other tests add meanwhile don't count.
    const uid = uniqueId();
    const first = `e2e-clear-a-${uid}`;
    const second = `e2e-clear-b-${uid}`;
    await seedSeriesWithEpisodes(first, `E2E Clear A ${uid}`, 2);
    await seedSeriesWithEpisodes(second, `E2E Clear B ${uid}`, 1);
    await sql(`UPDATE episode SET title = title || ' ' || $1 WHERE "mediaId" = ANY($2)`, [uid, [first, second]]);
    try {
      await page.goto(`/admin/library/episodes?q=${encodeURIComponent(uid)}`);
      const ours = page.getByRole("row").filter({ hasText: uid });
      await expect(ours).toHaveCount(3);

      const seriesSelect = page.getByLabel("Series");
      await seriesSelect.selectOption(first);
      await page.getByRole("button", { name: "Show" }).click();
      await expect(ours).toHaveCount(2);

      await seriesSelect.selectOption("");
      await page.getByRole("button", { name: "Show" }).click();
      await expect(ours).toHaveCount(3);
    } finally {
      await sql(`DELETE FROM media WHERE id = ANY($1)`, [[first, second]]);
    }
  });

  // Tier 3: Pairwise Interactions

  test("T3-Catalog-1: renumbering episodes across seasons updates series duration on public catalog", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-cross-season-${uid}`;
    await seedSeriesWithEpisodes(seriesId, `E2E Cross Season ${uid}`, 2);
    try {
      await page.goto(`/admin/library/series/${seriesId}`);
      // Edit episode 2 to season 2 episode 1
      await page.goto(`/admin/library/episodes/${seriesId}-season-1-episode-2`);
      await page.getByLabel("Season").fill("2");
      await page.getByLabel("Episode", { exact: true }).fill("1");
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(page.getByRole("status")).toHaveText("Saved.");

      // Check series duration in DB and public page
      const [media] = await sql<{ duration: string }>(`SELECT duration FROM media WHERE id = $1`, [seriesId]);
      expect(media.duration).toMatch(/2 Seasons/);

      await page.goto(`/series/${seriesId}`);
      await expect(page.getByText(/2 Seasons/i)).toBeVisible();
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  test("T3-Catalog-2: combining series combobox and title text search filters conjunctively", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const sA = `e2e-conj-a-${uid}`;
    const sB = `e2e-conj-b-${uid}`;
    await seedSeriesWithEpisodes(sA, `Series A ${uid}`, 1);
    await seedSeriesWithEpisodes(sB, `Series B ${uid}`, 1);
    try {
      await page.goto(`/admin/library/episodes?series=${sA}`);
      const searchInput = page.getByPlaceholder(/search|filter/i).or(page.getByLabel(/search by title|title/i));
      if (await searchInput.isVisible()) {
        await searchInput.fill(`Series B ${uid}`);
        await page.keyboard.press("Enter");
        // Conjunctive match between Series A and Series B query must yield 0 results
        await expect(page.getByRole("row").filter({ hasText: uid })).toHaveCount(0);
      }
    } finally {
      await sql(`DELETE FROM media WHERE id = ANY($1)`, [[sA, sB]]);
    }
  });

  // Tier 4: End-to-End Real-World Workflow

  test("T4-Catalog-1: Season Table Inline Batch Edit & Error Recovery Workflow", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-recovery-${uid}`;
    await seedSeriesWithEpisodes(seriesId, `E2E Recovery ${uid}`, 3);
    try {
      await page.goto(`/admin/library/series/${seriesId}`);
      const editor = page.locator("section").filter({ hasText: /season 1|episodes/i });

      // Step 1: Intentionally cause validation errors (empty title & duplicate episode number)
      const ep1Title = page.locator("input[value='Episode 1']");
      await ep1Title.fill("");

      const ep2Row = editor.getByRole("row").filter({ hasText: /Episode 2/ });
      const epNumInput2 = ep2Row.getByRole("spinbutton").or(ep2Row.getByLabel(/episode/i)).or(ep2Row.locator("input[type='number']"));
      await epNumInput2.fill("1");

      const saveBtn = editor.getByRole("button", { name: /save season|save changes/i }).first();
      await saveBtn.click();

      // Step 2: Verify validation failure feedback
      await expect(
        page.getByText(/some fields need fixing|season 1 already has an episode 1|enter the title/i)
      ).toBeVisible();

      // Step 3: Recover by correcting values
      await ep1Title.fill("Corrected Pilot");
      await epNumInput2.fill("2");

      // Step 4: Re-submit and verify successful persist
      await saveBtn.click();
      await expect(page.getByText(/saved/i).first()).toBeVisible();

      // Step 5: Verify DB integrity
      const eps = await sql<{ episodeNumber: number; title: string }>(
        `SELECT "episodeNumber", title FROM episode WHERE "mediaId" = $1 ORDER BY "episodeNumber"`,
        [seriesId]
      );
      expect(eps[0].title).toBe("Corrected Pilot");
      expect(eps[0].episodeNumber).toBe(1);
      expect(eps[1].episodeNumber).toBe(2);
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });
});

