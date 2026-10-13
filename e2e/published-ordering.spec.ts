import { ADMIN_STATE, sql } from "./accounts";
import { ADMIN_CREDENTIALS, expect, test } from "./fixtures";

/*
 * Publication Timestamp & Public Ordering (R4 / Features 18-21):
 * - publishedAt timestamp assignment on transition to published
 * - publishedAt preserved across trash and restore
 * - Public catalog queries ordered by publishedAt DESC, id DESC
 * - NEW badge freshness evaluated against publishedAt (<= 7 days)
 * - New Releases page ordering and badge evaluation
 */

const POSTER = "https://picsum.photos/seed/e2e-pub-order/500/750";

function uniqueId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

test.describe("publication timestamp and ordering", () => {
  test.use({ httpCredentials: ADMIN_CREDENTIALS, storageState: ADMIN_STATE });

  // Tier 1: Feature Coverage (>=5 cases)

  test("T1-Pub-1: publishedAt is assigned current UTC timestamp when draft transitions to published", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const movieId = `e2e-pub-trans-${uid}`;
    const title = `E2E Pub Trans ${uid}`;
    await sql(
      `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "createdAt", "updatedAt")
       VALUES ($1, 'movie', 'draft', $2, 2024, '90 min', ARRAY['Drama'], 'Canada', 'English', $3, now(), now())`,
      [movieId, title, POSTER]
    );
    try {
      // Draft has null publishedAt
      const [before] = await sql<{ publishedAt: string | null }>(
        `SELECT "publishedAt" FROM media WHERE id = $1`,
        [movieId]
      );
      expect(before.publishedAt).toBeNull();

      // Publish through admin editor
      await page.goto(`/admin/library/movies/${movieId}`);
      await page.getByLabel("Status").selectOption("published");
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(page.getByText("Saved.", { exact: true })).toBeVisible();

      // Check publishedAt assigned
      const [after] = await sql<{ publishedAt: string | null }>(
        `SELECT "publishedAt" FROM media WHERE id = $1`,
        [movieId]
      );
      expect(after.publishedAt).not.toBeNull();
      const ageMs = Math.abs(Date.now() - new Date(after.publishedAt!).getTime());
      expect(ageMs).toBeLessThan(15000); // within 15 seconds of now
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [movieId]);
    }
  });

  test("T1-Pub-2: title created directly as published has publishedAt assigned immediately", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const title = `E2E Direct Pub ${uid}`;
    const id = `e2e-direct-pub-${uid}`;
    try {
      await page.goto("/admin/upload/movies");
      await page.getByLabel("Title", { exact: true }).fill(title);
      await page.getByLabel("Year").fill("2024");
      await page.getByLabel("Runtime in minutes").fill("90");
      await page.getByLabel("Genres").fill("Drama");
      await page.getByLabel("Country").fill("Canada");
      await page.getByLabel("Language").fill("English");
      await page.getByLabel("Poster image link").fill(POSTER);
      await page.getByLabel("Status").selectOption("published");
      await page.getByRole("button", { name: "Add movie" }).click();

      await expect(page).toHaveURL(new RegExp(`/admin/library/movies/${id}`));
      const [row] = await sql<{ publishedAt: string | null; status: string }>(
        `SELECT "publishedAt", status FROM media WHERE id = $1`,
        [id]
      );
      expect(row.status).toBe("published");
      expect(row.publishedAt).not.toBeNull();
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [id]);
    }
  });

  test("T1-Pub-3: publishedAt is preserved across trash and restore transitions", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const movieId = `e2e-preserve-pub-${uid}`;
    const title = `E2E Preserve Pub ${uid}`;
    const historicPub = "2024-03-01T12:00:00.000Z";

    await sql(
      `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "publishedAt", "createdAt", "updatedAt")
       VALUES ($1, 'movie', 'published', $2, 2024, '90 min', ARRAY['Drama'], 'Canada', 'English', $3, $4::timestamptz, now(), now())`,
      [movieId, title, POSTER, historicPub]
    );
    try {
      // 1. Trash title
      await page.goto(`/admin/library/movies/${movieId}`);
      await page.getByRole("button", { name: "Move to trash" }).click();
      await expect(page.getByText("This title is in the trash")).toBeVisible();

      let [row] = await sql<{ publishedAt: string; trashedAt: string | null; status?: string }>(
        `SELECT "publishedAt", "trashedAt", status FROM media WHERE id = $1`,
        [movieId]
      );
      expect(row.trashedAt).not.toBeNull();
      expect(new Date(row.publishedAt).toISOString()).toBe(historicPub);

      // 2. Restore title
      await page.goto("/admin/trash");
      const trashedItem = page.getByRole("listitem").filter({ hasText: uid });
      await trashedItem.getByRole("button", { name: /^Restore/ }).click();
      await expect(trashedItem).toHaveCount(0);

      // 3. Verify publishedAt was preserved (not overwritten by restore)
      [row] = await sql<{ publishedAt: string; trashedAt: string | null; status: string }>(
        `SELECT "publishedAt", "trashedAt", status FROM media WHERE id = $1`,
        [movieId]
      );
      expect(row.status).toBe("published");
      expect(row.trashedAt).toBeNull();
      expect(new Date(row.publishedAt).toISOString()).toBe(historicPub);
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [movieId]);
    }
  });

  test("T1-Pub-4: New Releases page orders titles strictly by publishedAt DESC, id DESC", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const titles = [
      {
        id: `e2e-order-a-${uid}`,
        title: `E2E Order A ${uid}`,
        createdAt: "2023-01-01T00:00:00Z",
        publishedAt: new Date(Date.now()).toISOString(), // Published today
      },
      {
        id: `e2e-order-b-${uid}`,
        title: `E2E Order B ${uid}`,
        createdAt: "2023-06-01T00:00:00Z",
        publishedAt: new Date(Date.now() - 2 * 86400000).toISOString(), // Published 2 days ago
      },
      {
        id: `e2e-order-c-${uid}`,
        title: `E2E Order C ${uid}`,
        createdAt: "2024-01-01T00:00:00Z",
        publishedAt: new Date(Date.now() - 5 * 86400000).toISOString(), // Published 5 days ago
      },
    ];

    for (const t of titles) {
      await sql(
        `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "publishedAt", "createdAt", "updatedAt")
         VALUES ($1, 'movie', 'published', $2, 2024, '90 min', ARRAY['Drama'], 'Canada', 'English', $3, $4::timestamptz, $5::timestamptz, now())`,
        [t.id, t.title, POSTER, t.publishedAt, t.createdAt]
      );
    }

    try {
      await page.goto("/new-releases");
      // Find cards matching this test's unique ID
      const cards = page.locator("main a").filter({ hasText: uid });
      await expect(cards).toHaveCount(3);

      // Verify strict publishedAt descending order: A (today) -> B (2d ago) -> C (5d ago)
      // Even though C was created more recently than A!
      await expect(cards.nth(0)).toHaveAttribute("href", `/movie/${titles[0].id}`);
      await expect(cards.nth(1)).toHaveAttribute("href", `/movie/${titles[1].id}`);
      await expect(cards.nth(2)).toHaveAttribute("href", `/movie/${titles[2].id}`);
    } finally {
      await sql(`DELETE FROM media WHERE id = ANY($1)`, [titles.map((t) => t.id)]);
    }
  });

  test("T1-Pub-5: NEW badge is displayed strictly based on publishedAt freshness (<= 7 days)", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const freshMovie = {
      id: `e2e-fresh-${uid}`,
      title: `E2E Fresh ${uid}`,
      createdAt: "2020-01-01T00:00:00Z", // Old creation date
      publishedAt: new Date(Date.now()).toISOString(), // Published today -> should have NEW badge
    };
    const oldMovie = {
      id: `e2e-oldpub-${uid}`,
      title: `E2E Old Pub ${uid}`,
      createdAt: new Date().toISOString(), // Fresh creation date
      publishedAt: new Date(Date.now() - 14 * 86400000).toISOString(), // Published 14 days ago -> NO badge
    };

    for (const m of [freshMovie, oldMovie]) {
      await sql(
        `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "publishedAt", "createdAt", "updatedAt")
         VALUES ($1, 'movie', 'published', $2, 2024, '90 min', ARRAY['Drama'], 'Canada', 'English', $3, $4::timestamptz, $5::timestamptz, now())`,
        [m.id, m.title, POSTER, m.publishedAt, m.createdAt]
      );
    }

    try {
      await page.goto("/new-releases");
      const freshCard = page.locator("main a").filter({ hasText: freshMovie.title });
      const oldCard = page.locator("main a").filter({ hasText: oldMovie.title });

      // freshMovie has NEW badge
      await expect(freshCard.getByText("NEW", { exact: true })).toBeVisible();

      // oldMovie does NOT have NEW badge
      await expect(oldCard.getByText("NEW", { exact: true })).toHaveCount(0);
    } finally {
      await sql(`DELETE FROM media WHERE id = ANY($1)`, [[freshMovie.id, oldMovie.id]]);
    }
  });

  test("T1-Pub-6: Movies and Series catalog browse pages order by publishedAt DESC", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const m1 = {
      id: `e2e-browse-m1-${uid}`,
      title: `E2E Browse M1 ${uid}`,
      publishedAt: new Date(Date.now()).toISOString(),
    };
    const m2 = {
      id: `e2e-browse-m2-${uid}`,
      title: `E2E Browse M2 ${uid}`,
      publishedAt: new Date(Date.now() - 86400000).toISOString(),
    };

    for (const m of [m1, m2]) {
      await sql(
        `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "publishedAt", "createdAt", "updatedAt")
         VALUES ($1, 'movie', 'published', $2, 2024, '90 min', ARRAY['Drama'], 'Canada', 'English', $3, $4::timestamptz, now(), now())`,
        [m.id, m.title, POSTER, m.publishedAt]
      );
    }

    try {
      await page.goto("/movie");
      const cards = page.locator("main a").filter({ hasText: uid });
      await expect(cards).toHaveCount(2);
      await expect(cards.nth(0)).toHaveAttribute("href", `/movie/${m1.id}`);
      await expect(cards.nth(1)).toHaveAttribute("href", `/movie/${m2.id}`);
    } finally {
      await sql(`DELETE FROM media WHERE id = ANY($1)`, [[m1.id, m2.id]]);
    }
  });

  // Tier 2: Boundary & Corner Cases (>=5 cases)

  test("T2-Pub-1: tie-breaking by id DESC when two titles have identical publishedAt timestamps", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const identicalTime = new Date(Date.now() + 60000).toISOString();
    const tA = { id: `e2e-order-aaa-${uid}`, title: `E2E Tie AAA ${uid}` };
    const tZ = { id: `e2e-order-zzz-${uid}`, title: `E2E Tie ZZZ ${uid}` };

    for (const t of [tA, tZ]) {
      await sql(
        `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "publishedAt", "createdAt", "updatedAt")
         VALUES ($1, 'movie', 'published', $2, 2024, '90 min', ARRAY['Drama'], 'Canada', 'English', $3, $4::timestamptz, now(), now())`,
        [t.id, t.title, POSTER, identicalTime]
      );
    }

    try {
      await page.goto("/new-releases");
      const cards = page.locator("main a").filter({ hasText: uid });
      await expect(cards).toHaveCount(2);
      // id DESC order: 'e2e-order-zzz-...' comes before 'e2e-order-aaa-...'
      await expect(cards.nth(0)).toHaveAttribute("href", `/movie/${tZ.id}`);
      await expect(cards.nth(1)).toHaveAttribute("href", `/movie/${tA.id}`);
    } finally {
      await sql(`DELETE FROM media WHERE id = ANY($1)`, [[tA.id, tZ.id]]);
    }
  });

  test("T2-Pub-2: draft titles with null publishedAt never appear on New Releases or Browse pages", async ({
    page,
    request,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const draftId = `e2e-hidden-draft-${uid}`;
    const draftTitle = `E2E Hidden Draft ${uid}`;
    await sql(
      `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "publishedAt", "createdAt", "updatedAt")
       VALUES ($1, 'movie', 'draft', $2, 2024, '90 min', ARRAY['Drama'], 'Canada', 'English', $3, null, now(), now())`,
      [draftId, draftTitle, POSTER]
    );
    try {
      await page.goto("/new-releases");
      await expect(page.locator("main").getByText(draftTitle)).toHaveCount(0);

      await page.goto("/movie");
      await expect(page.locator("main").getByText(draftTitle)).toHaveCount(0);

      expect((await request.get(`/movie/${draftId}`)).status()).toBe(404);
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [draftId]);
    }
  });

  test("T2-Pub-3: unpublishing a title (reverting to draft) removes it from public catalog immediately", async ({
    page,
    request,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const movieId = `e2e-unpub-immed-${uid}`;
    const title = `E2E Unpub Immed ${uid}`;
    await sql(
      `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "publishedAt", "createdAt", "updatedAt")
       VALUES ($1, 'movie', 'published', $2, 2024, '90 min', ARRAY['Drama'], 'Canada', 'English', $3, now(), now(), now())`,
      [movieId, title, POSTER]
    );
    try {
      await page.goto("/new-releases");
      await expect(page.locator("main").getByText(title)).toBeVisible();

      // Unpublish via admin library row button
      await page.goto(`/admin/library/movies?q=${uid}`);
      const row = page.getByRole("row", { name: new RegExp(uid) });
      await row.getByRole("button", { name: /^Unpublish/ }).click();
      await expect(row).toContainText("Draft");

      // Verify public access immediately 404s and title gone from /new-releases
      expect((await request.get(`/movie/${movieId}`)).status()).toBe(404);
      await page.goto("/new-releases");
      await expect(page.locator("main").getByText(title)).toHaveCount(0);
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [movieId]);
    }
  });

  test("T2-Pub-4: re-publishing an unpublished title updates publishedAt to current time", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const movieId = `e2e-repub-fresh-${uid}`;
    const title = `E2E Repub Fresh ${uid}`;
    const oldPub = "2023-01-01T00:00:00Z";

    await sql(
      `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "publishedAt", "createdAt", "updatedAt")
       VALUES ($1, 'movie', 'draft', $2, 2024, '90 min', ARRAY['Drama'], 'Canada', 'English', $3, $4::timestamptz, now(), now())`,
      [movieId, title, POSTER, oldPub]
    );
    try {
      await page.goto(`/admin/library/movies?q=${uid}`);
      const row = page.getByRole("row", { name: new RegExp(uid) });
      await row.getByRole("button", { name: /^Publish/ }).click();
      await expect(row).toContainText("Published");

      const [after] = await sql<{ publishedAt: string }>(
        `SELECT "publishedAt" FROM media WHERE id = $1`,
        [movieId]
      );
      // Fresh publishedAt must be recent, not 2023
      const ageMs = Math.abs(Date.now() - new Date(after.publishedAt).getTime());
      expect(ageMs).toBeLessThan(15000);
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [movieId]);
    }
  });

  test("T2-Pub-5: NEW badge boundary test at exactly 7-day cutoff (168 hours)", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    // 6 days 23 hours ago: strictly < 7 days -> NEW badge
    const justUnder7d = {
      id: `e2e-under7d-${uid}`,
      title: `E2E Under7d ${uid}`,
      publishedAt: new Date(Date.now() - (7 * 86400000 - 3600000)).toISOString(),
    };
    // 7 days 1 hour ago: strictly > 7 days -> NO badge
    const justOver7d = {
      id: `e2e-over7d-${uid}`,
      title: `E2E Over7d ${uid}`,
      publishedAt: new Date(Date.now() - (7 * 86400000 + 3600000)).toISOString(),
    };

    for (const item of [justUnder7d, justOver7d]) {
      await sql(
        `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "publishedAt", "createdAt", "updatedAt")
         VALUES ($1, 'movie', 'published', $2, 2024, '90 min', ARRAY['Drama'], 'Canada', 'English', $3, $4::timestamptz, now(), now())`,
        [item.id, item.title, POSTER, item.publishedAt]
      );
    }

    try {
      await page.goto("/new-releases");
      const underCard = page.locator("main a").filter({ hasText: justUnder7d.title });
      const overCard = page.locator("main a").filter({ hasText: justOver7d.title });

      await expect(underCard.getByText("NEW", { exact: true })).toBeVisible();
      await expect(overCard.getByText("NEW", { exact: true })).toHaveCount(0);
    } finally {
      await sql(`DELETE FROM media WHERE id = ANY($1)`, [[justUnder7d.id, justOver7d.id]]);
    }
  });

  // Tier 3: Pairwise Interactions

  test("T3-Pub-1: Home hero selection prioritizes featured published title with most recent publishedAt", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const heroNew = {
      id: `e2e-hero-new-${uid}`,
      title: `E2E Hero New ${uid}`,
      publishedAt: new Date(Date.now()).toISOString(),
    };
    const heroOld = {
      id: `e2e-hero-old-${uid}`,
      title: `E2E Hero Old ${uid}`,
      publishedAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    };

    // Save previous featured title
    const prevFeatured = await sql<{ id: string }>(`SELECT id FROM media WHERE featured = true`, []);
    try {
      await sql(`UPDATE media SET featured = false WHERE featured = true`, []);

      for (const h of [heroNew, heroOld]) {
        await sql(
          `INSERT INTO media (id, type, status, featured, title, year, duration, genres, country, language, "posterUrl", "backdropUrl", "publishedAt", "createdAt", "updatedAt")
           VALUES ($1, 'movie', 'published', true, $2, 2024, '90 min', ARRAY['Drama'], 'Canada', 'English', $3, $3, $4::timestamptz, now(), now())`,
          [h.id, h.title, POSTER, h.publishedAt]
        );
      }

      await page.goto("/home");
      // The home hero must be the newer published title
      await expect(page.locator("main").getByRole("heading", { level: 1 })).toHaveText(heroNew.title);
    } finally {
      await sql(`DELETE FROM media WHERE id = ANY($1)`, [[heroNew.id, heroOld.id]]);
      if (prevFeatured.length > 0) {
        await sql(`UPDATE media SET featured = true WHERE id = $1`, [prevFeatured[0].id]);
      }
    }
  });

  test("T3-Pub-2: Database backfill verification - all existing published titles have non-null publishedAt", async () => {
    // Phase 2 migration requirement: backfill existing published titles with publishedAt = createdAt
    const nullPubCount = await sql<{ count: string }>(
      `SELECT count(*)::text as count FROM media WHERE status = 'published' AND "publishedAt" IS NULL`,
      []
    );
    expect(Number(nullPubCount[0].count)).toBe(0);
  });

  // Tier 4: End-to-End Real-World Workflow

  test("T4-Pub-1: Complete Publication Lifecycle & Public Catalog Propagation Workflow", async ({
    page,
    request,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const movieId = `e2e-lifecycle-${uid}`;
    const title = `E2E Lifecycle ${uid}`;

    // 1. Create draft movie
    await sql(
      `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "createdAt", "updatedAt")
       VALUES ($1, 'movie', 'draft', $2, 2024, '95 min', ARRAY['Drama'], 'Canada', 'English', $3, now(), now())`,
      [movieId, title, POSTER]
    );

    try {
      // 2. Verify draft does not appear on public site
      expect((await request.get(`/movie/${movieId}`)).status()).toBe(404);
      await page.goto("/new-releases");
      await expect(page.locator("main").getByText(title)).toHaveCount(0);

      // 3. Publish title via admin edit page
      await page.goto(`/admin/library/movies/${movieId}`);
      await page.getByLabel("Status").selectOption("published");
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(page.getByText("Saved.", { exact: true })).toBeVisible();

      // 4. Verify title immediately appears at top of /new-releases with NEW badge
      await page.goto("/new-releases");
      const firstCard = page.locator("main a").first();
      await expect(firstCard).toHaveAttribute("href", `/movie/${movieId}`);
      await expect(firstCard.getByText("NEW", { exact: true })).toBeVisible();

      // 5. Move title to trash
      await page.goto(`/admin/library/movies/${movieId}`);
      await page.getByRole("button", { name: "Move to trash" }).click();
      await expect(page.getByText("This title is in the trash")).toBeVisible();

      // 6. Verify title immediately removed from public site
      expect((await request.get(`/movie/${movieId}`)).status()).toBe(404);
      await page.goto("/new-releases");
      await expect(page.locator("main").getByText(title)).toHaveCount(0);

      // 7. Restore title
      await page.goto("/admin/trash");
      const item = page.getByRole("listitem").filter({ hasText: uid });
      await item.getByRole("button", { name: /^Restore/ }).click();
      await expect(page.getByText("Title restored.")).toBeVisible();
      await expect(item).toHaveCount(0);

      // 8. Verify title restored with preserved publishedAt and reappears on /new-releases
      await page.goto("/new-releases");
      await expect(page.locator("main a").first()).toHaveAttribute("href", `/movie/${movieId}`);
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [movieId]);
    }
  });
});
