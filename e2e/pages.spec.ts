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
  "/watch/chosen-family",
  "/episode/the-brownstone-season-1-episode-1",
  "/search?q=loud",
  "/login",
  "/signup",
  "/forgot-password",
  "/verify-email?email=a%40b.co",
  "/terms",
  "/privacy",
];

for (const path of PAGES) {
  test(`${path} renders without errors`, async ({ page, consoleProblems }) => {
    void consoleProblems;
    const response = await page.goto(path, { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
  });
}

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
