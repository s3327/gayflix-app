import { readFileSync } from "node:fs";
import { sql } from "./accounts";
import { expect, test } from "./fixtures";

const CLIP = readFileSync("e2e/media/two-minutes.webm");

/*
 * Add to home screen, AirPlay and Chromecast (A17): the web app manifest
 * and its icons, the tags iPhones and Android read, and the player's
 * casting, which only offers Cast when the browser finds a TV.
 */

test("the site can be added to a home screen", async ({ page, request }) => {
  await page.goto("/home");
  const head = page.locator("head");
  await expect(head.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  await expect(head.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#0b0b0f");
  await expect(head.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  await expect(head.locator('meta[name="mobile-web-app-capable"], meta[name="apple-mobile-web-app-capable"]').first()).toHaveAttribute("content", "yes");

  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "Gayflix", start_url: "/home", display: "standalone" });
  const purposes = manifest.icons.map((icon: { sizes: string; purpose: string }) => `${icon.sizes} ${icon.purpose}`);
  expect(purposes).toEqual(["192x192 any", "512x512 any", "512x512 maskable"]);
  for (const icon of manifest.icons as { src: string }[]) {
    const response = await request.get(icon.src);
    expect(response.ok(), icon.src).toBe(true);
    expect(response.headers()["content-type"]).toBe("image/png");
  }
});

test("the player allows AirPlay, and offers Cast only when there's a TV", async ({ page }) => {
  // A movie of this test's own, played from a file: a <video> the browser can cast.
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const id = `e2e-cast-movie-${uid}`;
  const title = `E2E Cast Movie ${uid}`;
  await sql(
    `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "publishedAt", "createdAt", "updatedAt")
     VALUES ($1, 'movie', 'published', $2, 2001, '2m', ARRAY['Drama'], 'Canada', 'French', $3,
             '2001-01-01', '2001-01-01', '2001-01-01')`,
    [id, title, "https://picsum.photos/seed/e2e-cast/500/750"]
  );
  await sql(
    `INSERT INTO video_source (id, "mediaId", label, kind, url, position, "updatedAt")
     VALUES ($1, $2, 'Direct', 'file', $3, 1, now())`,
    [`${id}-source`, id, `https://vz-1.cdn.e2e.example/${uid}/movie.webm`]
  );
  try {
    await page.route(`https://vz-1.cdn.e2e.example/${uid}/movie.webm`, (route) =>
      route.fulfill({ contentType: "video/webm", body: CLIP })
    );
    await page.goto(`/watch/${id}`);
    await page.getByRole("button", { name: `Play ${title}` }).click();
    const video = page.locator("main video");
    await expect(video).toHaveAttribute("x-webkit-airplay", "allow");
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0);
    // A headless browser finds no TVs, so there's nothing to cast to.
    await expect(page.getByRole("button", { name: "Cast to a TV" })).toHaveCount(0);
  } finally {
    await sql(`DELETE FROM media WHERE id = $1`, [id]);
  }
});
