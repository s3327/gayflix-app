import type { Page } from "@playwright/test";
import { ADMIN_STATE, sql } from "./accounts";
import { ADMIN_CREDENTIALS, expect, test } from "./fixtures";

/*
 * The Import page (src/lib/title-import.ts), against e2e/source-stub.mjs
 * standing in for TMDB and OMDb. Each test imports a title of its own
 * from the stub and deletes it after, by its TMDB id.
 */

async function search(page: Page, query: string, options: { by?: "imdb"; type?: "series" } = {}) {
  const params = new URLSearchParams({ q: query, by: options.by ?? "title", type: options.type ?? "movie" });
  await page.goto(`/admin/import?${params}`);
}

/** The result card for a title. */
function card(page: Page, title: string) {
  return page.locator("main li").filter({ has: page.getByText(title, { exact: true }) });
}

async function imported(tmdbId: string) {
  return sql(
    `SELECT id, type, status, featured, "runtimeMinutes", country, synopsis, "imdbId" FROM media WHERE "tmdbId" = $1`,
    [tmdbId]
  );
}

function cleanUp(tmdbId: string) {
  return sql(`DELETE FROM media WHERE "tmdbId" = $1`, [tmdbId]);
}

test.describe("import", () => {
  test.use({ httpCredentials: ADMIN_CREDENTIALS, storageState: ADMIN_STATE });

  test("imports a title that matches IMDb as a draft, then links to it", async ({
    page,
    request,
    consoleProblems,
  }) => {
    void consoleProblems;
    const main = page.locator("main");
    const tmdbId = "movie/990001";
    try {
      await page.goto("/admin/import");
      await main.getByLabel("Title", { exact: true }).fill("E2E Harbor Lights");
      await main.getByRole("button", { name: "Search" }).click();
      await expect(page).toHaveURL(/\/admin\/import\?q=E2E\+Harbor\+Lights&by=title&type=movie$/);
      await expect(main.getByText("1 result on TMDB")).toBeVisible();
      await expect(card(page, "E2E Harbor Lights")).toContainText("Movie · 2024");

      await card(page, "E2E Harbor Lights").getByRole("button", { name: "Import E2E Harbor Lights" }).click();
      await expect(page).toHaveURL(/\/admin\/library\/movies\/e2e-harbor-lights(-\d+)?\?imported=1$/);
      await expect(main.getByRole("status")).toHaveText(
        "Imported as a draft. Check it, then set its status to Published when it's ready."
      );
      await expect(main.getByText("Matches IMDb tt9900001")).toBeVisible();
      await expect(main.getByLabel("Runtime in minutes")).toHaveValue("98");
      await expect(main.getByLabel("Country")).toHaveValue("Canada");
      await expect(main.getByLabel("Director")).toHaveValue("Jo Tran");
      await expect(main.getByLabel("Rating")).toHaveValue("3.7");

      const [row] = await imported(tmdbId);
      expect(row).toMatchObject({ status: "draft", featured: false, imdbId: "tt9900001" });
      expect((await request.get(`/movie/${row.id}`)).status()).toBe(404);

      // Searched again, it links to the library; trashed, to the trash.
      await search(page, "E2E Harbor Lights");
      const result = card(page, "E2E Harbor Lights");
      await expect(result.getByRole("link", { name: "E2E Harbor Lights: in library" })).toHaveAttribute(
        "href",
        `/admin/library/movies/${row.id}`
      );
      await sql(`UPDATE media SET "trashedAt" = now() WHERE id = $1`, [row.id]);
      await page.reload();
      await expect(result.getByRole("link", { name: "E2E Harbor Lights: in trash" })).toBeVisible();
    } finally {
      await cleanUp(tmdbId);
    }
  });

  test("opens the form when a required field is missing on both sources", async ({ page, consoleProblems }) => {
    void consoleProblems;
    const main = page.locator("main");
    const tmdbId = "movie/990002";
    try {
      await search(page, "E2E No Runtime");
      await card(page, "E2E No Runtime").getByRole("button", { name: /^Import E2E/ }).click();
      await expect(page).toHaveURL("/admin/upload/movies?tmdb=movie%2F990002");
      await expect(main.getByLabel("Title", { exact: true })).toHaveValue("E2E No Runtime");
      await expect(main.getByLabel("Runtime in minutes")).toHaveAttribute("aria-invalid", "true");
      await expect(main.getByLabel("Runtime in minutes")).toBeFocused();
      await expect(main.getByText("Enter the runtime in minutes.")).toBeVisible();
      expect(await imported(tmdbId)).toEqual([]);

      await main.getByLabel("Runtime in minutes").fill("90");
      await main.getByRole("button", { name: "Add movie" }).click();
      await expect(page).toHaveURL(/\/admin\/library\/movies\/e2e-no-runtime(-\d+)?\?imported=1$/);
      expect(await imported(tmdbId)).toEqual([
        expect.objectContaining({ runtimeMinutes: 90, imdbId: "tt9900002", status: "draft" }),
      ]);
    } finally {
      await cleanUp(tmdbId);
    }
  });

  test("asks for a look when IMDb's year is two years off", async ({ page, consoleProblems }) => {
    void consoleProblems;
    const main = page.locator("main");
    const tmdbId = "movie/990003";
    try {
      await search(page, "E2E Year Drift");
      await card(page, "E2E Year Drift").getByRole("button", { name: /^Import E2E/ }).click();
      await expect(page).toHaveURL("/admin/upload/movies?tmdb=movie%2F990003");
      await expect(
        main.getByText("Check the match: TMDB has “E2E Year Drift” (2020) and IMDb has “E2E Year Drift” (2022).")
      ).toBeVisible();
      expect(await imported(tmdbId)).toEqual([]);
      await main.getByRole("button", { name: "Add movie" }).click();
      await expect(page).toHaveURL(/\?imported=1$/);
      await expect(main.getByText("Matches IMDb tt9900003")).toBeVisible();
    } finally {
      await cleanUp(tmdbId);
    }
  });

  test("asks which type when TMDB and IMDb disagree", async ({ page, consoleProblems }) => {
    void consoleProblems;
    const tmdbId = "movie/990004";
    try {
      await search(page, "E2E Two Faced");
      const result = card(page, "E2E Two Faced");
      await result.getByRole("button", { name: /^Import E2E/ }).click();
      await expect(result).toContainText("TMDB: movie, IMDb: series. Import it as:");
      expect(await imported(tmdbId)).toEqual([]);
      await result.getByRole("button", { name: "Import E2E Two Faced as a series" }).click();
      await expect(page).toHaveURL(/\/admin\/library\/series\/e2e-two-faced(-\d+)?\?imported=1$/);
      expect(await imported(tmdbId)).toEqual([expect.objectContaining({ type: "series", imdbId: "tt9900004" })]);
    } finally {
      await cleanUp(tmdbId);
    }
  });

  test("fills what TMDB lacks from IMDb", async ({ page }) => {
    const tmdbId = "movie/990005";
    try {
      await search(page, "E2E Gap Filler");
      await card(page, "E2E Gap Filler").getByRole("button", { name: /^Import E2E/ }).click();
      await expect(page).toHaveURL(/\?imported=1$/);
      expect(await imported(tmdbId)).toEqual([
        expect.objectContaining({ runtimeMinutes: 97, country: "Ireland", synopsis: "Filled in from IMDb." }),
      ]);
    } finally {
      await cleanUp(tmdbId);
    }
  });

  test("imports without the IMDb check when OMDb is down", async ({ page }) => {
    const main = page.locator("main");
    const tmdbId = "movie/990007";
    try {
      await search(page, "E2E Offline Check");
      await card(page, "E2E Offline Check").getByRole("button", { name: /^Import E2E/ }).click();
      await expect(page).toHaveURL(/\?imported=1$/);
      await expect(main.getByText("Not checked against IMDb")).toBeVisible();
      expect(await imported(tmdbId)).toEqual([expect.objectContaining({ imdbId: null })]);
    } finally {
      await cleanUp(tmdbId);
    }
  });

  test("gives a title neither source has a poster for the No poster image", async ({ page }) => {
    const main = page.locator("main");
    const tmdbId = "movie/990008";
    try {
      await search(page, "E2E No Poster");
      const result = card(page, "E2E No Poster");
      await expect(result.getByRole("img", { name: "E2E No Poster" })).toHaveAttribute("src", /no-poster\.jpg/);
      await result.getByRole("button", { name: /^Import E2E/ }).click();
      await expect(page).toHaveURL(/\?imported=1$/);
      await expect(main.getByRole("img", { name: "E2E No Poster" })).toHaveAttribute("src", /no-poster\.jpg/);
      await expect(main.getByLabel("Poster image link")).toHaveValue("");
      expect(await sql(`SELECT "posterUrl" FROM media WHERE "tmdbId" = $1`, [tmdbId])).toEqual([
        { posterUrl: "/brand/no-poster.jpg" },
      ]);
    } finally {
      await cleanUp(tmdbId);
    }
  });

  test("finds a title by its IMDb ID, whatever its type", async ({ page }) => {
    const main = page.locator("main");
    await page.goto("/admin/import");
    await main.getByLabel("Search by").selectOption("imdb");
    await expect(main.getByLabel("Media type")).toHaveCount(0);
    await main.getByLabel("IMDb ID").fill("https://www.imdb.com/title/tt9900006/");
    await main.getByRole("button", { name: "Search" }).click();
    await expect(card(page, "E2E Find Me")).toContainText("Series · 2018");
    await expect(main.locator("li")).toHaveCount(1);

    await search(page, "tt99", { by: "imdb" });
    await expect(main.getByRole("alert")).toHaveText("Enter an IMDb ID, such as tt0133093.");
    await search(page, "tt9999999", { by: "imdb" });
    await expect(main.getByText("TMDB has no title with that IMDb ID.")).toBeVisible();
  });

  test("shows 40 results a page, and says when TMDB is down", async ({ page }) => {
    const main = page.locator("main");
    await search(page, "E2E Many");
    await expect(main.getByText("50 results on TMDB")).toBeVisible();
    await expect(main.locator("li")).toHaveCount(40);
    await main.getByRole("link", { name: "Next" }).click();
    await expect(page).toHaveURL(/page=2$/);
    await expect(main.locator("li")).toHaveCount(10);
    await expect(main.getByText("Page 2 of 2")).toBeVisible();

    await search(page, "E2E TMDB down");
    await expect(main.getByRole("alert")).toHaveText("TMDB didn't answer. Try again in a minute.");
  });
});

