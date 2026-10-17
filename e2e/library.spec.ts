import type { Page } from "@playwright/test";
import { createVerifiedAccount, newAccount } from "./accounts";
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
  await expect(page.locator('main a[href="/movie/chosen-family"]')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("gayflix:history")))
    .toBe("{}");

  const otherDevice = await signedInPage(browser, account);
  await otherDevice.goto("/account/history");
  await expect(otherDevice.locator('main a[href="/movie/chosen-family"]')).toBeVisible();
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

test("guests get one report a day", async ({ browser }) => {
  const page = await guestPage(browser);
  await page.goto("/episode/the-brownstone-season-1-episode-1", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Report an issue" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("You have 1 of 1 left today — log in for more.");
  await dialog.getByLabel("What's the issue?").selectOption("Video won't play");
  await dialog.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("Report submitted")).toBeVisible();

  await page.getByRole("button", { name: "Report an issue" }).click();
  await expect(dialog).toContainText("You've used today's limit");
  await expect(dialog.getByRole("button", { name: "Submit" })).toBeDisabled();
});
