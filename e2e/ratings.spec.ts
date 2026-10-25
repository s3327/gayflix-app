import { createVerifiedAccount, newAccount, sql } from "./accounts";
import { expect, guestPage, seriousViolations, signedInPage, test } from "./fixtures";

/*
 * Member ratings (A7): Not for me, Like and Love it on title, watch and
 * episode pages, saved in the account (media_rating); the title page's
 * "Most liked" badge; and Because You Watched rows for titles a member
 * liked or loved. The badge and row tests use their own titles, dated in
 * the past to stay off Recently Added.
 */

const POSTER = "https://picsum.photos/seed/e2e-ratings/500/750";

function uniqueId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function addTitle(id: string, title: string, genres: string[]) {
  await sql(
    `INSERT INTO media (id, type, status, title, year, duration, genres, country, language, "posterUrl", "publishedAt", "createdAt", "updatedAt")
     VALUES ($1, 'movie', 'published', $2, 2001, '1h 30m', $3, 'Canada', 'French', $4,
             '2001-01-01', '2001-01-01', '2001-01-01')`,
    [id, title, genres, POSTER]
  );
}

async function ratingsOf(email: string) {
  return sql<{ mediaId: string; value: string }>(
    `SELECT r."mediaId", r.value::text AS value FROM media_rating r
     JOIN "user" u ON u.id = r."userId" WHERE u.email = $1 ORDER BY r."mediaId"`,
    [email]
  );
}

test("a member rates a title, changes it and takes it back", async ({ browser, request }) => {
  // A guest is asked to log in, and comes back to the title.
  const guest = await guestPage(browser);
  await guest.goto("/movie/chosen-family");
  await guest.getByRole("group", { name: "Rate Chosen Family" }).getByRole("button", { name: "Like" }).click();
  const prompt = guest.getByRole("dialog", { name: "Log in to rate titles" });
  await expect(prompt.getByRole("link", { name: "Log in" })).toHaveAttribute(
    "href",
    "/login?next=%2Fmovie%2Fchosen-family"
  );

  const account = newAccount("ratings");
  await createVerifiedAccount(request, account);
  const page = await signedInPage(browser, account);
  await page.goto("/movie/chosen-family");
  const rate = page.getByRole("group", { name: "Rate Chosen Family" });
  const button = (name: string) => rate.getByRole("button", { name, exact: true });

  await button("Like").click();
  await expect(button("Like")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => ratingsOf(account.email)).toEqual([{ mediaId: "chosen-family", value: "like" }]);

  // One rating per title: Love it replaces Like, and stays after a reload.
  await button("Love it").click();
  await expect(button("Like")).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => ratingsOf(account.email)).toEqual([{ mediaId: "chosen-family", value: "love" }]);
  await page.reload();
  await expect(button("Love it")).toHaveAttribute("aria-pressed", "true");
  expect(await seriousViolations(page)).toEqual([]);

  // The watch page shows the same rating; pressing it again takes it back.
  await page.goto("/watch/chosen-family");
  await expect(button("Love it")).toHaveAttribute("aria-pressed", "true");
  await button("Love it").click();
  await expect(button("Love it")).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => ratingsOf(account.email)).toEqual([]);

  // An episode's page rates its series.
  const [episode] = await sql<{ id: string }>(
    `SELECT id FROM episode WHERE "mediaId" = 'the-brownstone' ORDER BY "seasonNumber", "episodeNumber" LIMIT 1`
  );
  await page.goto(`/episode/${episode.id}`);
  await page
    .getByRole("group", { name: "Rate The Brownstone" })
    .getByRole("button", { name: "Not for me" })
    .click();
  await expect
    .poll(() => ratingsOf(account.email))
    .toEqual([{ mediaId: "the-brownstone", value: "not_for_me" }]);
});

