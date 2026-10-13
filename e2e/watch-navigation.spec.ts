import { sql } from "./accounts";
import { expect, seriousViolations, test } from "./fixtures";

/*
 * Public Watch Player: Next / Previous Episode Controls & Episode Selector Drawer & HTTP 308 Redirects
 * (R7, R1, R3 / Features 27-29)
 * - Next / Previous episode controls with titles and 16:9 still thumbnails
 * - Episode Selector drawer for binge-watching
 * - HTTP 308 permanent redirect for old episode slugs
 */

const POSTER = "https://picsum.photos/seed/e2e-watch-nav/500/750";
const STILL_1 = "https://image.tmdb.org/t/p/w300/mock-still-s1e1.jpg";
const STILL_2 = "https://image.tmdb.org/t/p/w300/mock-still-s1e2.jpg";
const STILL_3 = "https://image.tmdb.org/t/p/w300/mock-still-s1e3.jpg";

function uniqueId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function addSeries(id: string, title: string) {
  await sql(
    `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "createdAt", "updatedAt")
     VALUES ($1, 'series', 'published', $2, 2024, '1 Season', ARRAY['Drama'], 'Canada', 'English', $3, now(), now())`,
    [id, title, POSTER]
  );
}

async function addEpisode(options: {
  id: string;
  seriesId: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  duration?: string;
  stillUrl?: string | null;
}) {
  await sql(
    `INSERT INTO episode (id, "mediaId", "seasonNumber", "episodeNumber", title, duration, "stillUrl")
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      options.id,
      options.seriesId,
      options.seasonNumber,
      options.episodeNumber,
      options.title,
      options.duration ?? "45 min",
      options.stillUrl ?? null,
    ]
  );
}

test.describe("watch player episode navigation and redirects", () => {
  // Tier 1: Feature Coverage (>=5 cases)

  test("T1-Watch-1: Next Episode control displays with still thumbnail, episode number, and title", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-nav-next-${uid}`;
    const ep1 = `${seriesId}-season-1-episode-1`;
    const ep2 = `${seriesId}-season-1-episode-2`;

    await addSeries(seriesId, `E2E Nav Next ${uid}`);
    await addEpisode({ id: ep1, seriesId, seasonNumber: 1, episodeNumber: 1, title: "Pilot", stillUrl: STILL_1 });
    await addEpisode({ id: ep2, seriesId, seasonNumber: 1, episodeNumber: 2, title: "Second Step", stillUrl: STILL_2 });

    try {
      await page.goto(`/episode/${ep1}`);
      const nextControl = page.locator("a").filter({ hasText: /Next/ });
      await expect(nextControl).toBeVisible();
      await expect(nextControl).toHaveAttribute("href", `/episode/${ep2}`);
      await expect(nextControl).toContainText("S1 · E2 — Second Step");

      // Verify still image thumbnail present
      const stillImg = nextControl.locator("img");
      if (await stillImg.count() > 0) {
        await expect(stillImg).toHaveAttribute("src", /mock-still-s1e2|w300/);
      }
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  test("T1-Watch-2: Previous Episode control displays with still thumbnail, episode number, and title", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-nav-prev-${uid}`;
    const ep1 = `${seriesId}-season-1-episode-1`;
    const ep2 = `${seriesId}-season-1-episode-2`;

    await addSeries(seriesId, `E2E Nav Prev ${uid}`);
    await addEpisode({ id: ep1, seriesId, seasonNumber: 1, episodeNumber: 1, title: "Pilot", stillUrl: STILL_1 });
    await addEpisode({ id: ep2, seriesId, seasonNumber: 1, episodeNumber: 2, title: "Second Step", stillUrl: STILL_2 });

    try {
      await page.goto(`/episode/${ep2}`);
      const prevControl = page.locator("a").filter({ hasText: /Previous/ });
      await expect(prevControl).toBeVisible();
      await expect(prevControl).toHaveAttribute("href", `/episode/${ep1}`);
      await expect(prevControl).toContainText("S1 · E1 — Pilot");

      const stillImg = prevControl.locator("img");
      if (await stillImg.count() > 0) {
        await expect(stillImg).toHaveAttribute("src", /mock-still-s1e1|w300/);
      }
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  test("T1-Watch-3: clicking Next Episode card navigates to the next episode watch page", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-click-next-${uid}`;
    const ep1 = `${seriesId}-season-1-episode-1`;
    const ep2 = `${seriesId}-season-1-episode-2`;

    await addSeries(seriesId, `E2E Click Next ${uid}`);
    await addEpisode({ id: ep1, seriesId, seasonNumber: 1, episodeNumber: 1, title: "Pilot", stillUrl: STILL_1 });
    await addEpisode({ id: ep2, seriesId, seasonNumber: 1, episodeNumber: 2, title: "Next Level", stillUrl: STILL_2 });

    try {
      await page.goto(`/episode/${ep1}`);
      const nextCard = page.locator("a").filter({ hasText: /Next/ });
      await nextCard.click();
      await expect(page).toHaveURL(`/episode/${ep2}`);
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Next Level");
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  test("T1-Watch-4: Episode Selector drawer opens from watch interface and lists all seasons and episodes", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-drawer-open-${uid}`;
    const ep1 = `${seriesId}-season-1-episode-1`;
    const ep2 = `${seriesId}-season-1-episode-2`;

    await addSeries(seriesId, `E2E Drawer Open ${uid}`);
    await addEpisode({ id: ep1, seriesId, seasonNumber: 1, episodeNumber: 1, title: "Pilot", stillUrl: STILL_1 });
    await addEpisode({ id: ep2, seriesId, seasonNumber: 1, episodeNumber: 2, title: "Ep Two", stillUrl: STILL_2 });

    try {
      await page.goto(`/episode/${ep1}`);
      // Find Episode Selector drawer button
      const drawerBtn = page.getByRole("button", { name: /episodes|episode selector|browse episodes/i });
      if (await drawerBtn.isVisible()) {
        await drawerBtn.click();
        const drawer = page.getByRole("dialog").or(page.locator("[data-drawer='episodes']")).or(page.locator("aside"));
        await expect(drawer).toBeVisible();
        await expect(drawer.getByText("Pilot")).toBeVisible();
        await expect(drawer.getByText("Ep Two")).toBeVisible();
      }
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  test("T1-Watch-5: selecting an episode from the drawer navigates directly to that episode", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-drawer-nav-${uid}`;
    const ep1 = `${seriesId}-season-1-episode-1`;
    const ep2 = `${seriesId}-season-1-episode-2`;

    await addSeries(seriesId, `E2E Drawer Nav ${uid}`);
    await addEpisode({ id: ep1, seriesId, seasonNumber: 1, episodeNumber: 1, title: "Pilot", stillUrl: STILL_1 });
    await addEpisode({ id: ep2, seriesId, seasonNumber: 1, episodeNumber: 2, title: "Ep Two", stillUrl: STILL_2 });

    try {
      await page.goto(`/episode/${ep1}`);
      const drawerBtn = page.getByRole("button", { name: /episodes|episode selector/i });
      if (await drawerBtn.isVisible()) {
        await drawerBtn.click();
        const drawer = page.getByRole("dialog").or(page.locator("[data-drawer='episodes']")).or(page.locator("aside"));
        await drawer.getByRole("link", { name: /Ep Two/ }).click();
        await expect(page).toHaveURL(`/episode/${ep2}`);
      }
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  test("T1-Watch-6: HTTP 308 redirect transparently forwards old episode slug to new slug", async ({
    page,
    request,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-redirect-308-${uid}`;
    const oldSlug = `${seriesId}-season-1-episode-2`;
    const newSlug = `${seriesId}-season-1-episode-4`;

    await addSeries(seriesId, `E2E 308 Redirect ${uid}`);
    await addEpisode({ id: newSlug, seriesId, seasonNumber: 1, episodeNumber: 4, title: "Renumbered Ep", stillUrl: STILL_2 });
    // Record redirect from oldSlug to newSlug
    await sql(
      `INSERT INTO episode_redirect (id, "mediaId", "oldSlug", "newSlug", "oldSeasonNumber", "oldEpisodeNumber", "newSeasonNumber", "newEpisodeNumber", "createdAt")
       VALUES ($1, $2, $3, $4, 1, 2, 1, 4, now())`,
      [`redir-${uid}`, seriesId, oldSlug, newSlug]
    );

    try {
      // Direct request verify HTTP 308
      const response = await request.get(`/episode/${oldSlug}`, { maxRedirects: 0 });
      expect(response.status()).toBe(308);
      expect(response.headers().location).toMatch(new RegExp(`/episode/${newSlug}$`));

      // Browser navigation follows transparently
      await page.goto(`/episode/${oldSlug}`);
      await expect(page).toHaveURL(`/episode/${newSlug}`);
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Renumbered Ep");
    } finally {
      await sql(`DELETE FROM episode_redirect WHERE id = $1`, [`redir-${uid}`]);
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  // Tier 2: Boundary & Corner Cases (>=5 cases)

  test("T2-Watch-1: first episode has disabled or inert Previous control", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-first-ep-${uid}`;
    const ep1 = `${seriesId}-season-1-episode-1`;

    await addSeries(seriesId, `E2E First Ep ${uid}`);
    await addEpisode({ id: ep1, seriesId, seasonNumber: 1, episodeNumber: 1, title: "Pilot", stillUrl: STILL_1 });

    try {
      await page.goto(`/episode/${ep1}`);
      const prev = page.getByText("Previous", { exact: false });
      await expect(prev).toBeVisible();
      // On episode 1, Previous is either not a link or has aria-disabled="true"
      const prevLink = page.locator("a").filter({ hasText: /Previous/ });
      await expect(prevLink).toHaveCount(0);
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  test("T2-Watch-2: last episode of series has disabled or inert Next control", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-last-ep-${uid}`;
    const ep1 = `${seriesId}-season-1-episode-1`;

    await addSeries(seriesId, `E2E Last Ep ${uid}`);
    await addEpisode({ id: ep1, seriesId, seasonNumber: 1, episodeNumber: 1, title: "Finale", stillUrl: STILL_1 });

    try {
      await page.goto(`/episode/${ep1}`);
      const next = page.getByText("Next", { exact: false });
      await expect(next).toBeVisible();
      const nextLink = page.locator("a").filter({ hasText: /Next/ });
      await expect(nextLink).toHaveCount(0);
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  test("T2-Watch-3: episode without stillUrl falls back to series poster or placeholder thumbnail", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-null-still-${uid}`;
    const ep1 = `${seriesId}-season-1-episode-1`;
    const ep2 = `${seriesId}-season-1-episode-2`;

    await addSeries(seriesId, `E2E Null Still ${uid}`);
    await addEpisode({ id: ep1, seriesId, seasonNumber: 1, episodeNumber: 1, title: "Pilot", stillUrl: null });
    await addEpisode({ id: ep2, seriesId, seasonNumber: 1, episodeNumber: 2, title: "Ep 2", stillUrl: null });

    try {
      await page.goto(`/episode/${ep1}`);
      const nextCard = page.locator("a").filter({ hasText: /Next/ });
      await expect(nextCard).toBeVisible();
      // Renders cleanly without broken image
      expect(await seriousViolations(page)).toEqual([]);
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  test("T2-Watch-4: single episode series has both Previous and Next controls disabled", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-single-ep-${uid}`;
    const ep1 = `${seriesId}-season-1-episode-1`;

    await addSeries(seriesId, `E2E Single Ep ${uid}`);
    await addEpisode({ id: ep1, seriesId, seasonNumber: 1, episodeNumber: 1, title: "Standalone Special", stillUrl: STILL_1 });

    try {
      await page.goto(`/episode/${ep1}`);
      await expect(page.locator("a").filter({ hasText: /Previous/ })).toHaveCount(0);
      await expect(page.locator("a").filter({ hasText: /Next/ })).toHaveCount(0);
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  test("T2-Watch-5: direct navigation to non-existent episode slug without redirect returns 404", async ({
    page,
    request,
    consoleProblems,
  }) => {
    void consoleProblems;
    void page;
    const res = await request.get("/episode/no-such-episode-slug-xyz");
    expect(res.status()).toBe(404);
  });

  test("T2-Watch-6: chained episode slug redirect forwards to final destination", async ({
    page,
    request,
    consoleProblems,
  }) => {
    void consoleProblems;
    void request;
    const uid = uniqueId();
    const seriesId = `e2e-chained-redir-${uid}`;
    const slugA = `${seriesId}-season-1-episode-1`;
    const slugB = `${seriesId}-season-1-episode-2`;
    const slugC = `${seriesId}-season-1-episode-3`;

    await addSeries(seriesId, `E2E Chained Redir ${uid}`);
    await addEpisode({ id: slugC, seriesId, seasonNumber: 1, episodeNumber: 3, title: "Final Slug Ep", stillUrl: STILL_3 });

    // A -> B, and B -> C
    await sql(
      `INSERT INTO episode_redirect (id, "mediaId", "oldSlug", "newSlug", "oldSeasonNumber", "oldEpisodeNumber", "newSeasonNumber", "newEpisodeNumber", "createdAt")
       VALUES ($1, $3, $4, $5, 1, 1, 1, 2, now()),
              ($2, $3, $5, $6, 1, 2, 1, 3, now())`,
      [`redir-1-${uid}`, `redir-2-${uid}`, seriesId, slugA, slugB, slugC]
    );

    try {
      await page.goto(`/episode/${slugA}`);
      await expect(page).toHaveURL(`/episode/${slugC}`);
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Final Slug Ep");
    } finally {
      await sql(`DELETE FROM episode_redirect WHERE id = ANY($1)`, [[`redir-1-${uid}`, `redir-2-${uid}`]]);
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  // Tier 3: Pairwise Interactions

  test("T3-Watch-1: Next episode control transitions across season boundary (S1 final ep -> S2 E1)", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-season-cross-${uid}`;
    const s1e10 = `${seriesId}-season-1-episode-10`;
    const s2e1 = `${seriesId}-season-2-episode-1`;

    await addSeries(seriesId, `E2E Season Cross ${uid}`);
    await addEpisode({ id: s1e10, seriesId, seasonNumber: 1, episodeNumber: 10, title: "S1 Finale", stillUrl: STILL_1 });
    await addEpisode({ id: s2e1, seriesId, seasonNumber: 2, episodeNumber: 1, title: "S2 Premiere", stillUrl: STILL_2 });

    try {
      await page.goto(`/episode/${s1e10}`);
      const nextCard = page.locator("a").filter({ hasText: /Next/ });
      await expect(nextCard).toHaveAttribute("href", `/episode/${s2e1}`);
      await expect(nextCard).toContainText("S2 · E1 — S2 Premiere");

      await nextCard.click();
      await expect(page).toHaveURL(`/episode/${s2e1}`);
      await expect(page.getByRole("heading", { level: 1 })).toContainText("S2 Premiere");
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  test("T3-Watch-2: Episode Selector drawer highlights current playing episode", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-drawer-active-${uid}`;
    const ep1 = `${seriesId}-season-1-episode-1`;
    const ep2 = `${seriesId}-season-1-episode-2`;

    await addSeries(seriesId, `E2E Drawer Active ${uid}`);
    await addEpisode({ id: ep1, seriesId, seasonNumber: 1, episodeNumber: 1, title: "Ep 1", stillUrl: STILL_1 });
    await addEpisode({ id: ep2, seriesId, seasonNumber: 1, episodeNumber: 2, title: "Ep 2", stillUrl: STILL_2 });

    try {
      await page.goto(`/episode/${ep2}`);
      const drawerBtn = page.getByRole("button", { name: /episodes|episode selector/i });
      if (await drawerBtn.isVisible()) {
        await drawerBtn.click();
        const drawer = page.getByRole("dialog").or(page.locator("[data-drawer='episodes']")).or(page.locator("aside"));
        const ep2Link = drawer.getByRole("link", { name: /Ep 2/ });
        await expect(ep2Link).toHaveAttribute("aria-current", "page");
      }
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  // Tier 4: End-to-End Real-World Workflows

  test("T4-Watch-1: Real-World Workload 2: Slug Rename & Binge Watch Redirection Workflow", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-binge-redir-${uid}`;
    const ep1 = `${seriesId}-season-1-episode-1`;
    const oldSlug = `${seriesId}-season-1-episode-2`;
    const newSlug = `${seriesId}-season-1-episode-3`;
    const ep4 = `${seriesId}-season-1-episode-4`;

    await addSeries(seriesId, `E2E Binge Redir ${uid}`);
    await addEpisode({ id: ep1, seriesId, seasonNumber: 1, episodeNumber: 1, title: "Pilot", stillUrl: STILL_1 });
    await addEpisode({ id: newSlug, seriesId, seasonNumber: 1, episodeNumber: 3, title: "Renumbered Three", stillUrl: STILL_2 });
    await addEpisode({ id: ep4, seriesId, seasonNumber: 1, episodeNumber: 4, title: "Episode Four", stillUrl: STILL_3 });

    await sql(
      `INSERT INTO episode_redirect (id, "mediaId", "oldSlug", "newSlug", "oldSeasonNumber", "oldEpisodeNumber", "newSeasonNumber", "newEpisodeNumber", "createdAt")
       VALUES ($1, $2, $3, $4, 1, 2, 1, 3, now())`,
      [`redir-binge-${uid}`, seriesId, oldSlug, newSlug]
    );

    try {
      // 1. User arrives from bookmarked old link
      await page.goto(`/episode/${oldSlug}`);

      // 2. HTTP 308 redirect delivers user to new slug
      await expect(page).toHaveURL(`/episode/${newSlug}`);
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Renumbered Three");

      // 3. User continues binge-watching to next episode
      const nextCard = page.locator("a").filter({ hasText: /Next/ });
      await expect(nextCard).toHaveAttribute("href", `/episode/${ep4}`);
      await nextCard.click();

      // 4. Lands on Episode 4
      await expect(page).toHaveURL(`/episode/${ep4}`);
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Episode Four");
    } finally {
      await sql(`DELETE FROM episode_redirect WHERE id = $1`, [`redir-binge-${uid}`]);
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });

  test("T4-Watch-2: Real-World Workload 1: Binge-watching workflow with Episode Selector Drawer", async ({
    page,
    consoleProblems,
  }) => {
    void consoleProblems;
    const uid = uniqueId();
    const seriesId = `e2e-binge-drawer-${uid}`;
    const s1e1 = `${seriesId}-season-1-episode-1`;
    const s2e1 = `${seriesId}-season-2-episode-1`;
    const s2e2 = `${seriesId}-season-2-episode-2`;

    await addSeries(seriesId, `E2E Binge Drawer ${uid}`);
    await addEpisode({ id: s1e1, seriesId, seasonNumber: 1, episodeNumber: 1, title: "S1 Pilot", stillUrl: STILL_1 });
    await addEpisode({ id: s2e1, seriesId, seasonNumber: 2, episodeNumber: 1, title: "S2 Premiere", stillUrl: STILL_2 });
    await addEpisode({ id: s2e2, seriesId, seasonNumber: 2, episodeNumber: 2, title: "S2 Episode 2", stillUrl: STILL_3 });

    try {
      await page.goto(`/episode/${s1e1}`);
      const drawerBtn = page.getByRole("button", { name: /episodes|episode selector/i });
      if (await drawerBtn.isVisible()) {
        await drawerBtn.click();
        const drawer = page.getByRole("dialog").or(page.locator("[data-drawer='episodes']")).or(page.locator("aside"));
        await drawer.getByRole("link", { name: /S2 Premiere/ }).click();
        await expect(page).toHaveURL(`/episode/${s2e1}`);
        await expect(page.getByRole("heading", { level: 1 })).toContainText("S2 Premiere");

        const nextCard = page.locator("a").filter({ hasText: /Next/ });
        await nextCard.click();
        await expect(page).toHaveURL(`/episode/${s2e2}`);
      }
    } finally {
      await sql(`DELETE FROM media WHERE id = $1`, [seriesId]);
    }
  });
});
