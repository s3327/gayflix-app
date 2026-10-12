import { sql } from "./accounts";
import { expect, seriousViolations, test } from "./fixtures";

/*
 * The player on the watch and episode pages (src/components/WatchPlayer.tsx):
 * a server tab per video source, and "Coming soon" without one. VIDEO_HOSTS
 * is "player.e2e.example,*.cdn.e2e.example" (playwright.config.ts). Those
 * hosts don't exist, so each test stands in for them with page.route. Every
 * test makes titles of its own and deletes them after; they're dated in the
 * past to stay off New Releases, which other tests read.
 */

const POSTER = "https://picsum.photos/seed/e2e-player/500/750";
const PLAYER = "https://player.e2e.example";
const CDN = "https://vz-1.cdn.e2e.example";

/** A VOD stream with one segment, next to the playlist. */
const PLAYLIST = [
  "#EXTM3U",
  "#EXT-X-VERSION:3",
  "#EXT-X-TARGETDURATION:4",
  "#EXT-X-PLAYLIST-TYPE:VOD",
  "#EXTINF:4.0,",
  "segment-0.ts",
  "#EXT-X-ENDLIST",
].join("\n");

function uniqueId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** A published title; deleting it deletes its episodes and sources too. */
async function addTitle(id: string, title: string, type: "movie" | "series" = "movie") {
  await sql(
    `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "createdAt", "updatedAt")
     VALUES ($1, $2::media_type, 'published', $3, 2001, '1h 30m', ARRAY['Drama'], 'Canada', 'French', $4,
             '2001-01-01', '2001-01-01')`,
    [id, type, title, POSTER]
  );
}

async function addEpisode(id: string, seriesId: string) {
  await sql(
    `INSERT INTO episode (id, "mediaId", "seasonNumber", "episodeNumber", title, duration)
     VALUES ($1, $2, 1, 1, 'Pilot', '42 min')`,
    [id, seriesId]
  );
}

type Source = { label: string; kind: "embed" | "hls" | "file"; url: string; enabled?: boolean };

/** Sources as the admin panel saves them, in this order. */
async function addSources(column: "mediaId" | "episodeId", id: string, sources: Source[]) {
  for (const [i, source] of sources.entries()) {
    await sql(
      `INSERT INTO video_source (id, "${column}", label, kind, url, position, enabled, "updatedAt")
       VALUES ($1, $2, $3, $4::video_source_kind, $5, $6, $7, now())`,
      [`${id}-source-${i + 1}`, id, source.label, source.kind, source.url, i + 1, source.enabled ?? true]
    );
  }
}

test("a movie or an episode without video is coming soon", async ({ page, consoleProblems }) => {
  void consoleProblems;
  const uid = uniqueId();
  const movie = { id: `e2e-player-soon-${uid}`, title: `E2E Coming Soon ${uid}` };
  const series = { id: `e2e-player-soon-series-${uid}`, title: `E2E Coming Soon Series ${uid}` };
  const episode = `${series.id}-season-1-episode-1`;
  await addTitle(movie.id, movie.title);
  await addTitle(series.id, series.title, "series");
  await addEpisode(episode, series.id);
  // One turned off, one on a host that's no longer allowed: neither plays.
  await addSources("mediaId", movie.id, [
    { label: "Off", kind: "embed", url: `${PLAYER}/embed/${uid}`, enabled: false },
    { label: "Elsewhere", kind: "embed", url: `https://elsewhere.example.com/embed/${uid}` },
  ]);
  const main = page.locator("main");
  try {
    await page.goto(`/watch/${movie.id}`);
    await expect(main.getByText("Coming soon", { exact: true })).toBeVisible();
    await expect(main.getByText("This movie isn't ready to watch yet. Check back soon.")).toBeVisible();
    await expect(main.getByRole("button", { name: `Play ${movie.title}` })).toHaveCount(0);
    await expect(main.getByRole("group", { name: "Servers" })).toHaveCount(0);
    await expect(main.getByRole("button", { name: "Report an issue" })).toHaveCount(0);
    expect(await seriousViolations(page)).toEqual([]);

    await page.goto(`/episode/${episode}`);
    await expect(main.getByText("This episode isn't ready to watch yet. Check back soon.")).toBeVisible();
    await expect(main.getByRole("group", { name: "Servers" })).toHaveCount(0);
  } finally {
    await sql(`DELETE FROM media WHERE id = ANY($1)`, [[movie.id, series.id]]);
  }
});