test("a title most members like is marked Most liked", async ({ browser }) => {
  const uid = uniqueId();
  const id = `e2e-ratings-liked-${uid}`;
  await addTitle(id, `E2E Liked ${uid}`, ["Drama"]);
  const users = [1, 2, 3, 4, 5, 6].map((n) => `e2e-ratings-${n}-${uid}`);
  for (const user of users) {
    await sql(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, 'E2E Rater', $1 || '@example.test', true, now(), now())`,
      [user]
    );
  }
  const rateAs = (user: string, value: string) =>
    sql(
      `INSERT INTO media_rating ("userId", "mediaId", value) VALUES ($1, $2, $3::rating_value)`,
      [user, id, value]
    );

  try {
    const page = await guestPage(browser);
    const badge = page.getByRole("region", { name: `E2E Liked ${uid}` }).getByText("Most liked");

    // Four ratings aren't enough, however warm.
    for (const user of users.slice(0, 4)) await rateAs(user, "love");
    await page.goto(`/movie/${id}`);
    await expect(page.getByRole("heading", { name: `E2E Liked ${uid}` })).toBeVisible();
    await expect(badge).toHaveCount(0);

    // Four in five liked it.
    await rateAs(users[4], "not_for_me");
    await page.reload();
    await expect(badge).toBeVisible();

    // Four in six: no longer.
    await rateAs(users[5], "not_for_me");
    await page.reload();
    await expect(page.getByRole("heading", { name: `E2E Liked ${uid}` })).toBeVisible();
    await expect(badge).toHaveCount(0);
  } finally {
    await sql(`DELETE FROM media WHERE id = $1`, [id]);
    await sql(`DELETE FROM "user" WHERE id = ANY($1)`, [users]);
  }
});

test("Because You Watched follows what a member loved, never what was not for them", async ({
  browser,
  request,
}) => {
  const uid = uniqueId();
  const id = (name: string) => `e2e-ratings-${name}-${uid}`;
  const loved = { id: id("loved"), title: `E2E Loved ${uid}` };
  const lovedGenre = `E2E Loved Genre ${uid}`;
  const alike = [1, 2, 3, 4, 5].map((n) => ({ id: id(`alike-${n}`), title: `E2E Alike ${n} ${uid}` }));
  const disliked = { id: id("disliked"), title: `E2E Disliked ${uid}` };
  const dislikedGenre = `E2E Disliked Genre ${uid}`;
  const others = [1, 2, 3, 4].map((n) => ({ id: id(`other-${n}`), title: `E2E Other ${n} ${uid}` }));

  await addTitle(loved.id, loved.title, [lovedGenre]);
  for (const title of alike) await addTitle(title.id, title.title, [lovedGenre]);
  await addTitle(disliked.id, disliked.title, [dislikedGenre]);
  for (const title of others) await addTitle(title.id, title.title, [dislikedGenre]);

  const account = newAccount("ratings-because");
  await createVerifiedAccount(request, account);
  try {
    const page = await signedInPage(browser, account);
    const rate = async (title: { id: string; title: string }, name: string) => {
      await page.goto(`/movie/${title.id}`);
      await page.getByRole("group", { name: `Rate ${title.title}` }).getByRole("button", { name, exact: true }).click();
      await expect(
        page.getByRole("group", { name: `Rate ${title.title}` }).getByRole("button", { name, exact: true })
      ).toHaveAttribute("aria-pressed", "true");
    };
    // One title rated Like (its row would hold the same titles, so the
    // later Love it row takes them); one loved, never played; and one
    // not for the member, though they played it last.
    await rate(alike[4], "Like");
    await rate(loved, "Love it");
    await rate(disliked, "Not for me");
    await sql(
      `INSERT INTO watch_history ("userId", "mediaId", entry, "watchedAt")
       SELECT id, $2, $3::jsonb, now() FROM "user" WHERE email = $1`,
      [
        account.email,
        disliked.id,
        JSON.stringify({ id: disliked.id, title: disliked.title, year: 2001, duration: "1h 30m", type: "movie", genre: "Drama" }),
      ]
    );

    await page.goto("/home");
    const row = page.locator("section").filter({
      has: page.getByRole("heading", { name: `Because You Loved ${loved.title}` }),
    });
    for (const title of alike.slice(0, 4)) {
      await expect(row.locator(`a[href="/movie/${title.id}"]`).first()).toBeVisible();
    }
    // Rated already: left out.
    await expect(row.locator(`a[href="/movie/${alike[4].id}"]`)).toHaveCount(0);
    // Liked earlier: what's like it is on the Love it row already.
    await expect(page.getByRole("heading", { name: `Because You Liked ${alike[4].title}` })).toHaveCount(0);
    // Not for me: no row, though it was played last.
    await expect(page.getByRole("heading", { name: new RegExp(disliked.title) })).toHaveCount(0);
  } finally {
    await sql(`DELETE FROM media WHERE id LIKE $1`, [`e2e-ratings-%-${uid}`]);
  }
});
