import { sql } from "./accounts";
import { expect, seriousViolations, test } from "./fixtures";

/*
 * A title's page (src/components/TitleDetail.tsx): the header with the
 * backdrop, facts, maturity rating and actions, what the title contains,
 * the trailer in YouTube's privacy-enhanced player, and Share. The movie
 * is this test's own, dated in the past to stay off Recently Added.
 */

const POSTER = "https://picsum.photos/seed/e2e-title-page/500/750";
const BACKDROP = "https://picsum.photos/seed/e2e-title-page-backdrop/1280/720";

function uniqueId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

test("a title's page leads with its header, rating, trailer and Share", async ({ page, context }) => {
  const uid = uniqueId();
  const id = `e2e-title-page-${uid}`;
  const title = `E2E Title Page ${uid}`;
  await sql(
    `INSERT INTO media (id, type, status, title, year, duration, "runtimeMinutes", genres, country, language,
                        synopsis, "posterUrl", "backdropUrl", "trailerUrl", "maturityRating", "contentNotes",
                        "publishedAt", "createdAt", "updatedAt")
     VALUES ($1, 'movie', 'published', $2, 2001, '1h 35m', 95, ARRAY['Drama', 'Romance'], 'Canada', 'French',
             'Two neighbours fall for each other.', $3, $4, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
             '16', ARRAY['sex', 'queerphobia'], '2001-01-01', '2001-01-01', '2001-01-01')`,
    [id, title, POSTER, BACKDROP]
  );
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  try {
    await page.goto(`/movie/${id}`);
    const header = page.getByRole("region", { name: title });
    await expect(header.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(header).toContainText("2001");
    await expect(header).toContainText("Rated 16+");
    await expect(header).toContainText("1h 35m");
    await expect(header).toContainText("Drama · Romance");
    await expect(header.getByRole("link", { name: "Watch Now" })).toHaveAttribute("href", `/watch/${id}`);
    await expect(page.getByText("Contains: Sex, homophobia or transphobia")).toBeVisible();
    // The details keep the runtime in minutes.
    await expect(page.getByText("95 min")).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    // Nothing from YouTube loads until the trailer is opened.
    await expect(page.locator("iframe")).toHaveCount(0);
    await header.getByRole("button", { name: "Trailer" }).click();
    const dialog = page.getByRole("dialog", { name: `${title}: Trailer` });
    await expect(dialog.locator("iframe")).toHaveAttribute(
      "src",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0"
    );
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toHaveCount(0);

    // Share copies the page's link where there's no share sheet.
    await page.evaluate(() => {
      Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    });
    await header.getByRole("button", { name: "Share" }).click();
    await expect(page.getByText("Link copied")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(new RegExp(`/movie/${id}$`));
  } finally {
    await sql(`DELETE FROM media WHERE id = $1`, [id]);
  }
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the title and Play are on the first screen", async ({ page }) => {
    await page.goto("/movie/chosen-family");
    const play = page.getByRole("link", { name: "Watch Now" });
    await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
    await expect(play).toBeInViewport();
  });
});