test("each video source is a server tab, and Play plays the chosen one", async ({
  page,
  consoleProblems,
}) => {
  void consoleProblems;
  const uid = uniqueId();
  const movie = { id: `e2e-player-tabs-${uid}`, title: `E2E Player Tabs ${uid}` };
  const embed = `${PLAYER}/embed/${uid}`;
  const file = `${CDN}/${uid}/movie.mp4`;
  const stream = `${CDN}/${uid}/playlist.m3u8`;
  await addTitle(movie.id, movie.title);
  await addSources("mediaId", movie.id, [
    { label: "Server 1", kind: "embed", url: embed },
    { label: "Off", kind: "embed", url: embed, enabled: false },
    { label: "Direct", kind: "file", url: file },
    { label: "Stream", kind: "hls", url: stream },
  ]);
  // The provider's player page, and a host that's slow to send video:
  // the file and the stream's segment stay downloading.
  await page.route(embed, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Player</title><p>Stand-in player</p>",
    })
  );
  await page.route(file, () => {});
  await page.route(stream, (route) =>
    route.fulfill({ contentType: "application/vnd.apple.mpegurl", body: PLAYLIST })
  );
  await page.route(`${CDN}/${uid}/segment-0.ts`, () => {});
  const main = page.locator("main");
  const servers = main.getByRole("group", { name: "Servers" });
  try {
    await page.goto(`/watch/${movie.id}`);
    await expect(servers.getByRole("button")).toHaveText(["Server 1", "Direct", "Stream"]);
    await expect(servers.getByRole("button", { name: "Server 1" })).toHaveAttribute("aria-pressed", "true");
    expect(await seriousViolations(page)).toEqual([]);

    // An embed plays in a frame, which takes focus from Play.
    await main.getByRole("button", { name: `Play ${movie.title}` }).click();
    const frame = main.getByTitle(`${movie.title} (Server 1)`);
    await expect(frame).toBeFocused();
    await expect(frame.contentFrame().getByText("Stand-in player")).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    // A video file plays in the browser's own player.
    await servers.getByRole("button", { name: "Direct" }).click();
    await expect(servers.getByRole("button", { name: "Direct" })).toHaveAttribute("aria-pressed", "true");
    await expect(frame).toHaveCount(0);
    const video = main.locator("video");
    await expect(video).toHaveAttribute("src", file);
    await expect(video).toHaveAccessibleName(movie.title);

    // A stream plays through hls.js: Media Source Extensions behind a
    // blob: link, fetching the playlist's segments.
    const segment = page.waitForRequest(`${CDN}/${uid}/segment-0.ts`);
    await servers.getByRole("button", { name: "Stream" }).click();
    await segment;
    await expect(video).toHaveAttribute("src", /^blob:/);
  } finally {
    await sql(`DELETE FROM media WHERE id = $1`, [movie.id]);
  }
});

test("a server that can't play says so, and can be tried again", async ({
  page,
  consoleProblems,
}) => {
  void consoleProblems;
  const uid = uniqueId();
  const movie = { id: `e2e-player-broken-${uid}`, title: `E2E Player Broken ${uid}` };
  const series = { id: `e2e-player-broken-series-${uid}`, title: `E2E Player Broken Series ${uid}` };
  const episode = `${series.id}-season-1-episode-1`;
  const file = `${CDN}/${uid}/movie.mp4`;
  const stream = `${CDN}/${uid}/playlist.m3u8`;
  await addTitle(movie.id, movie.title);
  await addTitle(series.id, series.title, "series");
  await addEpisode(episode, series.id);
  await addSources("mediaId", movie.id, [
    { label: "Direct", kind: "file", url: file },
    { label: "Stream", kind: "hls", url: stream },
  ]);
  await addSources("episodeId", episode, [{ label: "Stream", kind: "hls", url: stream }]);
  let fileRequests = 0;
  await page.route(file, (route) => {
    fileRequests++;
    return route.fulfill({ status: 404 });
  });
  await page.route(stream, (route) => route.fulfill({ status: 404 }));
  const main = page.locator("main");
  const alert = main.getByRole("alert");
  const tryAgain = main.getByRole("button", { name: "Try again" });
  try {
    await page.goto(`/watch/${movie.id}`);
    await main.getByRole("button", { name: `Play ${movie.title}` }).click();
    await expect(alert).toContainText("Direct isn't working right now.");
    await expect(alert).toContainText("Try again, or choose another server below.");
    await expect(main.locator("video")).toHaveCount(0);
    // Focus was on the video the message replaced, so it stays nearby.
    await page.keyboard.press("Tab");
    await expect(tryAgain).toBeFocused();
    expect(await seriousViolations(page)).toEqual([]);

    const tried = fileRequests;
    await tryAgain.click();
    await expect.poll(() => fileRequests).toBeGreaterThan(tried);
    await expect(alert).toContainText("Direct isn't working right now.");

    await main.getByRole("group", { name: "Servers" }).getByRole("button", { name: "Stream" }).click();
    await expect(alert).toContainText("Stream isn't working right now.");

    // With no other server, the way out is reporting it.
    await page.goto(`/episode/${episode}`);
    await main.getByRole("button", { name: `Play ${series.title}: Pilot` }).click();
    await expect(alert).toContainText("Stream isn't working right now.");
    await expect(alert).toContainText("Try again, or report it below so we can fix it.");
    await expect(main.getByRole("button", { name: "Report an issue" })).toBeVisible();
  } finally {
    await sql(`DELETE FROM media WHERE id = ANY($1)`, [[movie.id, series.id]]);
  }
});
