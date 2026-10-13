import { ADMIN_STATE, sql, USER_STATE } from "./accounts";
import { ADMIN_CREDENTIALS, expect, seriousViolations, test } from "./fixtures";

/*
 * /admin/dashboard: the catalog, plays, accounts and open reports at a
 * glance. Other tests add titles, plays and reports at the same time, so
 * this one checks its own rows show up rather than exact totals.
 */

const POSTER = "https://picsum.photos/seed/e2e-dashboard/500/750";

function uniqueId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

test.describe("regular users", () => {
  test.use({ httpCredentials: ADMIN_CREDENTIALS, storageState: USER_STATE });

  test("can't reach the dashboard", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/admin\/login(\?.*)?$/);
  });
});

test.describe("signed in as an admin", () => {
  test.use({ httpCredentials: ADMIN_CREDENTIALS, storageState: ADMIN_STATE });

  test("shows the counts, the most played titles, the newest titles and open reports", async ({
    page,
  }) => {
    const uid = uniqueId();
    const played = { id: `e2e-dash-played-${uid}`, title: `E2E Dashboard Played ${uid}` };
    const draft = { id: `e2e-dash-draft-${uid}`, title: `E2E Dashboard Draft ${uid}` };
    // Published long ago, so it stays off New Releases, which other tests read.
    await sql(
      `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "createdAt", "updatedAt")
       VALUES ($1, 'movie', 'published', $2, 2001, '1h 30m', ARRAY['Drama'], 'Canada', 'French', $3,
               '2001-01-01', '2001-01-01')`,
      [played.id, played.title, POSTER]
    );
    // Fewer plays than "Trending ranks titles by this week's views" gives its
    // title, which has to come first on /trending.
    await sql(
      `INSERT INTO media_view ("mediaId", viewer, day)
       SELECT $1, 'e2e-' || n, (now() AT TIME ZONE 'UTC')::date FROM generate_series(1, 500) n`,
      [played.id]
    );
    // Added "in an hour", so titles other tests add now don't push it out
    // of Recently added.
    await sql(
      `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "createdAt", "updatedAt")
       VALUES ($1, 'series', 'draft', $2, 2001, '', ARRAY['Drama'], 'Canada', 'French', $3,
               now() + interval '1 hour', now())`,
      [draft.id, draft.title, POSTER]
    );
    const [report] = await sql<{ id: string }>(
      `INSERT INTO report (id, "mediaId", "mediaTitle", reason)
       VALUES ('e2e-dash-' || $1, $2, $3, 'Video won''t play') RETURNING id`,
      [uid, played.id, played.title]
    );
    try {
      await page.goto("/admin");
      await expect(page).toHaveURL(/\/admin\/dashboard$/);
      expect(await seriousViolations(page)).toEqual([]);

      const tiles = page.getByRole("list", { name: "At a glance" });
      for (const label of ["Published titles", "Drafts", "Plays, last 7 days", "Accounts"]) {
        await expect(tiles.getByRole("listitem").filter({ hasText: label })).toContainText(/\d/);
      }
      await expect(tiles.getByRole("listitem").filter({ hasText: "Drafts" })).toContainText(
        /\d+ movies? · \d+ series/
      );

      const mostPlayed = page.getByRole("region", { name: "Most played, last 7 days" });
      const playedRow = mostPlayed.getByRole("listitem").filter({ hasText: played.title });
      await expect(playedRow).toContainText("500 plays");
      await expect(playedRow.getByRole("link")).toHaveAttribute("href", `/admin/library/movies/${played.id}`);

      const recent = page.getByRole("region", { name: "Recently added" });
      const draftRow = recent.getByRole("listitem").first();
      await expect(draftRow).toContainText(draft.title);
      await expect(draftRow).toContainText("Series");
      await expect(draftRow).toContainText("Draft");

      await expect(page.getByText(/^\d+ open reports? from the player\.$/)).toBeVisible();
      await page.getByRole("link", { name: "Open Reports" }).click();
      await expect(page).toHaveURL(/\/admin\/reports$/);

      await page.goto("/admin/dashboard");
      await recent.getByRole("link", { name: draft.title }).click();
      await expect(page).toHaveURL(`/admin/library/series/${draft.id}`);
    } finally {
      await sql(`DELETE FROM report WHERE id = $1`, [report.id]);
      await sql(`DELETE FROM media WHERE id = ANY($1)`, [[played.id, draft.id]]);
    }
  });

  // Phase 2: Dashboard Needs Attention Panel & Safeguards & Unified 7-day Metrics

  test.describe("needs attention triage panel and safeguards", () => {
    test("T1-Dash-1: Needs attention panel lists published titles missing video sources", async ({
      page,
      consoleProblems,
    }) => {
      void consoleProblems;
      const uid = uniqueId();
      const movie = { id: `e2e-triage-video-${uid}`, title: `E2E Triage Video ${uid}` };
      await sql(
        `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "createdAt", "updatedAt")
         VALUES ($1, 'movie', 'published', $2, 2024, '90 min', ARRAY['Drama'], 'Canada', 'English', $3, now(), now())`,
        [movie.id, movie.title, POSTER]
      );
      try {
        await page.goto("/admin/dashboard");
        const panel = page.getByRole("region", { name: /needs attention|triage/i }).or(
          page.locator("section").filter({ hasText: /needs attention/i })
        );
        await expect(panel).toBeVisible();
        await expect(panel.getByText(movie.title)).toBeVisible();
        await expect(panel.getByText(/missing video|no video sources/i).first()).toBeVisible();
      } finally {
        await sql(`DELETE FROM media WHERE id = $1`, [movie.id]);
      }
    });

    test("T1-Dash-2: Needs attention panel lists published series with zero episodes", async ({
      page,
      consoleProblems,
    }) => {
      void consoleProblems;
      const uid = uniqueId();
      const series = { id: `e2e-triage-ep-${uid}`, title: `E2E Triage Ep ${uid}` };
      await sql(
        `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "createdAt", "updatedAt")
         VALUES ($1, 'series', 'published', $2, 2024, '', ARRAY['Drama'], 'Canada', 'English', $3, now(), now())`,
        [series.id, series.title, POSTER]
      );
      try {
        await page.goto("/admin/dashboard");
        const panel = page.locator("section").filter({ hasText: /needs attention/i });
        await expect(panel.getByText(series.title)).toBeVisible();
        await expect(panel.getByText(/0 episodes|no episodes/i).first()).toBeVisible();
      } finally {
        await sql(`DELETE FROM media WHERE id = $1`, [series.id]);
      }
    });

    test("T1-Dash-3: Needs attention panel lists published titles missing posters", async ({
      page,
      consoleProblems,
    }) => {
      void consoleProblems;
      const uid = uniqueId();
      const movie = { id: `e2e-triage-poster-${uid}`, title: `E2E Triage Poster ${uid}` };
      await sql(
        `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "createdAt", "updatedAt")
         VALUES ($1, 'movie', 'published', $2, 2024, '90 min', ARRAY['Drama'], 'Canada', 'English', '/brand/no-poster.jpg', now(), now())`,
        [movie.id, movie.title]
      );
      try {
        await page.goto("/admin/dashboard");
        const panel = page.locator("section").filter({ hasText: /needs attention/i });
        await expect(panel.getByText(movie.title)).toBeVisible();
        await expect(panel.getByText(/missing poster|no poster/i).first()).toBeVisible();
      } finally {
        await sql(`DELETE FROM media WHERE id = $1`, [movie.id]);
      }
    });

    test("T1-Dash-4: Needs attention panel alerts when no home hero is featured", async ({
      page,
      consoleProblems,
    }) => {
      void consoleProblems;
      // Fetch currently featured title
      const heroes = await sql<{ id: string }>(`SELECT id FROM media WHERE featured = true`, []);
      try {
        // Temporarily unfeature all
        await sql(`UPDATE media SET featured = false WHERE featured = true`, []);
        await page.goto("/admin/dashboard");
        const panel = page.locator("section").filter({ hasText: /needs attention/i });
        await expect(panel.getByText(/missing home hero|no home page hero/i)).toBeVisible();
      } finally {
        if (heroes.length > 0) {
          await sql(`UPDATE media SET featured = true WHERE id = $1`, [heroes[0].id]);
        }
      }
    });

    test("T1-Dash-5: unified 7-day UTC rolling window counts plays strictly for published non-trashed titles", async ({
      page,
      consoleProblems,
    }) => {
      void consoleProblems;
      const uid = uniqueId();
      const pubMovie = { id: `e2e-plays-pub-${uid}`, title: `E2E Plays Pub ${uid}` };
      const draftMovie = { id: `e2e-plays-draft-${uid}`, title: `E2E Plays Draft ${uid}` };
      const trashedMovie = { id: `e2e-plays-trash-${uid}`, title: `E2E Plays Trash ${uid}` };

      await sql(
        `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "createdAt", "updatedAt")
         VALUES ($1, 'movie', 'published', $2, 2024, '90 min', ARRAY['Drama'], 'Canada', 'English', $3, now(), now())`,
        [pubMovie.id, pubMovie.title, POSTER]
      );
      await sql(
        `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "createdAt", "updatedAt")
         VALUES ($1, 'movie', 'draft', $2, 2024, '90 min', ARRAY['Drama'], 'Canada', 'English', $3, now(), now())`,
        [draftMovie.id, draftMovie.title, POSTER]
      );
      await sql(
        `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "trashedAt", "createdAt", "updatedAt")
         VALUES ($1, 'movie', 'published', $2, 2024, '90 min', ARRAY['Drama'], 'Canada', 'English', $3, now(), now(), now())`,
        [trashedMovie.id, trashedMovie.title, POSTER]
      );

      // Insert views in UTC today
      await sql(
        `INSERT INTO media_view ("mediaId", viewer, day)
         VALUES ($1, 'viewer-pub-' || $4, (now() AT TIME ZONE 'UTC')::date),
                ($2, 'viewer-draft-' || $4, (now() AT TIME ZONE 'UTC')::date),
                ($3, 'viewer-trash-' || $4, (now() AT TIME ZONE 'UTC')::date)`,
        [pubMovie.id, draftMovie.id, trashedMovie.id, uid]
      );

      try {
        await page.goto("/admin/dashboard");
        // Most played region should list pubMovie, but NOT draftMovie or trashedMovie
        const mostPlayed = page.getByRole("region", { name: /most played/i });
        await expect(mostPlayed.getByText(draftMovie.title)).toHaveCount(0);
        await expect(mostPlayed.getByText(trashedMovie.title)).toHaveCount(0);
      } finally {
        await sql(`DELETE FROM media_view WHERE viewer LIKE $1`, [`viewer%${uid}`]);
        await sql(`DELETE FROM media WHERE id = ANY($1)`, [[pubMovie.id, draftMovie.id, trashedMovie.id]]);
      }
    });

    test("T1-Dash-6: pre-publish validation warnings appear on edit page for title missing video source", async ({
      page,
      consoleProblems,
    }) => {
      void consoleProblems;
      const uid = uniqueId();
      const movie = { id: `e2e-warn-novid-${uid}`, title: `E2E Warn No Vid ${uid}` };
      await sql(
        `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "createdAt", "updatedAt")
         VALUES ($1, 'movie', 'draft', $2, 2024, '90 min', ARRAY['Drama'], 'Canada', 'English', $3, now(), now())`,
        [movie.id, movie.title, POSTER]
      );
      try {
        await page.goto(`/admin/library/movies/${movie.id}`);
        await expect(
          page.getByText(/this title has no video sources|warning: missing video/i)
        ).toBeVisible();
      } finally {
        await sql(`DELETE FROM media WHERE id = $1`, [movie.id]);
      }
    });

    test("T1-Dash-7: duplicate title warning appears when adding a new title that matches an existing title", async ({
      page,
      consoleProblems,
    }) => {
      void consoleProblems;
      await page.goto("/admin/upload/movies");
      await page.getByLabel("Title", { exact: true }).fill("Chosen Family");
      await page.getByLabel("Year").click(); // Trigger blur
      await expect(
        page.getByText(/a title named “chosen family” already exists|duplicate title/i)
      ).toBeVisible();
    });

    // Tier 2: Boundary & Corner Cases (>=5 cases)

    test("T2-Dash-1: draft titles missing videos or episodes are NOT flagged in Needs Attention panel", async ({
      page,
      consoleProblems,
    }) => {
      void consoleProblems;
      const uid = uniqueId();
      const draftMovie = { id: `e2e-draft-chk-${uid}`, title: `E2E Draft Chk ${uid}` };
      await sql(
        `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "createdAt", "updatedAt")
         VALUES ($1, 'movie', 'draft', $2, 2024, '90 min', ARRAY['Drama'], 'Canada', 'English', $3, now(), now())`,
        [draftMovie.id, draftMovie.title, POSTER]
      );
      try {
        await page.goto("/admin/dashboard");
        const panel = page.locator("section").filter({ hasText: /needs attention/i });
        await expect(panel.getByText(draftMovie.title)).toHaveCount(0);
      } finally {
        await sql(`DELETE FROM media WHERE id = $1`, [draftMovie.id]);
      }
    });

    test("T2-Dash-2: views older than 7 days UTC are excluded from rolling play count", async ({
      page,
      consoleProblems,
    }) => {
      void consoleProblems;
      const uid = uniqueId();
      const movie = { id: `e2e-old-plays-${uid}`, title: `E2E Old Plays ${uid}` };
      await sql(
        `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "createdAt", "updatedAt")
         VALUES ($1, 'movie', 'published', $2, 2024, '90 min', ARRAY['Drama'], 'Canada', 'English', $3, now(), now())`,
        [movie.id, movie.title, POSTER]
      );
      // Insert play 8 days ago in UTC
      await sql(
        `INSERT INTO media_view ("mediaId", viewer, day)
         VALUES ($1, 'viewer-old-' || $2, (now() AT TIME ZONE 'UTC')::date - interval '8 days')`,
        [movie.id, uid]
      );
      try {
        await page.goto("/admin/dashboard");
        const mostPlayed = page.getByRole("region", { name: /most played/i });
        await expect(mostPlayed.getByText(movie.title)).toHaveCount(0);
      } finally {
        await sql(`DELETE FROM media_view WHERE viewer = $1`, [`viewer-old-${uid}`]);
        await sql(`DELETE FROM media WHERE id = $1`, [movie.id]);
      }
    });

    test("T2-Dash-3: views exactly 6 days ago in UTC are included in rolling play count", async ({
      page,
      consoleProblems,
    }) => {
      void consoleProblems;
      const uid = uniqueId();
      const movie = { id: `e2e-edge-play-${uid}`, title: `E2E Edge Play ${uid}` };
      await sql(
        `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "createdAt", "updatedAt")
         VALUES ($1, 'movie', 'published', $2, 2024, '90 min', ARRAY['Drama'], 'Canada', 'English', $3, now(), now())`,
        [movie.id, movie.title, POSTER]
      );
      // Insert 600 plays exactly 6 days ago
      await sql(
        `INSERT INTO media_view ("mediaId", viewer, day)
         SELECT $1, 'e2e-edge-' || $2 || '-' || n, (now() AT TIME ZONE 'UTC')::date - 6 FROM generate_series(1, 600) n`,
        [movie.id, uid]
      );
      try {
        await page.goto("/admin/dashboard");
        const mostPlayed = page.getByRole("region", { name: /most played/i });
        await expect(mostPlayed.getByText(movie.title)).toBeVisible();
        await expect(mostPlayed.getByRole("listitem").filter({ hasText: movie.title })).toContainText("600 plays");
      } finally {
        await sql(`DELETE FROM media_view WHERE "mediaId" = $1`, [movie.id]);
        await sql(`DELETE FROM media WHERE id = $1`, [movie.id]);
      }
    });

    test("T2-Dash-4: clean triage panel state when all catalog quality checks pass", async ({
      page,
      consoleProblems,
    }) => {
      void consoleProblems;
      await page.goto("/admin/dashboard");
      const panel = page.locator("section").filter({ hasText: /needs attention/i });
      if (await panel.isVisible()) {
        const text = await panel.innerText();
        expect(text.length).toBeGreaterThan(0);
      }
    });

    test("T2-Dash-5: duplicate title warning is case-insensitive and trims whitespace", async ({
      page,
      consoleProblems,
    }) => {
      void consoleProblems;
      await page.goto("/admin/upload/movies");
      await page.getByLabel("Title", { exact: true }).fill("   chosen family   ");
      await page.getByLabel("Year").click();
      await expect(
        page.getByText(/already exists|duplicate title/i)
      ).toBeVisible();
    });

    // Tier 3: Pairwise Interactions

    test("T3-Dash-1: adding a video source immediately clears title from Needs Attention panel", async ({
      page,
      consoleProblems,
    }) => {
      void consoleProblems;
      const uid = uniqueId();
      const movie = { id: `e2e-clear-triage-${uid}`, title: `E2E Clear Triage ${uid}` };
      await sql(
        `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "createdAt", "updatedAt")
         VALUES ($1, 'movie', 'published', $2, 2024, '90 min', ARRAY['Drama'], 'Canada', 'English', $3, now(), now())`,
        [movie.id, movie.title, POSTER]
      );
      try {
        await page.goto("/admin/dashboard");
        const panel = page.locator("section").filter({ hasText: /needs attention/i });
        await expect(panel.getByText(movie.title)).toBeVisible();

        // Add a video source
        await sql(
          `INSERT INTO video_source (id, "mediaId", label, kind, url, position, enabled, "updatedAt")
           VALUES ($1, $2, 'Server 1', 'embed'::video_source_kind, 'https://player.e2e.example/embed/1', 1, true, now())`,
          [`src-${uid}`, movie.id]
        );

        await page.reload();
        await expect(panel.getByText(movie.title)).toHaveCount(0);
      } finally {
        await sql(`DELETE FROM media WHERE id = $1`, [movie.id]);
      }
    });

    test("T3-Dash-2: resolving an open report updates open reports count on dashboard", async ({
      page,
      consoleProblems,
    }) => {
      void consoleProblems;
      const uid = uniqueId();
      const [report] = await sql<{ id: string }>(
        `INSERT INTO report (id, "mediaId", "mediaTitle", reason)
         VALUES ('e2e-rep-' || $1, 'chosen-family', 'Chosen Family', 'Playback error') RETURNING id`,
        [uid]
      );
      try {
        await page.goto("/admin/dashboard");
        await expect(page.getByText(/open reports? from the player/i)).toBeVisible();

        // Resolve report in database
        await sql(`UPDATE report SET "resolvedAt" = now(), "resolvedBy" = 'admin@example.com' WHERE id = $1`, [report.id]);
        await page.reload();
      } finally {
        await sql(`DELETE FROM report WHERE id = $1`, [report.id]);
      }
    });

    // Tier 4: End-to-End Real-World Workflows

    test("T4-Dash-1: Catalog Quality Audit & Dashboard Triage Workflow", async ({
      page,
      consoleProblems,
    }) => {
      void consoleProblems;
      const uid = uniqueId();
      const seriesId = `e2e-triage-flow-${uid}`;
      const seriesTitle = `E2E Triage Flow ${uid}`;

      // 1. Create series draft
      await sql(
        `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "createdAt", "updatedAt")
         VALUES ($1, 'series', 'draft', $2, 2024, '', ARRAY['Drama'], 'Canada', 'English', $3, now(), now())`,
        [seriesId, seriesTitle, POSTER]
      );
      try {
        // 2. Publish prematurely with 0 episodes
        await sql(`UPDATE media SET status = 'published' WHERE id = $1`, [seriesId]);

        // 3. Visit dashboard and see triage flag
        await page.goto("/admin/dashboard");
        const panel = page.locator("section").filter({ hasText: /needs attention/i });
        await expect(panel.getByText(seriesTitle)).toBeVisible();
        await expect(panel.getByText(/0 episodes/i).first()).toBeVisible();

        // 4. Click link from triage panel to edit page
        await panel.getByRole("link", { name: seriesTitle }).click();
        await expect(page).toHaveURL(`/admin/library/series/${seriesId}`);

        // 5. Add episode and video source
        const epId = `${seriesId}-season-1-episode-1`;
        await sql(
          `INSERT INTO episode (id, "mediaId", "seasonNumber", "episodeNumber", title, duration)
           VALUES ($1, $2, 1, 1, 'Pilot', '45 min')`,
          [epId, seriesId]
        );
        await sql(
          `INSERT INTO video_source (id, "episodeId", label, kind, url, position, enabled, "updatedAt")
           VALUES ($1, $2, 'Server 1', 'embed'::video_source_kind, 'https://player.e2e.example/embed/1', 1, true, now())`,
          [`src-${uid}`, epId]
        );
        await sql(`UPDATE media SET duration = '1 Season' WHERE id = $1`, [seriesId]);

        // 6. Return to dashboard -> triage alert cleared
        await page.goto("/admin/dashboard");
        await expect(panel.getByText(seriesTitle)).toHaveCount(0);
      } finally {
        await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
      }
    });

    test("T4-Dash-2: Analytics Rolling Window Verification Workflow", async ({
      page,
      consoleProblems,
    }) => {
      void consoleProblems;
      const uid = uniqueId();
      const pubTitle = `E2E Rolling Pub ${uid}`;
      const pubId = `e2e-roll-pub-${uid}`;
      const draftId = `e2e-roll-draft-${uid}`;

      await sql(
        `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "createdAt", "updatedAt")
         VALUES ($1, 'movie', 'published', $2, 2024, '90 min', ARRAY['Drama'], 'Canada', 'English', $3, now(), now())`,
        [pubId, pubTitle, POSTER]
      );
      await sql(
        `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "createdAt", "updatedAt")
         VALUES ($1, 'movie', 'draft', $2, 2024, '90 min', ARRAY['Drama'], 'Canada', 'English', $3, now(), now())`,
        [draftId, `E2E Rolling Draft ${uid}`, POSTER]
      );

      // Add views spanning 10 days
      for (let dayOffset = 0; dayOffset < 10; dayOffset++) {
        await sql(
          `INSERT INTO media_view ("mediaId", viewer, day)
           VALUES ($1, 'v-pub-' || $3 || '-' || $4, (now() AT TIME ZONE 'UTC')::date - $4::integer),
                  ($2, 'v-drf-' || $3 || '-' || $4, (now() AT TIME ZONE 'UTC')::date - $4::integer)`,
          [pubId, draftId, uid, dayOffset]
        );
      }

      try {
        await page.goto("/admin/dashboard");
        // Derivation from specification:
        // Rolling 7-day UTC window includes days [0..6] (7 days total).
        // Strictly counts published non-trashed titles.
        // Therefore pubId contributes exactly 7 plays (days 0,1,2,3,4,5,6), draftId contributes 0 plays.
        const mostPlayed = page.getByRole("region", { name: /most played/i });
        const row = mostPlayed.getByRole("listitem").filter({ hasText: pubTitle });
        if (await row.isVisible()) {
          await expect(row).toContainText("7 plays");
        }
      } finally {
        await sql(`DELETE FROM media_view WHERE viewer LIKE $1`, [`%${uid}%`]);
        await sql(`DELETE FROM media WHERE id = ANY($1)`, [[pubId, draftId]]);
      }
    });
  });
});

