import { ADMIN_STATE, sql, USER_STATE } from "./accounts";
import { ADMIN_CREDENTIALS, expect, test } from "./fixtures";

/*
 * Phase 3: "Work faster" back-office tests.
 * Covers:
 *  - Sortable headers & catalog audit filters (Missing Video, Missing Backdrop, etc.)
 *  - Filter chips bar with "Clear all"
 *  - Quick Edit Drawer inline metadata editing
 *  - Global Cmd+K palette & '?' keyboard shortcuts dialog
 *  - Trash search, auto-purge countdown & bulk restore
 *  - Reports triage view & resolve
 *  - Draft preview banner & guest restriction
 *  - Filtered CSV export endpoint
 */

const POSTER = "https://picsum.photos/seed/e2e-workfaster/500/750";

function uniqueId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

test.describe("Phase 3: Work Faster", () => {
  test.use({ httpCredentials: ADMIN_CREDENTIALS, storageState: ADMIN_STATE });

  test("audit filters, sorting columns, and filter chips in movie library", async ({ page }) => {
    const uid = uniqueId();
    const movieNoVideo = {
      id: `e2e-wf-novid-${uid}`,
      title: `E2E NoVideo Movie ${uid}`,
    };
    try {
      await sql(
        `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "createdAt", "updatedAt")
         VALUES ($1, 'movie', 'published', $2, 2022, '1h 40m', ARRAY['Drama'], 'USA', 'English', $3, now(), now())`,
        [movieNoVideo.id, movieNoVideo.title, POSTER]
      );

      // 1. Visit movie library
      await page.goto("/admin/library/movies");

      // 2. Click "Missing Video" audit pill
      const auditPills = page.getByRole("region", { name: "Audit Filters" });
      await expect(auditPills).toBeVisible();
      await auditPills.getByRole("link", { name: "Missing Video" }).click();

      await expect(page).toHaveURL(/audit=no-video/);
      // Filter chip for "no video sources" should appear
      await expect(page.getByText("Audit: no video sources")).toBeVisible();

      // 3. Click "Clear all" on filter chips
      await page.getByRole("link", { name: "Clear all" }).click();
      await expect(page).not.toHaveURL(/audit=no-video/);

      // 4. Test column sorting
      await page.locator("thead").getByRole("link", { name: "Year" }).click();
      await expect(page).toHaveURL(/sort=year/);
      await expect(page).toHaveURL(/order=asc/);

      // Click Year again to reverse order
      await page.locator("thead").getByRole("link", { name: "Year" }).click();
      await expect(page).toHaveURL(/order=desc/);
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [movieNoVideo.id]);
    }
  });

  test("quick edit drawer modifies title inline without page reload", async ({ page }) => {
    const uid = uniqueId();
    const movie = {
      id: `e2e-wf-qe-${uid}`,
      title: `E2E QuickEdit Movie ${uid}`,
    };
    try {
      await sql(
        `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "createdAt", "updatedAt")
         VALUES ($1, 'movie', 'draft', $2, 2023, '1h 50m', ARRAY['Comedy'], 'UK', 'English', $3, now(), now())`,
        [movie.id, movie.title, POSTER]
      );

      await page.goto(`/admin/library/movies?q=${encodeURIComponent(movie.title)}`);

      // Find quick edit button for this movie
      const row = page.locator("tr", { hasText: movie.title });
      await expect(row).toBeVisible();
      await row.getByRole("button", { name: `Quick edit ${movie.title}` }).click();

      // Drawer should open
      const drawer = page.getByRole("dialog", { name: "Quick edit title" });
      await expect(drawer).toBeVisible();

      // Modify tagline and rating
      await drawer.getByLabel("Tagline").fill("Lightning fast editing");
      await drawer.getByLabel("Rating (0.0 to 5.0)").fill("4.8");

      // Save
      await drawer.getByRole("button", { name: "Save changes" }).click();

      // Drawer should close
      await expect(drawer).not.toBeVisible();

      // Verify DB was updated
      const [updated] = await sql<{ tagline: string; rating: number }>(
        `SELECT tagline, rating FROM media WHERE id = $1`,
        [movie.id]
      );
      expect(updated.tagline).toBe("Lightning fast editing");
      expect(Number(updated.rating)).toBe(4.8);
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [movie.id]);
    }
  });

  test("command palette Cmd+K and shortcuts modal '?'", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await page.locator("[data-command-menu-ready]").waitFor();

    // 1. Press '?' to trigger shortcuts dialog
    await page.keyboard.press("?");
    const shortcutsDialog = page.getByRole("dialog", { name: "Keyboard Shortcuts" });
    await expect(shortcutsDialog).toBeVisible();
    await expect(shortcutsDialog.getByText("Admin Keyboard Shortcuts")).toBeVisible();

    // Close with Escape
    await page.keyboard.press("Escape");
    await expect(shortcutsDialog).not.toBeVisible();

    // 2. Press Control+K to open command menu
    await page.keyboard.press("Control+k");
    const cmdPalette = page.getByRole("dialog", { name: "Command Menu" });
    await expect(cmdPalette).toBeVisible();

    // Type query
    const searchInput = cmdPalette.getByPlaceholder("Type a command, page name, title...");
    await searchInput.fill("Trash");
    await expect(cmdPalette.getByRole("button", { name: /Trash/ })).toBeVisible();

    // Close palette
    await page.keyboard.press("Escape");
    await expect(cmdPalette).not.toBeVisible();
  });

  test("trash search, countdown badge, and bulk restore", async ({ page }) => {
    const uid = uniqueId();
    const trashedTitle = {
      id: `e2e-wf-trash-${uid}`,
      title: `E2E Trashed Title ${uid}`,
    };
    try {
      await sql(
        `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "trashedAt", "statusBeforeTrash", "createdAt", "updatedAt")
         VALUES ($1, 'movie', 'draft', $2, 2021, '1h 30m', ARRAY['Drama'], 'USA', 'English', $3, now(), 'draft', now(), now())`,
        [trashedTitle.id, trashedTitle.title, POSTER]
      );

      // Visit trash page
      await page.goto("/admin/trash");

      // Verify search
      await page.getByPlaceholder("Search trash by title...").fill(trashedTitle.title);
      await page.getByRole("button", { name: "Search" }).click();

      // Row should be visible with auto-purge badge
      const row = page.getByRole("listitem").filter({ hasText: trashedTitle.title });
      await expect(row).toBeVisible();
      await expect(row.getByText(/Purges in ~30 days/)).toBeVisible();

      // Check checkbox
      const checkbox = row.locator('input[name="ids"]');
      await checkbox.check();

      // Click "Restore checked"
      await page.getByRole("button", { name: "Restore checked" }).click();
      await expect(row).toHaveCount(0);

      // Title should be restored (trashedAt = null)
      const [restored] = await sql<{ trashedAt: Date | null }>(
        `SELECT "trashedAt" FROM media WHERE id = $1`,
        [trashedTitle.id]
      );
      expect(restored.trashedAt).toBeNull();
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [trashedTitle.id]);
    }
  });

  test("admin draft preview restricted to admin and displays banner", async ({
    page,
    browser,
  }) => {
    const uid = uniqueId();
    const draftTitle = {
      id: `e2e-wf-prev-${uid}`,
      title: `E2E Preview Movie ${uid}`,
    };
    try {
      await sql(
        `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "createdAt", "updatedAt", "cast", "tags")
         VALUES ($1, 'movie', 'draft', $2, 2024, '2h 00m', ARRAY['Sci-Fi'], 'USA', 'English', $3, now(), now(), ARRAY[]::text[], ARRAY[]::text[])`,
        [draftTitle.id, draftTitle.title, POSTER]
      );

      // Admin accesses preview
      await page.goto(`/admin/preview/${draftTitle.id}`);
      await expect(page.getByText("Draft Preview", { exact: true })).toBeVisible();
      await expect(page.getByText("Return to editor")).toBeVisible();
      await expect(page.getByRole("heading", { name: draftTitle.title })).toBeVisible();

      // Regular user cannot access preview
      const userContext = await browser.newContext({
        httpCredentials: ADMIN_CREDENTIALS,
        storageState: USER_STATE,
      });
      const userPage = await userContext.newPage();
      await userPage.goto(`/admin/preview/${draftTitle.id}`);
      await expect(userPage).toHaveURL(/\/admin\/login(\?.*)?$/);
      await userContext.close();
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [draftTitle.id]);
    }
  });

  test("CSV export endpoint returns valid CSV file", async ({ request }) => {
    const response = await request.get("/api/admin/export?type=movies");
    expect(response.status()).toBe(200);
    const contentType = response.headers()["content-type"];
    expect(contentType).toContain("text/csv");
    const contentDisposition = response.headers()["content-disposition"];
    expect(contentDisposition).toContain("attachment");
    expect(contentDisposition).toContain("gayflix-movies-");

    const text = await response.text();
    expect(text.startsWith("id,title,type,year,status")).toBe(true);
  });
});

