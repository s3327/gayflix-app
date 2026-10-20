import { readFileSync } from "node:fs";
import { ADMIN_STATE, sql } from "./accounts";
import { ADMIN_CREDENTIALS, expect, seriousViolations, test } from "./fixtures";

/*
 * Subtitles: an admin uploads a SubRip or WebVTT file per language on a
 * movie's edit page (src/lib/admin-subtitle-actions.ts); it's kept as
 * WebVTT and served from /subtitles/<id> to the player's <track>s, while
 * the movie is published. The movie is this test's own, dated in the
 * past to stay off Recently Added.
 */

const POSTER = "https://picsum.photos/seed/e2e-subtitles/500/750";
const CLIP = readFileSync("e2e/media/two-minutes.webm");

const SRT = `1
00:00:01,000 --> 00:00:04,250
Hello, Gayflix.

2
00:00:05,500 --> 00:00:07,000
Two lines,
of text.
`;

function uniqueId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

test.describe("subtitles", () => {
  test.use({ httpCredentials: ADMIN_CREDENTIALS, storageState: ADMIN_STATE });

  test("an admin uploads subtitles, and the player offers them", async ({ page, browser }) => {
    const uid = uniqueId();
    const id = `e2e-subtitles-movie-${uid}`;
    const title = `E2E Subtitles Movie ${uid}`;
    await sql(
      `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "publishedAt", "createdAt", "updatedAt")
       VALUES ($1, 'movie', 'published', $2, 2001, '2m', ARRAY['Drama'], 'Canada', 'French', $3,
               '2001-01-01', '2001-01-01', '2001-01-01')`,
      [id, title, POSTER]
    );
    await sql(
      `INSERT INTO video_source (id, "mediaId", label, kind, url, position, "updatedAt")
       VALUES ($1, $2, 'Direct', 'file', $3, 1, now())`,
      [`${id}-source`, id, `https://vz-1.cdn.e2e.example/${uid}/movie.webm`]
    );
    const section = page.locator("main").getByRole("region", { name: "Subtitles" });
    const upload = section.getByRole("button", { name: "Upload subtitles" });
    try {
      await page.goto(`/admin/library/movies/${id}`);
      await expect(section.getByText("No subtitles yet.")).toBeVisible();

      // Not a subtitle file: refused, with the reason by the field.
      await section.getByLabel("Language").selectOption({ label: "English" });
      await section.getByLabel("File").setInputFiles({
        name: "notes.srt",
        mimeType: "application/x-subrip",
        buffer: Buffer.from("just some notes\n"),
      });
      await upload.click();
      await expect(section.getByText(/^That isn't a subtitle file we can read/)).toBeVisible();
      await expect(section.getByLabel("File")).toBeFocused();

      // A SubRip file is kept as WebVTT.
      await section.getByLabel("Language").selectOption({ label: "English" });
      await section.getByLabel("File").setInputFiles({
        name: "movie.en.srt",
        mimeType: "application/x-subrip",
        buffer: Buffer.from(SRT.replace(/\n/g, "\r\n")),
      });
      await upload.click();
      await expect(section.getByText("Added English subtitles.")).toBeVisible();
      const english = section.getByRole("listitem", { name: "English" });
      await expect(english).toContainText("movie.en.srt");
      expect(await seriousViolations(page)).toEqual([]);

      const [row] = await sql<{ id: string; content: string }>(
        `SELECT id, content FROM subtitle WHERE "mediaId" = $1 AND language = 'en'`,
        [id]
      );
      expect(row.content).toBe(
        "WEBVTT\n\n00:00:01.000 --> 00:00:04.250\nHello, Gayflix.\n\n00:00:05.500 --> 00:00:07.000\nTwo lines,\nof text.\n"
      );

      // The watch page's player has a <track> for it, served from this site.
      const guest = await browser.newPage();
      await guest.route(`https://vz-1.cdn.e2e.example/${uid}/movie.webm`, (route) =>
        route.fulfill({ contentType: "video/webm", body: CLIP })
      );
      await guest.goto(`/watch/${id}`);
      await guest.getByRole("button", { name: `Play ${title}` }).click();
      const track = guest.locator("main video track");
      await expect(track).toHaveAttribute("srclang", "en");
      await expect(track).toHaveAttribute("label", "English");
      await expect(track).toHaveAttribute("src", `/subtitles/${row.id}`);
      const file = await guest.request.get(`/subtitles/${row.id}`);
      expect(file.status()).toBe(200);
      expect(file.headers()["content-type"]).toBe("text/vtt; charset=utf-8");
      expect(await file.text()).toBe(row.content);

      // A draft's subtitles aren't served.
      await sql(`UPDATE media SET status = 'draft' WHERE id = $1`, [id]);
      expect((await guest.request.get(`/subtitles/${row.id}`)).status()).toBe(404);
      await guest.close();

      // Deleted after asking.
      await english.getByRole("button", { name: "Delete English subtitles" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Delete subtitles" }).click();
      await expect(section.getByText("No subtitles yet.")).toBeVisible();
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [id]);
    }
  });
});
