import type { Page } from "@playwright/test";
import { createVerifiedAccount, newAccount, sql } from "./accounts";
import { expect, guestPage, seriousViolations, signedInPage, test } from "./fixtures";

/*
 * Pressing Play counts a view (src/lib/view-actions.ts), and Trending
 * ranks titles by this week's views. Tests that count views use titles of
 * their own, so other tests' plays don't change their numbers. Those
 * titles are dated in the past to stay off New Releases, which other
 * tests read.
 */

const POSTER = "https://picsum.photos/seed/e2e-views/500/750";

function uniqueId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** A published title; deleting it deletes its episodes and views too. */
async function addTitle(id: string, title: string, type: "movie" | "series" = "movie") {
  await sql(
    `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "publishedAt", "createdAt", "updatedAt")
     VALUES ($1, $2::media_type, 'published', $3, 2001, '1h 30m', ARRAY['Drama'], 'Canada', 'French', $4,
             '2001-01-01', '2001-01-01', '2001-01-01')`,
    [id, type, title, POSTER]
  );
}

/** A video source, so the title (or the episode) has a Play button. */
async function addSource(column: "mediaId" | "episodeId", id: string) {
  await sql(
    `INSERT INTO video_source (id, "${column}", label, kind, url, position, "updatedAt")
     VALUES ($1, $2, 'Server 1', 'embed', $3, 1, now())`,
    [`${id}-source`, id, `https://player.e2e.example/embed/${id}`]
  );
}

/** Presses Play as a guest and waits for the view to be counted. */
async function play(page: Page, title: string) {
  // A guest's history stays in the browser, so this is the only server call.
  const counted = page.waitForResponse(
    (r) => r.request().method() === "POST" && "next-action" in r.request().headers()
  );
  await page.getByRole("button", { name: `Play ${title}` }).click();
  expect((await counted).ok()).toBe(true);
}

/** This week's views and the all-time count. */
async function views(id: string) {
  const [row] = await sql<{ week: number; total: number }>(
    `SELECT (SELECT count(*)::int FROM media_view WHERE "mediaId" = $1) AS week,
            (SELECT "viewCount" FROM media WHERE id = $1) AS total`,
    [id]
  );
  return row;
}

test("a view counts once per person per title per day", async ({ browser }) => {
  const uid = uniqueId();
  const movie = { id: `e2e-views-movie-${uid}`, title: `E2E Views Movie ${uid}` };
  const series = { id: `e2e-views-series-${uid}`, title: `E2E Views Series ${uid}` };
  const episode = `${series.id}-season-1-episode-1`;
  await addTitle(movie.id, movie.title);
  await addTitle(series.id, series.title, "series");
  await sql(
    `INSERT INTO episode (id, "mediaId", "seasonNumber", "episodeNumber", title, duration)
     VALUES ($1, $2, 1, 1, 'Pilot', '42 min')`,
    [episode, series.id]
  );
  await addSource("mediaId", movie.id);
  await addSource("episodeId", episode);
  try {
    const guest = await guestPage(browser, "203.0.113.10");
    await guest.goto(`/watch/${movie.id}`, { waitUntil: "networkidle" });
    await play(guest, movie.title);
    await guest.reload({ waitUntil: "networkidle" });
    await play(guest, movie.title);
    expect(await views(movie.id)).toEqual({ week: 1, total: 1 });

    // Another IP address is another viewer.
    const otherGuest = await guestPage(browser, "203.0.113.11");
    await otherGuest.goto(`/watch/${movie.id}`, { waitUntil: "networkidle" });
    await play(otherGuest, movie.title);
    expect(await views(movie.id)).toEqual({ week: 2, total: 2 });

    // An episode's view counts for its series.
    await guest.goto(`/episode/${episode}`, { waitUntil: "networkidle" });
    await play(guest, `${series.title}: Pilot`);
    expect(await views(series.id)).toEqual({ week: 1, total: 1 });
    // The rows hold a hash, never the address.
    const viewers = await sql<{ viewer: string }>(
      `SELECT viewer FROM media_view WHERE "mediaId" = $1`,
      [movie.id]
    );
    expect(viewers.map((row) => row.viewer)).toEqual([
      expect.stringMatching(/^[0-9a-f]{64}$/),
      expect.stringMatching(/^[0-9a-f]{64}$/),
    ]);
  } finally {
    await sql(`DELETE FROM media WHERE id = ANY($1)`, [[movie.id, series.id]]);
  }
});

