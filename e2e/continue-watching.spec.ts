import { readFileSync } from "node:fs";
import type { Locator, Route } from "@playwright/test";
import { createVerifiedAccount, newAccount, sql } from "./accounts";
import { expect, seriousViolations, signedInPage, test } from "./fixtures";

/*
 * Continue Watching with Gayflix's own player: a file saves how far it
 * got (src/components/SourcePlayer.tsx), the watch page picks up there,
 * and the home row shows it, moves a series on to its next episode, and
 * lets a title be taken off. The video is a real two-minute clip,
 * served for a host on VIDEO_HOSTS (playwright.config.ts). The titles
 * are this test's own, dated in the past to stay off New Releases.
 */

const POSTER = "https://picsum.photos/seed/e2e-progress/500/750";
const CDN = "https://vz-1.cdn.e2e.example";
const CLIP = readFileSync("e2e/media/two-minutes.webm");

function uniqueId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** A published title; deleting it deletes its episodes and sources too. */
async function addTitle(id: string, title: string, type: "movie" | "series" = "movie") {
  await sql(
    `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "publishedAt", "createdAt", "updatedAt")
     VALUES ($1, $2::media_type, 'published', $3, 2001, '2m', ARRAY['Drama'], 'Canada', 'French', $4,
             '2001-01-01', '2001-01-01', '2001-01-01')`,
    [id, type, title, POSTER]
  );
}

async function addEpisode(id: string, seriesId: string, episodeNumber: number, title: string) {
  await sql(
    `INSERT INTO episode (id, "mediaId", "seasonNumber", "episodeNumber", title, duration)
     VALUES ($1, $2, 1, $3, $4, '2 min')`,
    [id, seriesId, episodeNumber, title]
  );
}

async function addFile(column: "mediaId" | "episodeId", id: string, url: string) {
  await sql(
    `INSERT INTO video_source (id, "${column}", label, kind, url, position, "updatedAt")
     VALUES ($1, $2, 'Direct', 'file', $3, 1, now())`,
    [`${id}-source`, id, url]
  );
}

/** The clip, a range of it at a time as a video host sends it, so the player can seek. */
function serveClip(route: Route) {
  const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range ?? "");
  const start = range ? Number(range[1]) : 0;
  const end = range?.[2] ? Number(range[2]) : CLIP.length - 1;
  return route.fulfill({
    status: range ? 206 : 200,
    contentType: "video/webm",
    headers: {
      "accept-ranges": "bytes",
      ...(range && { "content-range": `bytes ${start}-${end}/${CLIP.length}` }),
    },
    body: CLIP.subarray(start, end + 1),
  });
}

const currentTime = (video: Locator) => video.evaluate((v: HTMLVideoElement) => v.currentTime);

/** Jumps to `seconds` in, or to just before the end without it. */
async function seek(video: Locator, seconds?: number) {
  await video.evaluate(
    (v: HTMLVideoElement, to) => {
      v.currentTime = to ?? v.duration - 0.5;
    },
    seconds ?? null
  );
}

