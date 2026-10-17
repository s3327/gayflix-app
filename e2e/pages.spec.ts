import { USER_STATE } from "./accounts";
import { test, expect } from "./fixtures";

const PAGES = [
  "/",
  "/home",
  "/trending",
  "/new-releases",
  "/browse",
  "/browse?genre=Drama&type=movie&year=2020s&sort=title",
  "/movie",
  "/series",
  "/movie/chosen-family",
  "/series/the-brownstone",
  // Titles with only the basics (no synopsis, cast or episodes).
  "/movie/loud-and-proud",
  "/series/loud-address",
  "/watch/chosen-family",
  "/episode/the-brownstone-season-1-episode-1",
  "/search?q=loud",
  "/login",
  "/signup",
  "/forgot-password",
  "/verify-email?email=a%40b.co",
  "/terms",
  "/privacy",
  "/about",
  "/contact",
  "/copyright",
];

for (const path of PAGES) {
  test(`${path} renders without errors`, async ({ page, consoleProblems }) => {
    void consoleProblems;
    const response = await page.goto(path, { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
  });
}

test("the landing page leads into the site, and the logo leads back to it", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Love. Stories. Ours.");
  await expect(page.getByRole("link", { name: "Start Browsing" }).first()).toHaveAttribute(
    "href",
    "/home"
  );
  await expect(page.getByRole("link", { name: "Sign Up" })).toHaveAttribute("href", "/signup");
  await page.getByRole("link", { name: "Drama", exact: true }).click();
  await expect(page).toHaveURL(/\/browse\?genre=Drama$/);
  await expect(page.getByRole("link", { name: "Gayflix home" })).toHaveAttribute("href", "/");
});

test.describe("signed in", () => {
  test.use({ storageState: USER_STATE });

  test("the landing page sends members home instead of to sign up", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("navigation", { name: "Account" }).getByRole("link", { name: "Go to Home" })
    ).toHaveAttribute("href", "/home");
    await expect(page.getByRole("link", { name: "Sign Up" })).toHaveCount(0);
  });

  test("the account menu reaches every account page", async ({ page }) => {
    await page.goto("/home");
    await page.getByRole("button", { name: "Account menu" }).click();
    for (const [name, href] of [
      ["My Account", "/account"],
      ["Favorites", "/account/favorite"],
      ["My Lists", "/account/favorite?tab=lists"],
      ["History", "/account/history"],
      ["Settings", "/account/setting"],
    ]) {
      await expect(page.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
    }

    // My Lists opens the Lists tab, even from the Favorites tab.
    await page.getByRole("link", { name: "Favorites", exact: true }).click();
    await expect(page).toHaveURL(/\/account\/favorite$/);
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("link", { name: "My Lists", exact: true }).click();
    await expect(page).toHaveURL(/\/account\/favorite\?tab=lists$/);
    await expect(page.getByRole("button", { name: "Create List" })).toBeVisible();
    await expect(page.getByRole("link", { name: "My Lists" })).toHaveCount(0);
  });
});

test("the sign-in pages' logo leads back to the landing page", async ({ page }) => {
  for (const path of ["/login", "/signup", "/forgot-password"]) {
    await page.goto(path);
    await expect(page.getByRole("link", { name: "Gayflix home" })).toHaveAttribute("href", "/");
  }
});

test("pages name themselves in the tab, and title pages carry a link preview", async ({
  page,
}) => {
  await page.goto("/browse");
  await expect(page).toHaveTitle("Browse · Gayflix");

  await page.goto("/movie/chosen-family");
  await expect(page).toHaveTitle("Chosen Family (2025) · Gayflix");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /Provincetown/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /^https:\/\//);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    "content",
    /\/movie\/chosen-family$/
  );

  await page.goto("/episode/the-brownstone-season-1-episode-1");
  await expect(page).toHaveTitle("The Brownstone S1 E1: Move-In Day · Gayflix");
});

