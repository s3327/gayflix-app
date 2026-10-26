import { ADMIN_STATE, sql } from "./accounts";
import { ADMIN_CREDENTIALS, expect, guestPage, seriousViolations, test } from "./fixtures";

/*
 * Episode details: an admin writes an episode's synopsis on its edit
 * page; the series page's episode list shows each episode's still (or
 * the series' backdrop) and synopsis, and the episode page shows its
 * own synopsis before the series'. The series is this test's own, dated
 * in the past to stay off Recently Added.
 */

const POSTER = "https://picsum.photos/seed/e2e-episodes/500/750";
const BACKDROP = "https://picsum.photos/seed/e2e-episodes-backdrop/1280/720";
const STILL = "https://picsum.photos/seed/e2e-episodes-still/300/169";

function uniqueId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

test.describe("episode details", () => {
  test.use({ httpCredentials: ADMIN_CREDENTIALS, storageState: ADMIN_STATE });

  test("an episode's synopsis and still show on the series and episode pages", async ({
    page,
    browser,
  }) => {
    const uid = uniqueId();
    const series = { id: `e2e-episodes-${uid}`, title: `E2E Episodes ${uid}` };
    const pilot = `${series.id}-season-1-episode-1`;
    const second = `${series.id}-season-1-episode-2`;
    await sql(
      `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, synopsis, "posterUrl", "backdropUrl", "publishedAt", "createdAt", "updatedAt")
       VALUES ($1, 'series', 'published', $2, 2001, '1 Season', ARRAY['Drama'], 'Canada', 'French',
               'Six friends share a house.', $3, $4, '2001-01-01', '2001-01-01', '2001-01-01')`,
      [series.id, series.title, POSTER, BACKDROP]
    );
    await sql(
      `INSERT INTO episode (id, "mediaId", "seasonNumber", "episodeNumber", title, duration, "stillUrl")
       VALUES ($1, $3, 1, 1, 'Pilot', '42 min', $4), ($2, $3, 1, 2, 'Second Date', '40 min', NULL)`,
      [pilot, second, series.id, STILL]
    );
    try {
      // The admin writes the pilot's synopsis.
      await page.goto(`/admin/library/episodes/${pilot}`);
      const main = page.locator("main");
      await main.getByLabel("Synopsis").fill("Moving day goes wrong.");
      await main.getByRole("button", { name: "Save changes" }).click();
      await expect(main.getByText("Saved.")).toBeVisible();
      expect(
        (await sql<{ synopsis: string }>(`SELECT synopsis FROM episode WHERE id = $1`, [pilot]))[0]
          .synopsis
      ).toBe("Moving day goes wrong.");

      // The series page: each row has a still and, when there's one, a synopsis.
      // A browser of its own, which the accessibility check needs.
      const guest = await guestPage(browser);
      await guest.goto(`/series/${series.id}`);
      const rows = guest.getByRole("tabpanel").getByRole("link");
      await expect(rows).toHaveCount(2);
      await expect(rows.nth(0)).toContainText("1. Pilot");
      await expect(rows.nth(0)).toContainText("Moving day goes wrong.");
      await expect(rows.nth(0).locator("img")).toHaveAttribute("src", STILL);
      // No still of its own: the series' backdrop.
      await expect(rows.nth(1).locator("img")).toHaveAttribute("src", BACKDROP);
      expect(await seriousViolations(guest)).toEqual([]);

      // The episode page: its synopsis, then the series'.
      await rows.nth(0).click();
      await expect(guest).toHaveURL(new RegExp(`/episode/${pilot}$`));
      const synopses = guest.locator("main p").filter({ hasText: /Moving day|Six friends/ });
      await expect(synopses).toHaveText([
        "Moving day goes wrong.",
        "About the series: Six friends share a house.",
      ]);
      await guest.close();
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [series.id]);
    }
  });
});
