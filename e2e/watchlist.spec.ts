import { createVerifiedAccount, newAccount, sql } from "./accounts";
import { expect, guestPage, seriousViolations, signedInPage, test } from "./fixtures";

/*
 * The Watchlist ("Watch later"), kept apart from Favorites: Watch Later on
 * a title's page, its tab under Account → Favorite, and removing with
 * Undo. Saved in the account (watchlist_item).
 */

test("a member keeps a watchlist apart from favorites", async ({ browser, request }) => {
  // A guest is asked to log in, and comes back to the title.
  const guest = await guestPage(browser);
  await guest.goto("/movie/chosen-family");
  await guest.getByRole("button", { name: "Watch Later" }).click();
  const prompt = guest.getByRole("dialog", { name: "Log in to keep a watchlist" });
  await expect(prompt.getByRole("link", { name: "Log in" })).toHaveAttribute(
    "href",
    "/login?next=%2Fmovie%2Fchosen-family"
  );

  const account = newAccount("watchlist");
  await createVerifiedAccount(request, account);
  const saved = async () =>
    (
      await sql<{ mediaId: string }>(
        `SELECT w."mediaId" FROM watchlist_item w JOIN "user" u ON u.id = w."userId" WHERE u.email = $1`,
        [account.email]
      )
    ).map((row) => row.mediaId);

  const page = await signedInPage(browser, account);
  await page.goto("/movie/chosen-family");
  const header = page.getByRole("region", { name: "Chosen Family" });
  await header.getByRole("button", { name: "Watch Later" }).click();
  await expect(header.getByRole("button", { name: "On Watchlist" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Added to Watchlist")).toBeVisible();
  await expect.poll(saved).toEqual(["chosen-family"]);
  // Not a favorite.
  await expect(header.getByRole("button", { name: "Add to Favorites" })).toHaveAttribute("aria-pressed", "false");

  // Its own tab, in the address.
  await page.goto("/account/favorite?tab=watchlist");
  await expect(page.getByRole("button", { name: "Watchlist", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  const card = page.getByRole("main").getByRole("link", { name: /Chosen Family/ });
  await expect(card).toHaveAttribute("href", "/movie/chosen-family");
  expect(await seriousViolations(page)).toEqual([]);

  // Removing offers Undo.
  await page.getByRole("button", { name: "Remove Chosen Family from watchlist" }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(card).toBeVisible();
  await expect.poll(saved).toEqual(["chosen-family"]);

  // And from the title's page again.
  await page.goto("/movie/chosen-family");
  await header.getByRole("button", { name: "On Watchlist" }).click();
  await expect(page.getByText("Removed from Watchlist")).toBeVisible();
  await expect.poll(saved).toEqual([]);
});