test("watch pages lead back to the title's own page", async ({ page }) => {
  await page.goto("/watch/chosen-family");
  await page.getByRole("heading", { level: 1 }).getByRole("link", { name: "Chosen Family" }).click();
  await expect(page).toHaveURL(/\/movie\/chosen-family$/);

  await page.goto("/episode/the-brownstone-season-1-episode-1");
  await page.getByRole("main").getByRole("link", { name: "The Brownstone", exact: true }).click();
  await expect(page).toHaveURL(/\/series\/the-brownstone$/);
});

test("Recently Added is named for what it lists", async ({ page }) => {
  await page.goto("/home");
  await page.getByRole("navigation").getByRole("link", { name: "Recently Added" }).first().click();
  await expect(page).toHaveURL(/\/new-releases$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Recently Added");
  await expect(page).toHaveTitle("Recently Added · Gayflix");
});

test("unknown pages get the branded 404, with a search and popular titles", async ({ page }) => {
  const response = await page.goto("/definitely-not-a-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Popular on Gayflix" }).getByRole("link")
  ).toHaveCount(6);
  await page.getByRole("searchbox", { name: "Search titles" }).fill("Chosen");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/search\?q=Chosen$/);
});

test("listing pages describe themselves and name their own address", async ({ page }) => {
  const canonical = page.locator('link[rel="canonical"]');
  await page.goto("/home");
  await expect(page).toHaveTitle("Home · Gayflix");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /trending/);
  await expect(canonical).toHaveAttribute("href", /\/home$/);

  await page.goto("/browse?sort=title&genre=Drama");
  await expect(canonical).toHaveAttribute("href", /\/browse\?genre=Drama&sort=title$/);

  // A movie's watch page points search engines at the movie's own page.
  await page.goto("/watch/chosen-family");
  await expect(canonical).toHaveAttribute("href", /\/movie\/chosen-family$/);
});

test("scripts carry the per-request CSP nonce", async ({ page }) => {
  const response = await page.goto("/home");
  const csp = response?.headers()["content-security-policy"] ?? "";
  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
  expect(nonce).toBeTruthy();
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  const scriptNonces = await page.$$eval("script", (scripts) =>
    scripts.map((script) => script.nonce)
  );
  expect(scriptNonces.length).toBeGreaterThan(0);
  expect(scriptNonces.every((value) => value === nonce)).toBe(true);
});

test("client-side navigation works under the CSP", async ({ page, consoleProblems }) => {
  void consoleProblems;
  await page.goto("/home", { waitUntil: "networkidle" });
  await page.getByRole("navigation").getByRole("link", { name: "Trending" }).first().click();
  await expect(page).toHaveURL(/\/trending$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Trending");
});

test("sitemap lists public pages and published titles only", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  const xml = await response.text();
  expect(xml).toContain("<loc>http://localhost:3000/home</loc>");
  expect(xml).toContain("/movie/chosen-family</loc>");
  expect(xml).toContain("/episode/the-brownstone-season-1-episode-1</loc>");
  expect(xml).toContain("/browse?genre=Drama</loc>");
  expect(xml).not.toContain("/admin");
  expect(xml).not.toContain("/account");

  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Sitemap: http://localhost:3000/sitemap.xml");
});

test("a bar shows from a click on a link until the next page arrives", async ({ page }) => {
  await page.goto("/new-releases");
  // Hold the next page back a moment, as a slow connection would.
  await page.route(/\/movie\/|\/series\//, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.continue();
  });
  const bar = page.getByRole("progressbar", { name: "Loading page" });
  await expect(bar).toHaveCount(0);
  await page.locator("main a[href^='/movie/'], main a[href^='/series/']").first().click();
  await expect(bar).toBeVisible();
  await expect(page).toHaveURL(/\/(movie|series)\//);
  await expect(bar).toHaveCount(0);
});
