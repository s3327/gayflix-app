import { sql } from "./accounts";
import { expect, seriousViolations, test } from "./fixtures";

/*
 * People pages (/people/<name>): what someone directed, created and is in
 * the cast of, linked from title pages. The titles are this test's own,
 * dated in the past to stay off Recently Added.
 */

const POSTER = "https://picsum.photos/seed/e2e-people/500/750";

test("a person's page lists their published titles by role", async ({ page }) => {
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const director = `E2E Director ${uid}`;
  const actor = `E2E Actor ${uid}`;
  const movie = { id: `e2e-people-movie-${uid}`, title: `E2E People Movie ${uid}` };
  const series = { id: `e2e-people-series-${uid}`, title: `E2E People Series ${uid}` };
  const draft = { id: `e2e-people-draft-${uid}`, title: `E2E People Draft ${uid}` };
  const insert = (t: { id: string; title: string }, type: string, status: string, credit: string, cast: string[]) =>
    sql(
      `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, director, creator, "cast",
                          "posterUrl", "publishedAt", "createdAt", "updatedAt")
       VALUES ($1, $2::media_type, $3::media_status, $4, 2001, '1h 30m', ARRAY['Drama'], 'Canada', 'French',
               $5, $6, $7, $8, '2001-01-01', '2001-01-01', '2001-01-01')`,
      [t.id, type, status, t.title, type === "movie" ? credit : null, type === "series" ? credit : null, cast, POSTER]
    );
  await insert(movie, "movie", "published", director, [actor]);
  await insert(series, "series", "published", director, []);
  await insert(draft, "movie", "draft", director, [actor]);
  try {
    // From the movie's page, its director's page.
    await page.goto(`/movie/${movie.id}`);
    await page.locator("main dl").getByRole("link", { name: director }).click();
    await expect(page).toHaveURL(new RegExp(`/people/${encodeURIComponent(director)}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(director);
    await expect(page).toHaveTitle(`${director} · Gayflix`);
    const directed = page.getByRole("region", { name: "Directed" });
    const created = page.getByRole("region", { name: "Created" });
    await expect(directed.locator(`a[href="/movie/${movie.id}"]`)).toHaveCount(1);
    await expect(created.locator(`a[href="/series/${series.id}"]`)).toHaveCount(1);
    // Drafts aren't on the site.
    await expect(page.locator(`a[href="/movie/${draft.id}"]`)).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Cast" })).toHaveCount(0);
    expect(await seriousViolations(page)).toEqual([]);

    // Any case finds them, and the page keeps the catalog's spelling.
    await page.goto(`/people/${encodeURIComponent(actor.toLowerCase())}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(actor);
    await expect(page.getByRole("region", { name: "Cast" }).locator(`a[href="/movie/${movie.id}"]`)).toHaveCount(1);

    // A name on no published title has no page.
    const missing = await page.goto(`/people/${encodeURIComponent(`Nobody ${uid}`)}`);
    expect(missing?.status()).toBe(404);
  } finally {
    await sql(`DELETE FROM media WHERE id = ANY($1)`, [[movie.id, series.id, draft.id]]);
  }
});
