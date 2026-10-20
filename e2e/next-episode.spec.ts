import { readFileSync } from "node:fs";
import type { Locator, Route } from "@playwright/test";
import { sql } from "./accounts";
import { expect, test } from "./fixtures";

/*
 * Up next: when an episode played in Gayflix's own player ends, the next
 * one is queued with a countdown, and starts playing on its own page
 * (WatchPlayer and UpNext). The video is a real two-minute clip, served
 * for a host on VIDEO_HOSTS (playwright.config.ts). The series is this
 * test's own, dated in the past to stay off Recently Added.
 */

const POSTER = "https://picsum.photos/seed/e2e-next/500/750";
const CDN = "https://vz-2.cdn.e2e.example";
const CLIP = readFileSync("e2e/media/two-minutes.webm");

function uniqueId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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

/** Jumps to just before the end, so it ends a moment later. */
const seekToEnd = (video: Locator) =>
  video.evaluate((v: HTMLVideoElement) => {
    v.currentTime = v.duration - 0.5;
    return v.play();
  });

test("the next episode is queued when one ends, and starts on its own", async ({ page }) => {
  const uid = uniqueId();
  const series = { id: `e2e-next-series-${uid}`, title: `E2E Next Series ${uid}` };
  const pilot = `${series.id}-season-1-episode-1`;
  const second = `${series.id}-season-1-episode-2`;
  await sql(
    `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "publishedAt", "createdAt", "updatedAt")
     VALUES ($1, 'series', 'published', $2, 2001, '1 Season', ARRAY['Drama'], 'Canada', 'French', $3,
             '2001-01-01', '2001-01-01', '2001-01-01')`,
    [series.id, series.title, POSTER]
  );
  for (const [id, n, title] of [
    [pilot, 1, "Pilot"],
    [second, 2, "Second Date"],
  ] as const) {
    await sql(
      `INSERT INTO episode (id, "mediaId", "seasonNumber", "episodeNumber", title, duration)
       VALUES ($1, $2, 1, $3, $4, '2 min')`,
      [id, series.id, n, title]
    );
    await sql(
      `INSERT INTO video_source (id, "episodeId", label, kind, url, position, "updatedAt")
       VALUES ($1, $2, 'Direct', 'file', $3, 1, now())`,
      [`${id}-source`, id, `${CDN}/${uid}/${n}.webm`]
    );
  }

  await page.route(`${CDN}/${uid}/*.webm`, serveClip);
  const main = page.locator("main");
  const video = main.locator("video");
  const upNext = main.getByRole("group", { name: "Up next" });
  try {
    await page.goto(`/episode/${pilot}`);
    await main.getByRole("button", { name: `Play ${series.title}: Pilot` }).click();
    await expect.poll(() => currentTime(video)).toBeGreaterThan(0);

    // At the end, the next episode is offered, with focus on playing it.
    await seekToEnd(video);
    await expect(upNext).toBeVisible();
    await expect(upNext).toContainText("S1 · E2 — Second Date");
    await expect(upNext.getByRole("button", { name: "Play next episode" })).toBeFocused();

    // Cancel stays on this episode.
    await upNext.getByRole("button", { name: "Cancel" }).click();
    await expect(upNext).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/episode/${pilot}$`));

    // Left alone, the countdown moves on, and the next episode plays.
    await seekToEnd(video);
    await expect(upNext).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/episode/${second}$`), { timeout: 15_000 });
    await expect(main.getByRole("button", { name: /^Play / })).toHaveCount(0);
    await expect.poll(() => currentTime(video)).toBeGreaterThan(0);

    // The last episode has nothing after it.
    await seekToEnd(video);
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.ended)).toBe(true);
    await expect(upNext).toHaveCount(0);
  } finally {
    await sql(`DELETE FROM media WHERE id = $1`, [series.id]);
  }
});
