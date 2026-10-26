import { sql } from "./accounts";
import { expect, seriousViolations, test } from "./fixtures";

/*
 * The header's links, New & Popular, the home page's turning hero and its
 * sideways rows (Phase 2: D1, D2, D4). The hero test's titles are its
 * own, published now with backdrops so they're among the hero's titles.
 */

const POSTER = "https://picsum.photos/seed/e2e-hero/500/750";
const BACKDROP = "https://picsum.photos/seed/e2e-hero-backdrop/1280/720";

test("the header links to Home, Movies, Series, New & Popular, Browse and My List", async ({ page }) => {
  await page.goto("/home");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav.getByRole("link")).toHaveText([
    "Home",
    "Movies",
    "Series",
    "New & Popular",
    "Browse",
    "My List",
  ]);
  await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");

  // My List is the account's Watchlist; a guest logs in and comes back to it.
  await nav.getByRole("link", { name: "My List" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Faccount%2Ffavorite%3Ftab%3Dwatchlist$/);
});

test("New & Popular leads to Trending, Recently Added and the most watched", async ({ page }) => {
  await page.goto("/new-popular");
  await expect(page).toHaveTitle("New & Popular · Gayflix");
  const seeMore = (heading: string) =>
    page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: heading }) })
      .getByRole("link", { name: "See More" });
  await expect(seeMore("Recently Added")).toHaveAttribute("href", "/new-releases");
  await expect(seeMore("Most Watched")).toHaveAttribute("href", "/browse");
  expect(await seriousViolations(page)).toEqual([]);
});

test("the home page hero turns through its titles, and can be paused or chosen", async ({ page }) => {
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const ids = [1, 2].map((n) => `e2e-hero-${n}-${uid}`);
  for (const [i, id] of ids.entries()) {
    await sql(
      `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "backdropUrl", "publishedAt", "createdAt", "updatedAt")
       VALUES ($1, 'movie', 'published', $2, 2026, '1h 30m', ARRAY['Drama'], 'Canada', 'French', $3, $4,
               now() + make_interval(secs => $5), now(), now())`,
      [id, `E2E Hero ${i + 1} ${uid}`, POSTER, BACKDROP, i]
    );
  }
  try {
    await page.goto("/home");
    const hero = page.getByRole("region", { name: "Featured titles" });
    const dots = hero.getByRole("button", { name: /^Show / });
    expect(await dots.count()).toBeGreaterThanOrEqual(2);
    // Only the shown title can be read: the first, whose name is the page's h1.
    await expect(hero.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(dots.first()).toHaveAttribute("aria-current", "true");

    // Pause stops it; a dot chooses a title, whose name is then the one shown.
    await hero.getByRole("button", { name: "Pause slideshow" }).click();
    await expect(hero.getByRole("button", { name: "Play slideshow" })).toBeVisible();
    const second = dots.nth(1);
    const secondTitle = ((await second.getAttribute("aria-label")) ?? "").replace(/^Show /, "");
    await second.click();
    await expect(second).toHaveAttribute("aria-current", "true");
    await expect(hero.getByRole("heading", { level: 2, name: secondTitle })).toBeVisible();
    await expect(hero.getByRole("heading", { level: 1 })).toHaveCount(0);

    // The rows below scroll sideways and lead to their whole lists.
    const recent = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Recently Added" }) });
    await expect(recent.getByRole("link", { name: "See More" })).toHaveAttribute("href", "/new-releases");
    expect(await seriousViolations(page)).toEqual([]);
  } finally {
    await sql(`DELETE FROM media WHERE id = ANY($1)`, [ids]);
  }
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the hero ends on the first screen, so the first row peeks in", async ({ page }) => {
    await page.goto("/home");
    const box = await page.getByRole("region", { name: "Featured titles" }).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThan(844 - 40);
  });
});

test("a card in a sideways row opens its title when clicked, and a drag doesn't", async ({ page }) => {
  await page.goto("/home");
  const row = page.locator("section").filter({ has: page.getByRole("heading", { name: "Recently Added" }) });
  const card = row.getByRole("link").filter({ hasText: /\S/ }).nth(1);
  const href = await card.getAttribute("href");
  expect(href).toMatch(/^\/(movie|series)\//);

  // Dragging across the posters scrolls the row, without opening one.
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
  await page.mouse.down();
  await page.mouse.move(box.x - 40, box.y + box.height / 3, { steps: 8 });
  await page.mouse.up();
  await expect(page).toHaveURL(/\/home$/);

  // A plain click opens it.
  await card.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
});
