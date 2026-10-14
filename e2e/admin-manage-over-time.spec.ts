import { ADMIN_STATE, sql } from "./accounts";
import { ADMIN_CREDENTIALS, expect, test } from "./fixtures";

/*
 * Phase 4: "Manage over time" administrative platform tests.
 * Covers:
 *  - Activity logging after catalog mutations with filterable activity log & CSV export
 *  - System Settings tabs, Maintenance Mode with admin bypass, and public redirect
 *  - Background scheduled jobs manual execution & execution history logging
 *  - Title revision snapshots diff/rollback from title editor
 *  - RBAC role assignment & user profile details update
 *  - Full catalog JSON backup export endpoint
 */

const POSTER = "https://picsum.photos/seed/e2e-phase4/500/750";

function uniqueId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

test.describe("Phase 4: Manage Over Time", () => {
  test.use({ httpCredentials: ADMIN_CREDENTIALS, storageState: ADMIN_STATE });

  test("activity logging tracks catalog operations and displays on activity page", async ({
    page,
  }) => {
    const uid = uniqueId();
    const movie = {
      id: `e2e-act-${uid}`,
      title: `E2E Activity Movie ${uid}`,
    };

    try {
      // 1. Create a movie via DB
      await sql(
        `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "createdAt", "updatedAt")
         VALUES ($1, 'movie', 'draft', $2, 2024, '1h 30m', ARRAY['Drama'], 'USA', 'English', $3, now(), now())`,
        [movie.id, movie.title, POSTER]
      );

      // 2. Quick edit the title to trigger activity logging
      await page.goto(`/admin/library/movies?q=${encodeURIComponent(movie.title)}`);
      const row = page.locator("tr", { hasText: movie.title });
      await expect(row).toBeVisible();
      await row.getByRole("button", { name: `Quick edit ${movie.title}` }).click();

      const drawer = page.getByRole("dialog", { name: "Quick edit title" });
      await expect(drawer).toBeVisible();
      await drawer.getByLabel("Tagline").fill("Logged in activity");
      await drawer.getByRole("button", { name: "Save changes" }).click();
      await expect(drawer).not.toBeVisible();

      // 3. Visit activity page
      await page.goto("/admin/activity");
      await expect(page.getByRole("heading", { name: "Activity Log" })).toBeVisible();

      // 4. Verify search by action or actor works
      await page.getByLabel("Filter by action").fill("title.quick_edit");
      await page.getByRole("button", { name: "Filter" }).click();
      await expect(page).toHaveURL(/action=title\.quick_edit/);

      // Verify the activity row is present in the table
      await expect(page.getByText(`Quick edited "${movie.title}"`)).toBeVisible();

      // 5. Check CSV export link is present and valid
      const exportLink = page.getByRole("link", { name: "Export CSV" });
      await expect(exportLink).toBeVisible();
      await expect(exportLink).toHaveAttribute("href", "/api/admin/export?type=activity");
    } finally {
      await sql(`DELETE FROM "ActivityLog" WHERE "entityId" = $1`, [movie.id]);
      await sql(`DELETE FROM "TitleRevision" WHERE "mediaId" = $1`, [movie.id]);
      await sql(`DELETE FROM media WHERE id = $1`, [movie.id]);
    }
  });

  test("site settings update, export, and maintenance mode toggle", async ({
    page,
    browser,
  }) => {
    const uid = uniqueId();
    const testTagline = `Streaming with pride ${uid}`;

    try {
      // 1. Visit settings page
      await page.goto("/admin/settings");
      await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

      // 2. Modify tagline in General tab
      const taglineInput = page.getByLabel("Site Tagline");
      await taglineInput.fill(testTagline);
      await page.getByRole("button", { name: "Save Settings" }).click();
      await expect(page.getByRole("status")).toContainText("Settings saved successfully.");

      // 3. Switch to Access & Maintenance tab
      await page.getByRole("tab", { name: "Access & Maintenance" }).click();
      const maintenanceCheckbox = page.getByLabel("Enable Maintenance Mode");

      // Enable maintenance mode
      if (!(await maintenanceCheckbox.isChecked())) {
        await maintenanceCheckbox.check();
        await page.getByRole("button", { name: "Save Settings" }).click();
        await expect(page.getByRole("status")).toContainText("Settings saved successfully.");
      }

      // 4. Test unauthenticated visitor is redirected to /maintenance
      const visitorContext = await browser.newContext();
      const visitorPage = await visitorContext.newPage();
      try {
        await visitorPage.goto("/");
        await expect(visitorPage).toHaveURL(/.*\/maintenance/);
        await expect(visitorPage.getByText("Under Maintenance")).toBeVisible();
      } finally {
        await visitorContext.close();
      }

      // 5. Staff bypass: admin in admin panel still sees warning banner or can browse
      await page.goto("/admin/dashboard");
      await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

      // 6. Restore maintenance mode to false
      await page.goto("/admin/settings");
      await page.getByRole("tab", { name: "Access & Maintenance" }).click();
      await page.getByLabel("Enable Maintenance Mode").uncheck();
      await page.getByRole("button", { name: "Save Settings" }).click();
      await expect(page.getByRole("status")).toContainText("Settings saved successfully.");

      // 7. Verify JSON backup export
      const jsonRes = await page.request.get("/api/admin/export?type=catalog-json");
      expect(jsonRes.status()).toBe(200);
      const jsonBody = await jsonRes.json();
      expect(jsonBody).toHaveProperty("totalTitles");
      expect(Array.isArray(jsonBody.movies)).toBe(true);
      expect(Array.isArray(jsonBody.series)).toBe(true);
    } finally {
      // Reset maintenance mode in DB just in case
      await sql(
        `UPDATE "SiteSetting" SET "maintenanceMode" = false WHERE id = 'default'`
      );
    }
  });

  test("background jobs execution and system health monitoring", async ({ page }) => {
    await page.goto("/admin/jobs");
    await expect(page.getByRole("heading", { name: "Jobs & Health" })).toBeVisible();

    // 1. Verify health metric cards are visible
    await expect(page.getByText("System & Database Health")).toBeVisible();
    await expect(page.getByText("Operational")).toBeVisible();

    // 2. Trigger "30-Day Trash Auto-Purge" job
    const runTrashButton = page.getByRole("button", { name: "Run 30-Day Trash Auto-Purge" });
    await expect(runTrashButton).toBeVisible();
    await runTrashButton.click();

    // Wait for feedback
    const feedback = page.getByRole("status");
    await expect(feedback).toBeVisible();
    await expect(feedback).toContainText("completed");

    // 3. Verify execution was added to history table
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("cell", { name: "30-Day Trash Auto-Purge" }).first()).toBeVisible();
  });

  test("title revision snapshots diff and rollback", async ({ page }) => {
    const uid = uniqueId();
    const movie = {
      id: `e2e-rev-${uid}`,
      title: `E2E Original Title ${uid}`,
      synopsis: `Original synopsis for revision test ${uid}`,
    };

    try {
      // 1. Insert original title
      await sql(
        `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, synopsis, "posterUrl", "createdAt", "updatedAt")
         VALUES ($1, 'movie', 'draft', $2, 2021, '1h 35m', ARRAY['Drama'], 'USA', 'English', $3, $4, now(), now())`,
        [movie.id, movie.title, movie.synopsis, POSTER]
      );

      // 2. Open edit page
      await page.goto(`/admin/library/movies/${movie.id}`);
      await expect(page.getByRole("heading", { name: movie.title })).toBeVisible();

      // 3. Save an edit to create a snapshot
      await page.getByLabel("Title").fill(`E2E Modified Title ${uid}`);
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByRole("status")).toHaveText("Saved.");

      // 4. Open Revisions modal
      const revisionsBtn = page.getByRole("button", { name: /Revisions \(\d+\)/ });
      await expect(revisionsBtn).toBeVisible();
      await revisionsBtn.click();

      const modal = page.getByRole("dialog", { name: "Revision History" });
      await expect(modal).toBeVisible();

      // 5. View snapshot details
      await modal.getByRole("button", { name: "View snapshot" }).first().click();
      await expect(modal.getByText(movie.title)).toBeVisible();

      // 6. Roll back: accept confirm dialog
      page.on("dialog", (dialog) => dialog.accept());
      await modal.getByRole("button", { name: /Restore revision/ }).first().click();

      // 7. Verify title was restored
      await page.waitForTimeout(1200);
      const [restored] = await sql<{ title: string }>(
        `SELECT title FROM media WHERE id = $1`,
        [movie.id]
      );
      expect(restored.title).toBe(movie.title);
    } finally {
      await sql(`DELETE FROM "TitleRevision" WHERE "mediaId" = $1`, [movie.id]);
      await sql(`DELETE FROM "ActivityLog" WHERE "entityId" = $1`, [movie.id]);
      await sql(`DELETE FROM media WHERE id = $1`, [movie.id]);
    }
  });

  test("user management RBAC role assignment and profile update", async ({ page }) => {
    const uid = uniqueId();
    const testUser = {
      id: `e2e-u-${uid}`,
      name: `E2E Test User ${uid}`,
      email: `testuser-${uid}@example.com`,
    };

    try {
      // 1. Insert test user with role 'user'
      await sql(
        `INSERT INTO "user" (id, name, email, "emailVerified", role, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, true, 'user', now(), now())`,
        [testUser.id, testUser.name, testUser.email]
      );

      // 2. Visit user page
      await page.goto(`/admin/users/${testUser.id}`);
      await expect(page.getByRole("heading", { name: testUser.name })).toBeVisible();

      // 3. Edit profile details via modal
      await page.getByRole("button", { name: "Edit Profile" }).click();
      const modal = page.getByRole("dialog", { name: "Edit User Profile" });
      await expect(modal).toBeVisible();

      await modal.getByLabel("Display Name").fill(`${testUser.name} Updated`);
      await modal.getByRole("button", { name: "Save Changes" }).click();

      // Verify name updated in UI
      await expect(page.getByRole("heading", { name: `${testUser.name} Updated` })).toBeVisible();

      // 4. Update role to Editor
      const roleSelect = page.getByLabel("User role");
      await roleSelect.selectOption("editor");
      await page.getByRole("button", { name: "Update Role" }).click();

      // Verify role badge displays Editor
      await expect(page.getByText("Editor", { exact: true })).toBeVisible();

      // Verify DB updated
      const [dbUser] = await sql<{ role: string }>(
        `SELECT role FROM "user" WHERE id = $1`,
        [testUser.id]
      );
      expect(dbUser.role).toBe("editor");
    } finally {
      await sql(`DELETE FROM "ActivityLog" WHERE "entityId" = $1`, [testUser.id]);
      await sql(`DELETE FROM "user" WHERE id = $1`, [testUser.id]);
    }
  });
});