function uniqueId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

test.describe("TMDB seasons and episodes bulk import", () => {
  // These share the stub's few TMDB series (tv/990009 and others), and a
  // TMDB id belongs to one title, so they run one at a time.
  test.describe.configure({ mode: "default" });
  test.use({ httpCredentials: ADMIN_CREDENTIALS, storageState: ADMIN_STATE });

  // Tier 1: Feature Coverage (>=5 cases)

  test("T1-Import-1: opens the import episodes modal from series edit page and displays available seasons and counts", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-series-import-${uid}`;
    await sql(
      `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "tmdbId", "createdAt", "updatedAt")
       VALUES ($1, 'series', 'draft', $2, 2024, '', ARRAY['Drama'], 'Canada', 'English', 'https://picsum.photos/seed/e2e/500/750', 'tv/990009', now(), now())`,
      [seriesId, `E2E Series Import ${uid}`]
    );
    try {
      await page.goto(`/admin/library/series/${seriesId}`);
      const importButton = page.getByRole("button", { name: /import episodes from tmdb|import episodes/i });
      await expect(importButton).toBeVisible();
      await importButton.click();

      const modal = page.getByRole("dialog", { name: /import episodes/i });
      await expect(modal).toBeVisible();
      await expect(modal.getByText(/season 1/i)).toBeVisible();
      await expect(modal.getByText(/10 episodes/i)).toBeVisible();
      await expect(modal.getByText(/season 2/i)).toBeVisible();
      await expect(modal.getByText(/8 episodes/i)).toBeVisible();
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  test("T1-Import-2: previews episode details within a season before importing", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-series-prev-${uid}`;
    await sql(
      `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "tmdbId", "createdAt", "updatedAt")
       VALUES ($1, 'series', 'draft', $2, 2024, '', ARRAY['Drama'], 'Canada', 'English', 'https://picsum.photos/seed/e2e/500/750', 'tv/990009', now(), now())`,
      [seriesId, `E2E Series Preview ${uid}`]
    );
    try {
      await page.goto(`/admin/library/series/${seriesId}`);
      await page.getByRole("button", { name: /import episodes/i }).click();
      const modal = page.getByRole("dialog", { name: /import episodes/i });
      await expect(modal).toBeVisible();

      // Trigger preview for Season 1
      const previewTrigger = modal.getByRole("button", { name: /preview season 1|expand season 1|season 1/i }).first();
      await previewTrigger.click();

      // Verify episode details visible in preview
      await expect(modal.getByText(/episode 1/i).first()).toBeVisible();
      await expect(modal.getByText(/episode 2/i).first()).toBeVisible();
      await expect(modal.getByText(/45 min/i).first()).toBeVisible();
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  test("T1-Import-3: imports a single season and persists episodes and still thumbnails", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-series-single-${uid}`;
    await sql(
      `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "tmdbId", "createdAt", "updatedAt")
       VALUES ($1, 'series', 'draft', $2, 2024, '', ARRAY['Drama'], 'Canada', 'English', 'https://picsum.photos/seed/e2e/500/750', 'tv/990009', now(), now())`,
      [seriesId, `E2E Series Single ${uid}`]
    );
    try {
      await page.goto(`/admin/library/series/${seriesId}`);
      await page.getByRole("button", { name: /import episodes/i }).click();
      const modal = page.getByRole("dialog", { name: /import episodes/i });
      await expect(modal).toBeVisible();

      // Ensure Season 1 is selected and Season 2 is unselected
      const s1Checkbox = modal.getByRole("checkbox", { name: /season 1/i });
      const s2Checkbox = modal.getByRole("checkbox", { name: /season 2/i });
      if (!(await s1Checkbox.isChecked())) await s1Checkbox.check();
      if (await s2Checkbox.isChecked()) await s2Checkbox.uncheck();

      await modal.getByRole("button", { name: /import/i }).click();

      // Wait for success status or modal close
      await expect(modal).toHaveCount(0);
      const eps = await sql<{ id: string; seasonNumber: number; episodeNumber: number; stillUrl: string | null }>(
        `SELECT id, "seasonNumber", "episodeNumber", "stillUrl" FROM episode WHERE "mediaId" = $1 ORDER BY "episodeNumber"`,
        [seriesId]
      );
      expect(eps.length).toBe(10);
      expect(eps[0].episodeNumber).toBe(1);
      expect(eps[0].seasonNumber).toBe(1);
      expect(eps[0].stillUrl).toMatch(/\/mock-still-s1e1\.jpg/);
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  test("T1-Import-4: idempotent import preserves manual edits and imports only missing episodes", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-series-idem-${uid}`;
    await sql(
      `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "tmdbId", "createdAt", "updatedAt")
       VALUES ($1, 'series', 'draft', $2, 2024, '', ARRAY['Drama'], 'Canada', 'English', 'https://picsum.photos/seed/e2e/500/750', 'tv/990009', now(), now())`,
      [seriesId, `E2E Series Idem ${uid}`]
    );
    // Pre-seed Episode 1 with custom manual title and duration
    await sql(
      `INSERT INTO episode (id, "mediaId", "seasonNumber", "episodeNumber", title, duration)
       VALUES ($1, $2, 1, 1, 'Manual Custom Pilot', '52 min')`,
      [`${seriesId}-season-1-episode-1`, seriesId]
    );
    try {
      await page.goto(`/admin/library/series/${seriesId}`);
      await page.getByRole("button", { name: /import episodes/i }).click();
      const modal = page.getByRole("dialog", { name: /import episodes/i });
      await expect(modal).toBeVisible();

      const s1Checkbox = modal.getByRole("checkbox", { name: /season 1/i });
      if (!(await s1Checkbox.isChecked())) await s1Checkbox.check();
      const s2Checkbox = modal.getByRole("checkbox", { name: /season 2/i });
      if (await s2Checkbox.isChecked()) await s2Checkbox.uncheck();

      await modal.getByRole("button", { name: /import/i }).click();
      await expect(modal).toHaveCount(0);

      // Verify Episode 1 title and duration were preserved untouched
      const eps = await sql<{ episodeNumber: number; title: string; duration: string }>(
        `SELECT "episodeNumber", title, duration FROM episode WHERE "mediaId" = $1 ORDER BY "episodeNumber"`,
        [seriesId]
      );
      expect(eps.length).toBe(10);
      expect(eps[0].title).toBe("Manual Custom Pilot");
      expect(eps[0].duration).toBe("52 min");
      expect(eps[1].title).toBe("Episode 2");
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  test("T1-Import-5: recomputes series duration upon episode import", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-series-dur-${uid}`;
    await sql(
      `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "tmdbId", "createdAt", "updatedAt")
       VALUES ($1, 'series', 'draft', $2, 2024, '', ARRAY['Drama'], 'Canada', 'English', 'https://picsum.photos/seed/e2e/500/750', 'tv/990009', now(), now())`,
      [seriesId, `E2E Series Dur ${uid}`]
    );
    try {
      await page.goto(`/admin/library/series/${seriesId}`);
      await page.getByRole("button", { name: /import episodes/i }).click();
      const modal = page.getByRole("dialog", { name: /import episodes/i });

      // Import Season 1 only
      const s1Checkbox = modal.getByRole("checkbox", { name: /season 1/i });
      const s2Checkbox = modal.getByRole("checkbox", { name: /season 2/i });
      if (!(await s1Checkbox.isChecked())) await s1Checkbox.check();
      if (await s2Checkbox.isChecked()) await s2Checkbox.uncheck();
      await modal.getByRole("button", { name: /import/i }).click();
      await expect(modal).toHaveCount(0);

      let [row] = await sql<{ duration: string }>(`SELECT duration FROM media WHERE id = $1`, [seriesId]);
      expect(row.duration).toMatch(/1 Season/);

      // Now import Season 2
      await page.getByRole("button", { name: /import episodes/i }).click();
      const modal2 = page.getByRole("dialog", { name: /import episodes/i });
      const s2Checkbox2 = modal2.getByRole("checkbox", { name: /season 2/i });
      if (!(await s2Checkbox2.isChecked())) await s2Checkbox2.check();
      await modal2.getByRole("button", { name: /import/i }).click();
      await expect(modal2).toHaveCount(0);

      [row] = await sql<{ duration: string }>(`SELECT duration FROM media WHERE id = $1`, [seriesId]);
      expect(row.duration).toMatch(/2 Seasons/);
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  // Tier 2: Boundary & Corner Cases (>=5 cases)

  test("T2-Import-1: handles season with 0 episodes gracefully in modal and import action", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-series-zero-${uid}`;
    await sql(
      `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "tmdbId", "createdAt", "updatedAt")
       VALUES ($1, 'series', 'draft', $2, 2024, '', ARRAY['Drama'], 'Canada', 'English', 'https://picsum.photos/seed/e2e/500/750', 'tv/990010', now(), now())`,
      [seriesId, `E2E Series Zero ${uid}`]
    );
    try {
      await page.goto(`/admin/library/series/${seriesId}`);
      await page.getByRole("button", { name: /import episodes/i }).click();
      const modal = page.getByRole("dialog", { name: /import episodes/i });
      await expect(modal.getByText(/0 episodes/i)).toBeVisible();

      const s1 = modal.getByRole("checkbox", { name: /season 1/i });
      if (!(await s1.isChecked())) await s1.check();
      const s2 = modal.getByRole("checkbox", { name: /season 2/i });
      if (await s2.isChecked()) await s2.uncheck();

      await modal.getByRole("button", { name: /import/i }).click();
      await expect(modal).toHaveCount(0);
      const eps = await sql(`SELECT id FROM episode WHERE "mediaId" = $1`, [seriesId]);
      expect(eps).toHaveLength(0);
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  test("T2-Import-2: disables import submission or warns when no seasons are selected", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-series-none-${uid}`;
    await sql(
      `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "tmdbId", "createdAt", "updatedAt")
       VALUES ($1, 'series', 'draft', $2, 2024, '', ARRAY['Drama'], 'Canada', 'English', 'https://picsum.photos/seed/e2e/500/750', 'tv/990009', now(), now())`,
      [seriesId, `E2E Series None ${uid}`]
    );
    try {
      await page.goto(`/admin/library/series/${seriesId}`);
      await page.getByRole("button", { name: /import episodes/i }).click();
      const modal = page.getByRole("dialog", { name: /import episodes/i });

      // Uncheck all season checkboxes
      await expect(modal.getByRole("checkbox").first()).toBeVisible();
      const checkboxes = modal.getByRole("checkbox");
      const count = await checkboxes.count();
      for (let i = 0; i < count; i++) {
        if (await checkboxes.nth(i).isChecked()) await checkboxes.nth(i).uncheck();
      }

      const submitButton = modal.getByRole("button", { name: /import/i });
      const isDisabled = await submitButton.isDisabled();
      if (!isDisabled) {
        await submitButton.click();
        await expect(modal.getByText(/select at least one season/i)).toBeVisible();
      } else {
        expect(isDisabled).toBe(true);
      }
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  test("T2-Import-3: handles TMDB 503 error on season fetch gracefully", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-series-down-${uid}`;
    await sql(
      `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "tmdbId", "createdAt", "updatedAt")
       VALUES ($1, 'series', 'draft', $2, 2024, '', ARRAY['Drama'], 'Canada', 'English', 'https://picsum.photos/seed/e2e/500/750', 'tv/990099', now(), now())`,
      [seriesId, `E2E Series Down ${uid}`]
    );
    try {
      await page.goto(`/admin/library/series/${seriesId}`);
      await page.getByRole("button", { name: /import episodes/i }).click();
      const modal = page.getByRole("dialog", { name: /import episodes/i });
      await expect(
        modal.getByText(/tmdb didn't answer|tmdb season down|error loading seasons/i)
      ).toBeVisible();
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  test("T2-Import-4: handles episodes with null still_path falling back cleanly", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-series-nullstill-${uid}`;
    await sql(
      `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "tmdbId", "createdAt", "updatedAt")
       VALUES ($1, 'series', 'draft', $2, 2024, '', ARRAY['Drama'], 'Canada', 'English', 'https://picsum.photos/seed/e2e/500/750', 'tv/990011', now(), now())`,
      [seriesId, `E2E Series Null Still ${uid}`]
    );
    try {
      await page.goto(`/admin/library/series/${seriesId}`);
      await page.getByRole("button", { name: /import episodes/i }).click();
      const modal = page.getByRole("dialog", { name: /import episodes/i });
      await modal.getByRole("button", { name: /import/i }).click();
      await expect(modal).toHaveCount(0);

      const eps = await sql<{ episodeNumber: number; stillUrl: string | null }>(
        `SELECT "episodeNumber", "stillUrl" FROM episode WHERE "mediaId" = $1 ORDER BY "episodeNumber"`,
        [seriesId]
      );
      expect(eps.length).toBe(3);
      // Episode 2 has null still_path in stub
      expect(eps[1].stillUrl).toBeNull();
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  test("T2-Import-5: preserves special characters in episode names and overviews", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-series-spec-${uid}`;
    await sql(
      `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "tmdbId", "createdAt", "updatedAt")
       VALUES ($1, 'series', 'draft', $2, 2024, '', ARRAY['Drama'], 'Canada', 'English', 'https://picsum.photos/seed/e2e/500/750', 'tv/990011', now(), now())`,
      [seriesId, `E2E Series Spec ${uid}`]
    );
    try {
      await page.goto(`/admin/library/series/${seriesId}`);
      await page.getByRole("button", { name: /import episodes/i }).click();
      const modal = page.getByRole("dialog", { name: /import episodes/i });
      await modal.getByRole("button", { name: /import/i }).click();
      await expect(modal).toHaveCount(0);

      const [ep1] = await sql<{ title: string }>(
        `SELECT title FROM episode WHERE "mediaId" = $1 AND "episodeNumber" = 1`,
        [seriesId]
      );
      expect(ep1.title).toBe("Pilot & Ep 1 <Special>");
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  // Tier 3: Pairwise Interactions

  test("T3-Import-1: series without TMDB ID does not show import episodes button", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-series-notmdb-${uid}`;
    await sql(
      `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "createdAt", "updatedAt")
       VALUES ($1, 'series', 'draft', $2, 2024, '', ARRAY['Drama'], 'Canada', 'English', 'https://picsum.photos/seed/e2e/500/750', now(), now())`,
      [seriesId, `E2E Manual Series ${uid}`]
    );
    try {
      await page.goto(`/admin/library/series/${seriesId}`);
      const btn = page.getByRole("button", { name: /import episodes from tmdb/i });
      await expect(btn).toHaveCount(0);
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  test("T3-Import-2: imported episodes immediately reflect on public series page", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-series-pub-${uid}`;
    await sql(
      `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "tmdbId", "createdAt", "updatedAt")
       VALUES ($1, 'series', 'published', $2, 2024, '', ARRAY['Drama'], 'Canada', 'English', 'https://picsum.photos/seed/e2e/500/750', 'tv/990009', now(), now())`,
      [seriesId, `E2E Series Public ${uid}`]
    );
    try {
      await page.goto(`/admin/library/series/${seriesId}`);
      await page.getByRole("button", { name: /import episodes/i }).click();
      const modal = page.getByRole("dialog", { name: /import episodes/i });
      const s1 = modal.getByRole("checkbox", { name: /season 1/i });
      if (!(await s1.isChecked())) await s1.check();
      const s2 = modal.getByRole("checkbox", { name: /season 2/i });
      if (await s2.isChecked()) await s2.uncheck();
      await modal.getByRole("button", { name: /import/i }).click();
      await expect(modal).toHaveCount(0);

      // Check public page
      await page.goto(`/series/${seriesId}`);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(`E2E Series Public ${uid}`);
      await expect(page.getByText(/episode 1/i).first()).toBeVisible();
      await expect(page.getByText(/episode 10/i).first()).toBeVisible();
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  // Tier 4: End-to-End Real-World Workflow

  test("T4-Import-1: complete multi-season ingestion workflow", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const title = "E2E Series Import";
    const tmdbId = "tv/990009";
    try {
      // 1. Search on import page
      await page.goto("/admin/import");
      const main = page.locator("main");
      await main.getByLabel("Title", { exact: true }).fill(title);
      await main.getByLabel("Media type").selectOption("series");
      await main.getByRole("button", { name: "Search" }).click();
      await expect(main.getByText("1 result on TMDB")).toBeVisible();

      // 2. Import series draft
      await card(page, title).getByRole("button", { name: /import e2e series import/i }).click();
      await expect(page).toHaveURL(/\/admin\/library\/series\/e2e-series-import(-\d+)?\?imported=1$/);

      // Extract generated series ID from URL
      const url = new URL(page.url());
      const seriesId = url.pathname.split("/").pop() ?? "";

      // 3. Open TMDB import episodes modal
      await page.getByRole("button", { name: /import episodes/i }).click();
      const modal = page.getByRole("dialog", { name: /import episodes/i });
      await expect(modal).toBeVisible();

      // 4. Select both Season 1 and Season 2
      const s1 = modal.getByRole("checkbox", { name: /season 1/i });
      const s2 = modal.getByRole("checkbox", { name: /season 2/i });
      if (!(await s1.isChecked())) await s1.check();
      if (!(await s2.isChecked())) await s2.check();

      // 5. Submit import
      await modal.getByRole("button", { name: /import/i }).click();
      await expect(modal).toHaveCount(0);

      // 6. Verify database state
      const eps = await sql(`SELECT id FROM episode WHERE "mediaId" = $1`, [seriesId]);
      expect(eps).toHaveLength(18); // 10 from S1 + 8 from S2
      const [media] = await sql<{ duration: string }>(`SELECT duration FROM media WHERE id = $1`, [seriesId]);
      expect(media.duration).toMatch(/2 Seasons/);
    } finally {
      await cleanUp(tmdbId);
    }
  });
});