test("Trending ranks titles by this week's views", async ({ page, consoleProblems }) => {
  void consoleProblems;
  const uid = uniqueId();
  const hot = { id: `e2e-hot-${uid}`, title: `E2E Hot ${uid}` };
  const old = { id: `e2e-old-${uid}`, title: `E2E Old ${uid}` };
  await addTitle(hot.id, hot.title);
  await addTitle(old.id, old.title);
  // More views today than other tests' plays give any title, and even
  // more for a title whose views are all from before the last 7 days.
  await sql(
    `INSERT INTO media_view ("mediaId", viewer, day)
     SELECT $1, 'e2e-' || n, (now() AT TIME ZONE 'UTC')::date FROM generate_series(1, 1000) n`,
    [hot.id]
  );
  await sql(
    `INSERT INTO media_view ("mediaId", viewer, day)
     SELECT $1, 'e2e-' || n, (now() AT TIME ZONE 'UTC')::date - 7 FROM generate_series(1, 2000) n`,
    [old.id]
  );
  try {
    await page.goto("/trending");
    const first = page.locator('main a[href^="/movie/"], main a[href^="/series/"]').first();
    await expect(first).toHaveAttribute("href", `/movie/${hot.id}`);
    await expect(first).toContainText("#1");
    await expect(page.locator(`main a[href="/movie/${old.id}"]`)).toHaveCount(0);

    await page.goto("/home");
    const row = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Trending Now" }) });
    // The first link is See More.
    await expect(row.getByRole("link").nth(1)).toHaveAttribute("href", `/movie/${hot.id}`);
  } finally {
    await sql(`DELETE FROM media WHERE id = ANY($1)`, [[hot.id, old.id]]);
  }
});

test("Continue Watching shows a signed-in user's latest titles", async ({ browser, request }) => {
  const account = newAccount("continue");
  await createVerifiedAccount(request, account);
  const historyIds = async () =>
    (
      await sql<{ mediaId: string }>(
        `SELECT h."mediaId" FROM watch_history h JOIN "user" u ON u.id = h."userId"
         WHERE u.email = $1`,
        [account.email]
      )
    ).map((row) => row.mediaId);

  // Guests don't get the row: their history is in the browser until they sign in.
  const guest = await guestPage(browser);
  await guest.goto("/home");
  await expect(guest.getByRole("heading", { name: "Recently Added" })).toBeVisible();
  await expect(guest.getByRole("heading", { name: "Continue Watching" })).toHaveCount(0);

  const page = await signedInPage(browser, account);
  await page.goto("/home");
  await expect(page.getByRole("heading", { name: "Recently Added" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Continue Watching" })).toHaveCount(0);

  for (const [id, title] of [
    ["the-brownstone-season-1-episode-1", "The Brownstone: Move-In Day"],
    ["chosen-family", "Chosen Family"],
    ["the-brownstone-season-1-episode-2", "The Brownstone: The Landlord Problem"],
  ]) {
    await page.goto(id === "chosen-family" ? `/watch/${id}` : `/episode/${id}`, {
      waitUntil: "networkidle",
    });
    await page.getByRole("button", { name: `Play ${title}` }).click();
    await expect.poll(historyIds).toContain(id);
  }
  // A title that's no longer published drops off, even when it was the latest.
  await sql(
    `INSERT INTO watch_history ("userId", "mediaId", entry, "watchedAt")
     SELECT id, 'cabin-fever', $2::jsonb, now() + interval '1 minute' FROM "user" WHERE email = $1`,
    [
      account.email,
      JSON.stringify({
        id: "cabin-fever",
        title: "Cabin Fever",
        year: 2024,
        duration: "1h 30m",
        type: "movie",
        genre: "Horror",
      }),
    ]
  );

  await page.goto("/home");
  const row = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Continue Watching" }) });
  const cards = row.getByRole("link");
  // One card per title: the series is at the episode played last.
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toHaveAttribute("href", "/episode/the-brownstone-season-1-episode-2");
  await expect(cards.nth(0)).toHaveAccessibleName(
    "Resume The Brownstone, season 1, episode 2: The Landlord Problem"
  );
  await expect(cards.nth(0)).toContainText("S1 · E2 · The Landlord Problem");
  await expect(cards.nth(1)).toHaveAttribute("href", "/watch/chosen-family");
  await expect(cards.nth(1)).toHaveAccessibleName("Resume Chosen Family");
  expect(await seriousViolations(page)).toEqual([]);

  await cards.nth(0).click();
  await expect(page).toHaveURL(/\/episode\/the-brownstone-season-1-episode-2$/);
});
