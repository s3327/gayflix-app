import { createVerifiedAccount, newAccount, sql } from "./accounts";
import { expect, guestPage, signedInPage, test } from "./fixtures";

/*
 * Because You Watched on the home page (listBecauseYouWatched in
 * src/lib/catalog.ts): a row of titles like one a member played lately,
 * ranked the way You Might Also Like is, leaving out what they've
 * already played and titles too unlike it. The titles are this test's
 * own, in a genre only they have, dated in the past to stay off Recently
 * Added.
 */

const POSTER = "https://picsum.photos/seed/e2e-because/500/750";

function uniqueId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function addTitle(id: string, title: string, genres: string[], type = "movie") {
  await sql(
    `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "publishedAt", "createdAt", "updatedAt")
     VALUES ($1, $2::media_type, 'published', $3, 2001, '1h 30m', $4, 'Canada', 'French', $5,
             '2001-01-01', '2001-01-01', '2001-01-01')`,
    [id, type, title, genres, POSTER]
  );
}

/** A History entry, `minutesAgo` back, as pressing Play leaves one. */
async function addHistory(email: string, id: string, title: string, minutesAgo: number) {
  await sql(
    `INSERT INTO watch_history ("userId", "mediaId", entry, "watchedAt")
     SELECT id, $2, $3::jsonb, now() - make_interval(mins => $4) FROM "user" WHERE email = $1`,
    [
      email,
      id,
      JSON.stringify({ id, title, year: 2001, duration: "1h 30m", type: "movie", genre: "Drama" }),
      minutesAgo,
    ]
  );
}

test("Because You Watched suggests titles like the ones a member played", async ({
  browser,
  request,
}) => {
  const uid = uniqueId();
  const genre = `E2E Because ${uid}`;
  const id = (name: string) => `e2e-because-${name}-${uid}`;
  const seed = { id: id("seed"), title: `E2E Seed ${uid}` };
  const alike = [1, 2, 3, 4].map((n) => ({ id: id(`alike-${n}`), title: `E2E Alike ${n} ${uid}` }));
  const played = { id: id("played"), title: `E2E Played ${uid}` };
  const unlike = { id: id("unlike"), title: `E2E Unlike ${uid}` };
  const lonely = { id: id("lonely"), title: `E2E Lonely ${uid}` };

  await addTitle(seed.id, seed.title, [genre]);
  for (const title of alike) await addTitle(title.id, title.title, [genre]);
  await addTitle(played.id, played.title, [genre]);
  // Shares only the type: too unlike to suggest.
  await addTitle(unlike.id, unlike.title, [`E2E Elsewhere ${uid}`]);
  // In a genre of its own, so nothing is like it: no row for it.
  await addTitle(lonely.id, lonely.title, [`E2E Alone ${uid}`]);

  const account = newAccount("because");
  await createVerifiedAccount(request, account);
  try {
    const page = await signedInPage(browser, account);
    await page.goto("/home");
    await expect(page.getByRole("heading", { name: "Recently Added" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Because You Watched/ })).toHaveCount(0);

    await addHistory(account.email, played.id, played.title, 10);
    await addHistory(account.email, seed.id, seed.title, 5);
    await addHistory(account.email, lonely.id, lonely.title, 1);

    await page.goto("/home");
    // The latest title, Lonely, has nothing like it, so the row is for Seed.
    await expect(
      page.getByRole("heading", { name: `Because You Watched ${lonely.title}` })
    ).toHaveCount(0);
    const row = page.locator("section").filter({
      has: page.getByRole("heading", { name: `Because You Watched ${seed.title}` }),
    });
    for (const title of alike) {
      await expect(row.locator(`a[href="/movie/${title.id}"]`).first()).toBeVisible();
    }
    // Already played, or too unlike: left out.
    for (const left of [seed, played, unlike]) {
      await expect(row.locator(`a[href="/movie/${left.id}"]`)).toHaveCount(0);
    }

    // Guests don't get the row: their history is in their browser.
    const guest = await guestPage(browser);
    await guest.goto("/home");
    await expect(guest.getByRole("heading", { name: "Recently Added" })).toBeVisible();
    await expect(guest.getByRole("heading", { name: /^Because You Watched/ })).toHaveCount(0);
  } finally {
    await sql(`DELETE FROM media WHERE id LIKE $1`, [`e2e-because-%-${uid}`]);
  }
});
