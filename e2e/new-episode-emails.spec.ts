import { createVerifiedAccount, newAccount, sql, waitForEmail } from "./accounts";
import { expect, guestPage, signedInPage, test } from "./fixtures";

/*
 * New-episode emails (A16): after the nightly job, members with a series
 * in Favorites that got episodes since the last run get one email; those
 * who turned them off get none. The email's link stops them, after
 * asking; Setting has the same switch. The job is called the way the
 * scheduler calls it.
 */

const CRON = { Authorization: "Bearer e2e-cron-secret" };
const POSTER = "https://picsum.photos/seed/e2e-new-episodes/500/750";

async function favorite(email: string, id: string, title: string) {
  await sql(
    `INSERT INTO favorite ("userId", "mediaId", entry)
     SELECT id, $2, $3::jsonb FROM "user" WHERE email = $1`,
    [email, id, JSON.stringify({ id, title, year: 2001, duration: "1 Season", type: "series", genre: "Drama" })]
  );
}

test("members hear about new episodes of their favorite series, until they stop it", async ({ browser, request }) => {
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const seriesId = `e2e-new-episodes-${uid}`;
  const seriesTitle = `E2E New Episodes ${uid}`;
  await sql(
    `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "publishedAt", "createdAt", "updatedAt")
     VALUES ($1, 'series', 'published', $2, 2001, '1 Season', '{Drama}', 'Canada', 'French', $3, '2001-01-01', '2001-01-01', '2001-01-01')`,
    [seriesId, seriesTitle, POSTER]
  );
  const fan = newAccount("episodes-fan");
  const quiet = newAccount("episodes-quiet");
  await createVerifiedAccount(request, fan);
  await createVerifiedAccount(request, quiet);
  await favorite(fan.email, seriesId, seriesTitle);
  await favorite(quiet.email, seriesId, seriesTitle);
  await sql(
    `INSERT INTO notification_setting ("userId", "newEpisodes", "updatedAt") SELECT id, false, now() FROM "user" WHERE email = $1`,
    [quiet.email]
  );

  try {
    // A run before the episodes, so they count as new on the next one.
    expect((await request.get("/api/cron/new-episode-emails", { headers: CRON })).ok()).toBe(true);
    const since = Date.now();
    for (const n of [1, 2]) {
      await sql(
        `INSERT INTO episode (id, "mediaId", "seasonNumber", "episodeNumber", title, duration)
         VALUES ($1, $2, 1, $3, $4, '42 min')`,
        [`${seriesId}-s1e${n}`, seriesId, n, `Chapter ${n}`]
      );
    }
    expect((await request.get("/api/cron/new-episode-emails", { headers: CRON })).ok()).toBe(true);

    const email = await waitForEmail(fan.email, since);
    expect(email).toContain(`${seriesTitle}: S1 E1 Chapter 1, S1 E2 Chapter 2`);
    expect(email).toContain(`/series/${seriesId}`);
    await expect(waitForEmail(quiet.email, since)).rejects.toThrow("No email");

    // The email's link asks, then stops them.
    const link = /(https?:\/\/\S+\/unsubscribe\?\S+)/.exec(email)![1];
    const guest = await guestPage(browser);
    await guest.goto(new URL(link).pathname + new URL(link).search);
    await expect(guest.getByRole("heading", { name: "New episode emails" })).toBeVisible();
    const setting = async (address: string) =>
      (
        await sql<{ newEpisodes: boolean }>(
          `SELECT n."newEpisodes" FROM notification_setting n JOIN "user" u ON u.id = n."userId" WHERE u.email = $1`,
          [address]
        )
      )[0]?.newEpisodes;
    expect(await setting(fan.email)).toBeUndefined();
    await guest.getByRole("button", { name: "Stop These Emails" }).click();
    await expect(guest.getByText("You won't get emails about new episodes anymore.")).toBeVisible();
    expect(await setting(fan.email)).toBe(false);

    // A link with the wrong signature does nothing.
    const forged = await request.post(`/api/unsubscribe?u=someone&t=not-the-signature`);
    expect(forged.status()).toBe(400);

    // Setting has the same switch.
    const page = await signedInPage(browser, fan);
    await page.goto("/account/setting");
    const toggle = page.getByRole("switch", { name: "New episodes of my favorite series" });
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await expect(page.getByText("New episode emails on")).toBeVisible();
    await expect.poll(() => setting(fan.email)).toBe(true);
  } finally {
    await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
  }
});