test("a video picks up where it stopped, and Continue Watching follows along", async ({
  browser,
  request,
}) => {
  const uid = uniqueId();
  const account = newAccount("progress");
  await createVerifiedAccount(request, account);
  const movie = { id: `e2e-progress-movie-${uid}`, title: `E2E Progress Movie ${uid}` };
  const series = { id: `e2e-progress-series-${uid}`, title: `E2E Progress Series ${uid}` };
  const pilot = `${series.id}-season-1-episode-1`;
  const second = `${series.id}-season-1-episode-2`;
  await addTitle(movie.id, movie.title);
  await addTitle(series.id, series.title, "series");
  await addEpisode(pilot, series.id, 1, "Pilot");
  await addEpisode(second, series.id, 2, "Second Date");
  await addFile("mediaId", movie.id, `${CDN}/${uid}/movie.webm`);
  await addFile("episodeId", pilot, `${CDN}/${uid}/pilot.webm`);

  /** The History entry's saved progress, once there is an entry. */
  const saved = async (mediaId: string) => {
    const [row] = await sql<{ position: number; duration: number; hidden: boolean }>(
      `SELECT h."progressSeconds" AS position, h."durationSeconds" AS duration,
              h."hiddenFromContinue" AS hidden
       FROM watch_history h JOIN "user" u ON u.id = h."userId"
       WHERE u.email = $1 AND h."mediaId" = $2`,
      [account.email, mediaId]
    );
    return row;
  };

  const page = await signedInPage(browser, account);
  await page.route(`${CDN}/${uid}/*.webm`, serveClip);
  const main = page.locator("main");
  const video = main.locator("video");
  const row = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Continue Watching" }) });
  try {
    // Watched to 0:50 of 2:00, then paused.
    await page.goto(`/watch/${movie.id}`);
    await main.getByRole("button", { name: `Play ${movie.title}` }).click();
    await expect.poll(() => saved(movie.id)).toBeTruthy();
    await seek(video, 50);
    await expect.poll(() => currentTime(video)).toBeGreaterThanOrEqual(50);
    await video.evaluate((v: HTMLVideoElement) => v.pause());
    await expect.poll(async () => (await saved(movie.id)).duration).toBe(120);
    const { position } = await saved(movie.id);
    expect(position).toBeGreaterThanOrEqual(50);
    expect(position).toBeLessThan(55);

    // Home shows how far in it is.
    await page.goto("/home");
    const movieCard = row.getByRole("link", { name: `Resume ${movie.title}, 2 min left` });
    await expect(movieCard).toContainText("2001 · 2 min left");
    expect(await seriousViolations(page)).toEqual([]);

    // Playing again picks up there.
    await movieCard.click();
    await main
      .getByRole("button", { name: `Resume ${movie.title} from 0:${String(position).padStart(2, "0")}` })
      .click();
    await expect.poll(() => currentTime(video)).toBeGreaterThanOrEqual(position);

    // Watched to the end: the movie leaves the row.
    await seek(video);
    await expect.poll(async () => (await saved(movie.id)).position).toBeGreaterThanOrEqual(110);

    // An episode watched to the end moves the series on to the next one.
    await page.goto(`/episode/${pilot}`);
    await main.getByRole("button", { name: `Play ${series.title}: Pilot` }).click();
    await expect.poll(() => saved(pilot)).toBeTruthy();
    await seek(video);
    await expect.poll(async () => (await saved(pilot)).position).toBeGreaterThanOrEqual(110);

    await page.goto("/home");
    const nextCard = row.getByRole("link", {
      name: `Play ${series.title}, next: season 1, episode 2: Second Date`,
    });
    await expect(nextCard).toHaveAttribute("href", `/episode/${second}`);
    await expect(nextCard).toContainText("Next: S1 · E2 · Second Date");
    await expect(row.getByRole("link")).toHaveCount(1);

    // Remove takes it off the row, and Undo puts it back.
    const remove = row.getByRole("button", { name: "Remove from Continue Watching" });
    await remove.click();
    await expect(row).toHaveCount(0);
    await expect(page.getByText(`Removed ${series.title} from Continue Watching`)).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(nextCard).toBeVisible();

    // Removed, it stays off, and stays in History.
    await remove.click();
    await expect.poll(async () => (await saved(pilot)).hidden).toBe(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Recently Added" })).toBeVisible();
    await expect(row).toHaveCount(0);
    await page.goto("/account/history");
    await expect(main.getByText(`${series.title}: Pilot`)).toBeVisible();

    // Watching it again puts it back.
    await page.goto(`/episode/${pilot}`);
    await main.getByRole("button", { name: `Play ${series.title}: Pilot` }).click();
    await expect.poll(async () => (await saved(pilot)).hidden).toBe(false);
  } finally {
    await sql(`DELETE FROM media WHERE id = ANY($1)`, [[movie.id, series.id]]);
  }
});
