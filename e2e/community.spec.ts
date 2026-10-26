import { randomUUID } from "node:crypto";
import type { Browser } from "@playwright/test";
import { ADMIN_STATE, createVerifiedAccount, newAccount, sql } from "./accounts";
import { ADMIN_CREDENTIALS, expect, guestPage, seriousViolations, signedInPage, test } from "./fixtures";

/*
 * The community (A9): reviews on a title's page, posted under a nickname
 * the member picks; Community Lists, which a member opts a shared list
 * into; reporting either; and moderating them in /admin/community.
 */

/** A nickname no earlier run has taken. */
function nickname(label: string) {
  return `${label}${Math.random().toString(36).slice(2, 8)}`;
}

/** The e2e admin, signed in and past two-factor, in a browser of its own. */
async function adminPage(browser: Browser) {
  const context = await browser.newContext({ httpCredentials: ADMIN_CREDENTIALS, storageState: ADMIN_STATE });
  return context.newPage();
}

test("members review a title under a nickname, report one, and a moderator hides it", async ({
  browser,
  request,
}) => {
  // A guest reads reviews, and is asked to log in to write one.
  const guest = await guestPage(browser);
  await guest.goto("/movie/chosen-family");
  await guest.getByRole("button", { name: "Write a Review" }).click();
  await expect(guest.getByRole("dialog", { name: "Log in to write a review" })).toBeVisible();

  // The author picks a nickname with their first review.
  const author = newAccount("reviewer");
  await createVerifiedAccount(request, author);
  const name = nickname("Critic");
  const body = `A warm, funny film about the family you choose. ${randomUUID()}`;
  const page = await signedInPage(browser, author);
  await page.goto("/movie/chosen-family");
  const reviews = page.getByRole("region", { name: /^Reviews/ });
  await reviews.getByLabel("Your nickname").fill(name);
  await reviews.getByLabel("Your review of Chosen Family").fill(body);
  await reviews.getByRole("button", { name: "Post Review" }).click();
  await expect(page.getByText("Review posted")).toBeVisible();
  await expect(reviews.getByRole("textbox")).toHaveCount(0);
  await expect(reviews.getByText("Your review", { exact: true })).toBeVisible();
  await expect(reviews.getByText(body)).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  // Changing it keeps one review.
  await reviews.getByRole("button", { name: "Edit" }).click();
  await reviews.getByLabel("Your review").fill(`${body} Edited.`);
  await reviews.getByRole("button", { name: "Save Review" }).click();
  // (The textarea holds the new text too, so wait for the form to close.)
  await expect(page.getByText("Review updated")).toBeVisible();
  await expect(reviews.getByRole("textbox")).toHaveCount(0);
  await expect(reviews.getByText(`${body} Edited.`)).toBeVisible();
  const saved = () =>
    sql<{ body: string }>(
      `SELECT r.body FROM review r JOIN "user" u ON u.id = r."userId" WHERE u.email = $1`,
      [author.email]
    );
  await expect.poll(saved).toEqual([{ body: `${body} Edited.` }]);

  // Others see it under the nickname, never the account's name.
  await guest.reload();
  const guestReviews = guest.getByRole("region", { name: /^Reviews/ });
  const item = guestReviews.getByRole("listitem").filter({ hasText: body });
  await expect(item).toContainText(name);
  await expect(item).not.toContainText(author.name);

  // Another member reports it.
  const reporter = newAccount("reporter");
  await createVerifiedAccount(request, reporter);
  const other = await signedInPage(browser, reporter);
  await other.goto("/movie/chosen-family");
  await other.getByRole("button", { name: `Report review by ${name}` }).click();
  const dialog = other.getByRole("dialog", { name: `Report review by ${name}` });
  await dialog.getByLabel("Spoilers").check();
  await dialog.getByRole("button", { name: "Send Report" }).click();
  await expect(other.getByText("Thanks. Our moderators will take a look.")).toBeVisible();

  // A moderator sees it with the reason, and hides it.
  const admin = await adminPage(browser);
  await admin.goto("/admin/community");
  const reported = admin.getByRole("listitem").filter({ hasText: body });
  await expect(reported).toContainText("1 open report: Spoilers");
  expect(await seriousViolations(admin)).toEqual([]);
  await reported.getByRole("button", { name: `Hide review by ${name}` }).click();
  await expect(admin.getByRole("listitem").filter({ hasText: body })).toHaveCount(0);

  // Gone for everyone but its author, who's told.
  await guest.reload();
  await expect(guest.getByText(body)).toHaveCount(0);
  await page.reload();
  await expect(reviews.getByText("A moderator hid this review. Only you can see it.")).toBeVisible();
});

test("a shared list goes on Community Lists under a nickname, until a moderator takes it off", async ({
  browser,
  request,
}) => {
  const owner = newAccount("community");
  await createVerifiedAccount(request, owner);
  const listId = randomUUID();
  const listName = `E2E Community ${listId.slice(0, 8)}`;
  await sql(
    `INSERT INTO media_list (id, "userId", name, "isPublic", "updatedAt")
     SELECT $2, id, $3, true, now() FROM "user" WHERE email = $1`,
    [owner.email, listId, listName]
  );
  await sql(
    `INSERT INTO list_item ("listId", "mediaId", entry) VALUES ($1, 'chosen-family', $2::jsonb)`,
    [
      listId,
      JSON.stringify({ id: "chosen-family", title: "Chosen Family", year: 2023, duration: "1h 52m", type: "movie", genre: "Drama" }),
    ]
  );

  // The owner turns it on, picking a nickname first.
  const name = nickname("Curator");
  const page = await signedInPage(browser, owner);
  await page.goto(`/list/${listId}`);
  await page.getByRole("button", { name: "Share" }).click();
  const share = page.getByRole("dialog", { name: `Share "${listName}"` });
  const community = share.getByRole("switch", { name: "Show in Community Lists" });
  await community.click();
  await share.getByLabel("Your nickname").fill(name);
  await share.getByRole("button", { name: "Save and Show" }).click();
  await expect(page.getByText("Now on Community Lists")).toBeVisible();
  await expect(community).toHaveAttribute("aria-checked", "true");

  // Anyone finds it there, under the nickname.
  const guest = await guestPage(browser);
  await guest.goto("/lists");
  const card = guest.getByRole("link", { name: new RegExp(listName) });
  await expect(card).toContainText(`by ${name}`);
  expect(await seriousViolations(guest)).toEqual([]);
  await card.click();
  await expect(guest.getByRole("heading", { name: listName })).toBeVisible();
  await expect(guest.getByText(`by ${name} · 1 title`)).toBeVisible();
  await expect(guest.getByRole("button", { name: `Report list by ${name}` })).toBeVisible();

  // A moderator takes it off, and the owner can't put it back.
  const admin = await adminPage(browser);
  await admin.goto("/admin/community?tab=recent");
  await admin.getByRole("button", { name: `Take ${listName} off Community Lists` }).click();
  await expect(admin.getByText("List taken off Community Lists.")).toBeVisible();

  await guest.goto("/lists");
  await expect(guest.getByRole("link", { name: new RegExp(listName) })).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Share" }).click();
  await expect(share.getByText("A moderator took this list off Community Lists.")).toBeVisible();
  await expect(share.getByRole("switch", { name: "Show in Community Lists" })).toBeDisabled();
});
