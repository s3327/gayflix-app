import { ADMIN_STATE, sql } from "./accounts";
import { ADMIN_CREDENTIALS, expect, test } from "./fixtures";

/*
 * The catalog lives in the database (src/lib/catalog.ts). The sample
 * catalog has drafts such as Cabin Fever (a movie) and Campus Life (a
 * series), which must never reach the public site.
 */

type Suggestion = { id: string; title: string };

test("drafts never reach the public site", async ({ request }) => {
  for (const path of ["/movie/cabin-fever", "/watch/cabin-fever", "/series/campus-life"]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
  const { results } = await (await request.get("/api/search?q=cabin")).json();
  expect(results.map((result: Suggestion) => result.id)).not.toContain("cabin-fever");

  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/series/the-brownstone</loc>");
  expect(sitemap).not.toContain("/movie/cabin-fever</loc>");
});

test("a title appears once it's published and goes away when it's unpublished", async ({
  page,
}) => {
  const id = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const title = `E2E Premiere ${id}`;
  await sql(
    `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "updatedAt")
     VALUES ($1, 'movie', 'draft', $2, 2026, '1h 30m', ARRAY['Drama'], 'Canada', 'French',
             'https://picsum.photos/seed/e2e/500/750', now())`,
    [id, title]
  );
  try {
    expect((await page.goto(`/movie/${id}`))?.status()).toBe(404);

    await sql(`UPDATE media SET status = 'published' WHERE id = $1`, [id]);
    await page.goto(`/movie/${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(title);
    await page.goto("/new-releases");
    await expect(page.locator("main a").first()).toHaveAttribute("href", `/movie/${id}`);
    await page.goto(`/search?q=${encodeURIComponent(id)}`);
    await expect(page.getByRole("main").getByText("1 title found")).toBeVisible();

    await sql(`UPDATE media SET status = 'draft' WHERE id = $1`, [id]);
    expect((await page.goto(`/movie/${id}`))?.status()).toBe(404);
  } finally {
    await sql(`DELETE FROM media WHERE id = $1`, [id]);
  }
});

test("old links with the wrong type, and series on /watch, go to the right page", async ({
  page,
}) => {
  await page.goto("/series/chosen-family");
  await expect(page).toHaveURL(/\/movie\/chosen-family$/);
  await page.goto("/watch/the-brownstone");
  await expect(page).toHaveURL(/\/episode\/the-brownstone-season-1-episode-1$/);
});

test("suggestions put titles starting with the query first, and % is just a character", async ({
  request,
}) => {
  const suggest = async (query: string): Promise<Suggestion[]> =>
    (await (await request.get(`/api/search?q=${encodeURIComponent(query)}`)).json()).results;

  const loud = await suggest("loud");
  expect(loud).toHaveLength(6);
  expect(loud[0].title).toBe("Loud Address");
  expect((await suggest("dorothy")).map((result) => result.title)).toEqual(["Friend of Dorothy"]);
  expect(await suggest("%")).toEqual([]);
});

test("the search page matches genres and pages through results", async ({
  page,
  consoleProblems,
}) => {
  void consoleProblems;
  await page.goto("/search?q=drama");
  await expect(page.getByText(/^\d+ titles found$/)).toBeVisible();
  await expect(page.getByText(/^Page 1 of \d+$/)).toBeVisible();
  await page.getByRole("link", { name: "Next" }).click();
  await expect(page).toHaveURL(/\/search\?q=drama&page=2$/);
  await expect(page.getByText(/^Page 2 of \d+$/)).toBeVisible();
});

test("a title's details and tags lead to the titles that share them", async ({
  page,
  consoleProblems,
}) => {
  void consoleProblems;
  const details = page.locator("main dl");

  await page.goto("/movie/chosen-family");
  await details.getByRole("link", { name: "Drama" }).click();
  await expect(page).toHaveURL(/\/genre\?genre=Drama$/);
  await expect(page.getByRole("link", { name: "Drama", exact: true })).toHaveAttribute(
    "aria-current",
    "true"
  );

  // Search matches cast, so a cast member finds their other titles.
  await page.goto("/movie/chosen-family");
  await details.getByRole("link", { name: "Jordan Lee" }).click();
  await expect(page).toHaveURL(/\/search\?q=Jordan\+Lee$/);
  await expect(page.getByRole("link", { name: /The Brownstone/ })).toBeVisible();

  // And tags.
  await page.goto("/movie/chosen-family");
  await page.getByRole("link", { name: "Coming of Age", exact: true }).click();
  await expect(page).toHaveURL(/\/search\?q=Coming\+of\+Age$/);
  await expect(page.getByRole("link", { name: /Chosen Family/ }).first()).toBeVisible();
});

test.describe("admin library", () => {
  test.use({ httpCredentials: ADMIN_CREDENTIALS, storageState: ADMIN_STATE });

  test("lists drafts and published titles, with search and a status filter", async ({ page }) => {
    await page.goto("/admin/library/movies");
    await expect(page.getByText(/^Page 1 of \d+$/)).toBeVisible();

    await page.getByLabel("Search by title").fill("cabin");
    await page.locator("main").getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/\/admin\/library\/movies\?q=cabin&status=all$/);
    await expect(page.getByRole("row", { name: /Cabin Fever/ })).toContainText("Draft");

    await page.goto("/admin/library/movies?q=chosen");
    await expect(page.getByRole("row", { name: /Chosen Family/ })).toContainText("Published");
    await expect(page.getByRole("row", { name: /Cabin Fever/ })).toHaveCount(0);

    await page.goto("/admin/library/series?status=draft");
    await expect(page.getByRole("row", { name: /Campus Life/ })).toBeVisible();
    await expect(page.getByRole("row", { name: /The Brownstone/ })).toHaveCount(0);

    await page.goto("/admin/library/series?q=brownstone");
    await expect(page.getByRole("row", { name: /The Brownstone/ })).toContainText(
      "3 Seasons · 18 Episodes"
    );
  });
});

test("You Might Also Like puts the titles sharing the most first", async ({ page }) => {
  const id = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const genre = `E2E Genre ${id}`;
  const insert = (suffix: string, tags: string[], director: string | null) =>
    sql(
      `INSERT INTO media (id, type, status, title, year, duration, genres, tags, director, country, language, "posterUrl", "updatedAt")
       VALUES ($1, 'movie', 'published', $2, 2026, '1h 30m', ARRAY[$3], $4, $5, 'Canada', 'French',
               'https://picsum.photos/seed/e2e/500/750', now())`,
      [`${id}-${suffix}`, `E2E Related ${suffix} ${id}`, genre, tags, director]
    );
  await insert("a", ["e2e-shared"], `Director ${id}`);
  await insert("b", ["e2e-shared"], `Director ${id}`);
  await insert("c", [], null);
  try {
    await page.goto(`/movie/${id}-a`);
    const row = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "You Might Also Like" }) });
    const links = row.getByRole("link");
    await expect(links.first()).toHaveAttribute("href", `/movie/${id}-b`);
    await expect(links.nth(1)).toHaveAttribute("href", `/movie/${id}-c`);
    await expect(row.locator(`a[href="/movie/${id}-a"]`)).toHaveCount(0);
  } finally {
    await sql(`DELETE FROM media WHERE id LIKE $1`, [`${id}-%`]);
  }
});
