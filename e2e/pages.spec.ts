import { USER_STATE } from "./accounts";
import { test, expect } from "./fixtures";

const PAGES = [
  "/",
  "/home",
  "/trending",
  "/new-releases",
  "/browse",
  "/genre?genre=Drama",
  "/country",
  "/year",
  "/language",
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
  await expect(page).toHaveURL(/\/genre\?genre=Drama$/);
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

test("unknown pages get the branded 404", async ({ page }) => {
  const response = await page.goto("/definitely-not-a-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
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
  expect(xml).not.toContain("/admin");
  expect(xml).not.toContain("/account");

  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Sitemap: http://localhost:3000/sitemap.xml");
});
