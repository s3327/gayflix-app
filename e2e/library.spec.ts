import type { Page } from "@playwright/test";
import { createVerifiedAccount, newAccount, sql } from "./accounts";
import { guestPage, signedInPage, test, expect } from "./fixtures";

/*
 * Favorites, lists, history and reports are stored on the server, so
 * each test uses its own fresh account and checks the result from a
 * second browser ("another device").
 */

/** Runs `action` and waits for the server function it calls to succeed. */
async function saved(page: Page, action: () => Promise<void>) {
  const response = page.waitForResponse(
    (r) => r.request().method() === "POST" && "next-action" in r.request().headers()
  );
  await action();
  expect((await response).ok()).toBe(true);
}

test("favorites and lists follow the account to another device", async ({ browser, request }) => {
  const account = newAccount("library");
  await createVerifiedAccount(request, account);

  const page = await signedInPage(browser, account);
  await page.goto("/movie/chosen-family", { waitUntil: "networkidle" });
  await saved(page, () => page.getByRole("button", { name: "Add to Favorites" }).click());

  await page.goto("/account/favorite");
  await page.getByRole("button", { name: "Add to list" }).click();
  await page.getByPlaceholder("New list name").fill("Weekend");
  await saved(page, () => page.getByRole("button", { name: "Create list" }).click());
  await expect(page.getByRole("button", { name: /Weekend/ })).toHaveAttribute("aria-pressed", "true");

  const otherDevice = await signedInPage(browser, account);
  await otherDevice.goto("/movie/chosen-family");
  await expect(otherDevice.getByRole("button", { name: "Remove from Favorites" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await otherDevice.goto("/account/favorite");
  await otherDevice.getByRole("button", { name: "My Lists" }).click();
  await otherDevice.getByRole("link", { name: /Weekend/ }).click();
  await expect(otherDevice).toHaveURL(/\/list\/[0-9a-f-]{36}$/);
  const listUrl = otherDevice.url();
  await expect(otherDevice.getByRole("heading", { name: "Weekend" })).toBeVisible();
  await expect(otherDevice.getByRole("link", { name: /Chosen Family/ })).toBeVisible();

  // A list is private until it's shared...
  await expect(otherDevice.locator("main").getByText("Private")).toBeVisible();
  const guest = await guestPage(browser);
  const before = await guest.goto(listUrl);
  expect(before?.status()).toBe(404);

  // ...then anyone with the link can view it, but only the owner can change it.
  await otherDevice.getByRole("button", { name: "Share" }).click();
  const dialog = otherDevice.getByRole("dialog", { name: 'Share "Weekend"' });
  await expect(dialog.getByRole("button", { name: "Copy Link" })).toHaveCount(0);
  await saved(otherDevice, () =>
    dialog.getByRole("switch", { name: "Anyone with the link can view" }).check()
  );
  await expect(dialog.getByRole("button", { name: "Copy Link" })).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await guest.goto(listUrl);
  await expect(guest.getByRole("heading", { name: "Weekend" })).toBeVisible();
  await expect(guest.getByRole("link", { name: /Chosen Family/ })).toBeVisible();
  await expect(guest.getByRole("button", { name: "Remove from list" })).toHaveCount(0);

  await saved(otherDevice, () =>
    otherDevice.getByRole("button", { name: "Remove from list" }).click()
  );
  await guest.reload();
  await expect(guest.getByText("This list is empty.")).toBeVisible();
});

test("favorites list newest first, a removal can be undone, and drafts stay hidden", async ({
  browser,
  request,
}) => {
  const account = newAccount("favorites");
  await createVerifiedAccount(request, account);
  const page = await signedInPage(browser, account);
  for (const id of ["chosen-family", "loud-address"]) {
    await page.goto(id === "chosen-family" ? `/movie/${id}` : `/series/${id}`, {
      waitUntil: "networkidle",
    });
    await saved(page, () => page.getByRole("button", { name: "Add to Favorites" }).click());
  }
  // Saved before the title went back to being a draft.
  await sql(
    `INSERT INTO favorite ("userId", "mediaId", entry)
     SELECT id, 'cabin-fever', $2::jsonb FROM "user" WHERE email = $1`,
    [
      account.email,
      JSON.stringify({ id: "cabin-fever", title: "Cabin Fever", year: 2024, duration: "1h", type: "movie", genre: "Drama" }),
    ]
  );

  await page.goto("/account/favorite");
  const titles = page.locator("main a p:first-of-type");
  await expect(titles).toHaveText(["Loud Address", "Chosen Family"]);

  await saved(page, () =>
    page.getByRole("button", { name: "Remove from favorites" }).first().click()
  );
  await expect(titles).toHaveText(["Chosen Family"]);
  await saved(page, () =>
    page.getByRole("status").filter({ hasText: "Removed from Favorites" }).getByRole("button", { name: "Undo" }).click()
  );
  await expect(titles).toHaveText(["Loud Address", "Chosen Family"]);
  await page.reload();
  await expect(titles).toHaveText(["Loud Address", "Chosen Family"]);
});

test("a list's page leads back to My Lists, and can rename and delete it", async ({
  browser,
  request,
}) => {
  const account = newAccount("list-page");
  await createVerifiedAccount(request, account);
  const page = await signedInPage(browser, account);
  await page.goto("/account/favorite?tab=lists");
  await page.getByRole("button", { name: "Create List" }).click();
  await page.getByLabel("List name").fill("Rainy Day");
  await saved(page, () => page.getByRole("button", { name: "Create", exact: true }).click());
  await page.getByRole("link", { name: /Rainy Day/ }).click();
  await expect(page).toHaveTitle("Rainy Day · Gayflix");

  await page.getByRole("button", { name: "Rename" }).click();
  await page.getByLabel("List name").fill("Sunny Day");
  await saved(page, () => page.getByRole("button", { name: "Save" }).click());
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sunny Day");

  await page.getByRole("link", { name: "My Lists" }).click();
  await expect(page).toHaveURL(/\/account\/favorite\?tab=lists$/);
  await page.getByRole("link", { name: /Sunny Day/ }).click();
  // My Lists has its own "Delete list" buttons, so wait to leave it.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sunny Day");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await saved(page, () => page.getByRole("dialog").getByRole("button", { name: "Delete" }).click());
  await expect(page).toHaveURL(/\/account\/favorite\?tab=lists$/);
  await expect(page.getByRole("link", { name: /Sunny Day/ })).toHaveCount(0);
});

test("add a title to a list from its own, watch and episode pages", async ({ browser, request }) => {
  // A guest is asked to log in, and comes back to the title.
  const guest = await guestPage(browser);
  await guest.goto("/movie/chosen-family");
  await guest.getByRole("button", { name: "Add to List" }).click();
  const prompt = guest.getByRole("dialog", { name: "Log in to make lists" });
  await expect(prompt.getByRole("link", { name: "Log in" })).toHaveAttribute(
    "href",
    "/login?next=%2Fmovie%2Fchosen-family"
  );

  const account = newAccount("add-to-list");
  await createVerifiedAccount(request, account);
  const page = await signedInPage(browser, account);
  await page.goto("/movie/chosen-family", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Add to List" }).click();
  await page.getByPlaceholder("New list name").fill("Tonight");
  await saved(page, () => page.getByRole("button", { name: "Create list" }).click());
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("button", { name: "In 1 List" })).toBeVisible();

  // The watch page has the same buttons.
  await page.goto("/watch/chosen-family", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "In 1 List" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to Favorites" })).toBeVisible();

  // An episode's page adds its series.
  await page.goto("/episode/the-brownstone-season-1-episode-1", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Add to List" }).click();
  await saved(page, () => page.getByRole("button", { name: /Tonight/ }).click());
  await page.getByRole("button", { name: "Close" }).click();

  const otherDevice = await signedInPage(browser, account);
  await otherDevice.goto("/account/favorite");
  await otherDevice.getByRole("button", { name: "My Lists" }).click();
  await otherDevice.getByRole("link", { name: /Tonight/ }).click();
  await expect(otherDevice.getByRole("link", { name: /Chosen Family/ })).toBeVisible();
  await expect(otherDevice.getByRole("link", { name: /The Brownstone/ })).toHaveAttribute(
    "href",
    "/series/the-brownstone"
  );
});

test("a guest's watch history moves into their account", async ({ browser, request }) => {
  const account = newAccount("history");
  await createVerifiedAccount(request, account);

  const page = await guestPage(browser);
  await page.goto("/watch/chosen-family", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Play Chosen Family" }).click();
  await page.goto("/account/history");
  await expect(page).toHaveURL(/\/login\?next=/);

  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Log In" }).click();
  await expect(page).toHaveURL(/\/account\/history$/);
  // It asks first: a shared computer's guest history may not be theirs.
  const offer = page.getByRole("region", { name: "Watched on this browser" });
  await expect(offer).toContainText("1 title was watched here before you logged in.");
  await expect(page.locator('main a[href="/movie/chosen-family"]')).toHaveCount(0);
  await offer.getByRole("button", { name: "Add" }).click();
  await expect(offer).toBeHidden();
  await expect(page.locator('main a[href="/movie/chosen-family"]')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("gayflix:history")))
    .toBe("{}");

  const otherDevice = await signedInPage(browser, account);
  await otherDevice.goto("/account/history");
  await expect(otherDevice.locator('main a[href="/movie/chosen-family"]')).toBeVisible();
});

test("someone else's guest history can be cleared instead", async ({ browser, request }) => {
  const account = newAccount("history-clear");
  await createVerifiedAccount(request, account);

  const page = await guestPage(browser);
  await page.goto("/watch/chosen-family", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Play Chosen Family" }).click();
  await page.goto("/login?next=%2Faccount%2Fhistory");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Log In" }).click();
  await expect(page).toHaveURL(/\/account\/history$/);

  const offer = page.getByRole("region", { name: "Watched on this browser" });
  await offer.getByRole("button", { name: "Clear" }).click();
  await expect(offer).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("gayflix:history")))
    .toBe("{}");
  await page.reload();
  await expect(page.locator('main a[href="/movie/chosen-family"]')).toHaveCount(0);
  await expect(offer).toBeHidden();
});

test("signed-in users get five reports a day", async ({ browser, request }) => {
  const account = newAccount("reports");
  await createVerifiedAccount(request, account);
  const page = await signedInPage(browser, account);

  await page.goto("/watch/chosen-family", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Report an issue" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("You have 5 of 5 left today.");
  await dialog.getByLabel("What's the issue?").selectOption("Audio out of sync");
  await dialog.getByLabel("Additional details (optional)").fill("About two seconds behind");
  await dialog.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("Report submitted")).toBeVisible();

  await page.getByRole("button", { name: "Report an issue" }).click();
  await expect(dialog).toContainText("You have 4 of 5 left today.");
});

test("guests get three reports a day, and can log in for more", async ({ browser }) => {
  const page = await guestPage(browser);
  const episode = "/episode/the-brownstone-season-1-episode-1";
  await page.goto(episode, { waitUntil: "networkidle" });
  const dialog = page.getByRole("dialog");
  const reasons = ["Video won't play", "Wrong title details", "Inappropriate content"];
  for (const [sent, reason] of reasons.entries()) {
    await page.getByRole("button", { name: "Report an issue" }).click();
    await expect(dialog).toContainText(`You have ${3 - sent} of 3 left today.`);
    await dialog.getByLabel("What's the issue?").selectOption(reason);
    await dialog.getByRole("button", { name: "Submit" }).click();
    // The modal closes only once the report is saved.
    await expect(dialog).toHaveCount(0);
  }

  await page.getByRole("button", { name: "Report an issue" }).click();
  await expect(dialog).toContainText("You've used today's limit");
  await expect(dialog.getByRole("button", { name: "Submit" })).toBeDisabled();
  await expect(dialog.getByRole("link", { name: "Log in for more" })).toHaveAttribute(
    "href",
    `/login?next=${encodeURIComponent(episode)}`
  );
});

test("a card's quick actions play, favorite and add to a list", async ({ browser, request }) => {
  const account = newAccount("quick");
  await createVerifiedAccount(request, account);
  const card = (page: Page) =>
    page.locator("main").getByRole("link", { name: "Chosen Family 2025 · 1h 52m" });

  // A mouse shortcut, out of the keyboard's and screen readers' way: the
  // title's page has the same actions.
  const action = (page: Page, role: "link" | "button", name: string) =>
    page.getByRole(role, { name, includeHidden: true });

  // On hover, over the poster, for anyone.
  const guest = await guestPage(browser);
  await guest.goto("/movie");
  await card(guest).hover();
  await expect(action(guest, "link", "Play Chosen Family")).toBeVisible();
  await expect(action(guest, "link", "Play Chosen Family")).toHaveAttribute(
    "href",
    "/watch/chosen-family"
  );
  await action(guest, "button", "Favorite Chosen Family").click();
  await expect(guest.getByRole("dialog", { name: "Log in to save favorites" })).toBeVisible();

  const page = await signedInPage(browser, account);
  await page.goto("/movie", { waitUntil: "networkidle" });
  await card(page).hover();
  const favorite = action(page, "button", "Favorite Chosen Family");
  await saved(page, () => favorite.click());
  await expect(favorite).toHaveAttribute("aria-pressed", "true");

  await action(page, "button", "Add Chosen Family to a list").click();
  await page.getByPlaceholder("New list name").fill("Quick");
  await saved(page, () => page.getByRole("button", { name: "Create list" }).click());
  await expect(page.getByRole("button", { name: /Quick/ })).toHaveAttribute("aria-pressed", "true");

  const rows = await sql<{ favorites: number; items: number }>(
    `SELECT (SELECT count(*)::int FROM favorite f WHERE f."userId" = u.id AND f."mediaId" = 'chosen-family') AS favorites,
            (SELECT count(*)::int FROM list_item i JOIN media_list l ON l.id = i."listId"
             WHERE l."userId" = u.id AND i."mediaId" = 'chosen-family') AS items
     FROM "user" u WHERE u.email = $1`,
    [account.email]
  );
  expect(rows[0]).toEqual({ favorites: 1, items: 1 });

  // A touchscreen has no hover: a tap opens the title, which has the same actions.
  const phone = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const touch = await phone.newPage();
  await touch.goto("/movie");
  await expect(card(touch)).toBeVisible();
  await expect(action(touch, "link", "Play Chosen Family")).toBeHidden();
  await phone.close();
});
