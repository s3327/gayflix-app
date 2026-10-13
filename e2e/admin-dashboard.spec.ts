import { ADMIN_STATE, sql, USER_STATE } from "./accounts";
import { ADMIN_CREDENTIALS, expect, seriousViolations, test } from "./fixtures";

/*
 * /admin/dashboard: the catalog, plays, accounts and open reports at a
 * glance. Other tests add titles, plays and reports at the same time, so
 * this one checks its own rows show up rather than exact totals.
 */

const POSTER = "https://picsum.photos/seed/e2e-dashboard/500/750";

function uniqueId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

test.describe("regular users", () => {
  test.use({ httpCredentials: ADMIN_CREDENTIALS, storageState: USER_STATE });

  test("can't reach the dashboard", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/admin\/login(\?.*)?$/);
  });
});

test.describe("signed in as an admin", () => {
  test.use({ httpCredentials: ADMIN_CREDENTIALS, storageState: ADMIN_STATE });

  test("shows the counts, the most played titles, the newest titles and open reports", async ({
    page,
  }) => {
    const uid = uniqueId();
    const played = { id: `e2e-dash-played-${uid}`, title: `E2E Dashboard Played ${uid}` };
    const draft = { id: `e2e-dash-draft-${uid}`, title: `E2E Dashboard Draft ${uid}` };
    // Published long ago, so it stays off New Releases, which other tests read.
    await sql(
      `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "createdAt", "updatedAt")
       VALUES ($1, 'movie', 'published', $2, 2001, '1h 30m', ARRAY['Drama'], 'Canada', 'French', $3,
               '2001-01-01', '2001-01-01')`,
      [played.id, played.title, POSTER]
    );
    // Fewer plays than "Trending ranks titles by this week's views" gives its
    // title, which has to come first on /trending.
    await sql(
      `INSERT INTO media_view ("mediaId", viewer, day)
       SELECT $1, 'e2e-' || n, (now() AT TIME ZONE 'UTC')::date FROM generate_series(1, 500) n`,
      [played.id]
    );
    // Added "in an hour", so titles other tests add now don't push it out
    // of Recently added.
    await sql(
      `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "createdAt", "updatedAt")
       VALUES ($1, 'series', 'draft', $2, 2001, '', ARRAY['Drama'], 'Canada', 'French', $3,
               now() + interval '1 hour', now())`,
      [draft.id, draft.title, POSTER]
    );
    const [report] = await sql<{ id: string }>(
      `INSERT INTO report (id, "mediaId", "mediaTitle", reason)
       VALUES ('e2e-dash-' || $1, $2, $3, 'Video won''t play') RETURNING id`,
      [uid, played.id, played.title]
    );
    try {
      await page.goto("/admin");
      await expect(page).toHaveURL(/\/admin\/dashboard$/);
      expect(await seriousViolations(page)).toEqual([]);

      const tiles = page.getByRole("list", { name: "At a glance" });
      for (const label of ["Published titles", "Drafts", "Plays, last 7 days", "Accounts"]) {
        await expect(tiles.getByRole("listitem").filter({ hasText: label })).toContainText(/\d/);
      }
      await expect(tiles.getByRole("listitem").filter({ hasText: "Drafts" })).toContainText(
        /\d+ movies? · \d+ series/
      );

      const mostPlayed = page.getByRole("region", { name: "Most played, last 7 days" });
      const playedRow = mostPlayed.getByRole("listitem").filter({ hasText: played.title });
      await expect(playedRow).toContainText("500 plays");
      await expect(playedRow.getByRole("link")).toHaveAttribute("href", `/admin/library/movies/${played.id}`);

      const recent = page.getByRole("region", { name: "Recently added" });
      const draftRow = recent.getByRole("listitem").first();
      await expect(draftRow).toContainText(draft.title);
      await expect(draftRow).toContainText("Series");
      await expect(draftRow).toContainText("Draft");

      await expect(page.getByText(/^\d+ open reports? from the player\.$/)).toBeVisible();
      await page.getByRole("link", { name: "Open Reports" }).click();
      await expect(page).toHaveURL(/\/admin\/reports$/);

      await page.goto("/admin/dashboard");
      await recent.getByRole("link", { name: draft.title }).click();
      await expect(page).toHaveURL(`/admin/library/series/${draft.id}`);
    } finally {
      await sql(`DELETE FROM report WHERE id = $1`, [report.id]);
      await sql(`DELETE FROM media WHERE id = ANY($1)`, [[played.id, draft.id]]);
    }
  });
});
