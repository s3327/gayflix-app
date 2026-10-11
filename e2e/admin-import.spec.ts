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
