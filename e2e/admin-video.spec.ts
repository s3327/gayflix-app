import { ADMIN_STATE, sql } from "./accounts";
import { ADMIN_CREDENTIALS, expect, seriousViolations, test } from "./fixtures";

/*
 * The Video section of the movie and episode edit pages
 * (src/lib/admin-video-actions.ts). VIDEO_HOSTS is
 * "player.e2e.example,*.cdn.e2e.example" (playwright.config.ts). Every
 * test makes titles of its own and deletes them after.
 */

const POSTER = "https://picsum.photos/seed/e2e-video/500/750";

function uniqueId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function addTitle(id: string, title: string, type: "movie" | "series" = "movie") {
  await sql(
    `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "updatedAt")
     VALUES ($1, $2, 'draft', $3, 2024, '1h 30m', ARRAY['Drama'], 'Canada', 'English', $4, now())`,
    [id, type, title, POSTER]
  );
}

async function sources(column: "mediaId" | "episodeId", id: string) {
  return sql<{ label: string; kind: string; url: string; position: number; enabled: boolean }>(
    `SELECT label, kind::text, url, position, enabled FROM video_source
     WHERE "${column}" = $1 ORDER BY position`,
    [id]
  );
}

test.describe("video sources", () => {
  test.use({ httpCredentials: ADMIN_CREDENTIALS, storageState: ADMIN_STATE });

  test("a movie's sources can be added, reordered, turned off, edited and deleted", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const id = `e2e-video-movie-${uid}`;
    await addTitle(id, `E2E Video Movie ${uid}`);
    const main = page.locator("main");
    const video = main.getByRole("region", { name: "Video" });
    const list = video.getByRole("list");
    const add = video.getByRole("button", { name: "Add source" });
    try {
      const response = await page.goto(`/admin/library/movies/${id}`);
      // The player may frame, play and stream from the video hosts.
      expect(response?.headers()["content-security-policy"]).toContain(
        "frame-src https://www.youtube-nocookie.com https://player.e2e.example https://*.cdn.e2e.example;"
      );
      await expect(video.getByText("No video yet, so this movie has nothing to play.")).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);

      // Only links on VIDEO_HOSTS.
      await video.getByLabel("Link or embed code").fill("https://elsewhere.example.com/embed/1");
      await add.click();
      await expect(video.getByText(/^Videos can only come from player\.e2e\.example/)).toBeVisible();
      await expect(video.getByLabel("Link or embed code")).toBeFocused();

      // Embed code: its link is kept.
      await video
        .getByLabel("Link or embed code")
        .fill('<iframe width="640" src="https://player.e2e.example/embed/1?a=1&amp;b=2" allowfullscreen></iframe>');
      await add.click();
      await expect(video.getByText("Added Server 1.")).toBeVisible();
      const first = list.getByRole("listitem", { name: "Server 1" });
      await expect(first).toContainText("Embed");
      await expect(first).toContainText("https://player.e2e.example/embed/1?a=1&b=2");

      // The form starts over for the next one; a .m3u8 link is a stream.
      await expect(video.getByLabel("Name").last()).toHaveValue("Server 2");
      await video.getByLabel("Link or embed code").last().fill("https://vz-1.cdn.e2e.example/abc/playlist.m3u8");
      await add.click();
      const second = list.getByRole("listitem", { name: "Server 2" });
      await expect(second).toContainText("HLS stream");

      await second.getByRole("button", { name: "Move Server 2 up" }).click();
      await expect(list.getByRole("listitem").first()).toHaveAccessibleName("Server 2");
      await expect(list.getByRole("button", { name: "Move Server 2 up" })).toBeDisabled();

      await first.getByRole("button", { name: "Turn off" }).click();
      await expect(first).toContainText("Off");
      await expect(first.getByRole("button", { name: "Turn on" })).toBeVisible();

      await second.getByText("Edit Server 2").click();
      await second.getByLabel("Name").fill("Fast");
      await second.getByLabel("Type").selectOption("file");
      await second.getByLabel("Link or embed code").fill("https://vz-1.cdn.e2e.example/abc/movie.mp4");
      await second.getByRole("button", { name: "Save source" }).click();
      const fast = list.getByRole("listitem", { name: "Fast" });
      await expect(fast).toContainText("Video file");

      expect(await sources("mediaId", id)).toEqual([
        { label: "Fast", kind: "file", url: "https://vz-1.cdn.e2e.example/abc/movie.mp4", position: 1, enabled: true },
        { label: "Server 1", kind: "embed", url: "https://player.e2e.example/embed/1?a=1&b=2", position: 2, enabled: false },
      ]);

      await first.getByRole("button", { name: "Delete Server 1" }).click();
      await page
        .getByRole("dialog", { name: "Delete this source?" })
        .getByRole("button", { name: "Delete source" })
        .click();
      await expect(first).toHaveCount(0);
      expect((await sources("mediaId", id)).map((source) => source.label)).toEqual(["Fast"]);
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [id]);
    }
  });

  test("an episode has its own sources, and a trashed series' episodes can't change", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const series = `e2e-video-series-${uid}`;
    const episode = `${series}-season-1-episode-1`;
    await addTitle(series, `E2E Video Series ${uid}`, "series");
    await sql(
      `INSERT INTO episode (id, "mediaId", "seasonNumber", "episodeNumber", title, duration)
       VALUES ($1, $2, 1, 1, 'Pilot', '42 min')`,
      [episode, series]
    );
    const main = page.locator("main");
    const video = main.getByRole("region", { name: "Video" });
    try {
      // A series has no Video section: its video is on its episodes.
      await page.goto(`/admin/library/series/${series}`);
      await expect(main.getByRole("heading", { name: "Episodes" })).toBeVisible();
      await expect(video).toHaveCount(0);

      await page.goto(`/admin/library/episodes/${episode}`);
      await video.getByLabel("Link or embed code").fill("https://vz-2.cdn.e2e.example/s1e1.webm");
      await video.getByRole("button", { name: "Add source" }).click();
      await expect(video.getByRole("listitem", { name: "Server 1" })).toContainText("Video file");
      expect(await sources("episodeId", episode)).toMatchObject([{ kind: "file", position: 1 }]);

      await sql(`UPDATE media SET "trashedAt" = now() WHERE id = $1`, [series]);
      await page.reload();
      await expect(main.getByText("Its series is in the trash.")).toBeVisible();
      await expect(video).toHaveCount(0);
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [series]);
    }
  });
});
