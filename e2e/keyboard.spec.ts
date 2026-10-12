import type { Locator, Page } from "@playwright/test";
import { ADMIN_STATE, USER_STATE } from "./accounts";
import { ADMIN_CREDENTIALS, expect, test } from "./fixtures";

/*
 * The site with only a keyboard: Tab reaches everything, focus never
 * drops to the top of the page, and the focus ring is never cut off or
 * covered. axe (accessibility.spec.ts) can't check any of that.
 */

/** Presses Tab until `target` has focus, the way a keyboard user gets there. */
async function tabTo(page: Page, target: Locator) {
  for (let presses = 0; presses < 80; presses++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error("Tab never reached it");
}

/**
 * The sides of the focused element's focus ring that are hidden: cut off
 * by something that clips what's outside it (a scrolling row, a menu's
 * panel). Empty when the whole ring shows.
 */
async function hiddenRingSides(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return ["nothing has focus"];
    const style = getComputedStyle(el);
    if (style.outlineStyle === "none" || parseFloat(style.outlineWidth) === 0) return ["no ring"];
    // From the element's edge to the middle of its ring.
    const reach = parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth) / 2;
    const rect = el.getBoundingClientRect();
    const hidden = new Set<string>();
    for (let box = el.parentElement; box && box !== document.body; box = box.parentElement) {
      const { overflowX, overflowY } = getComputedStyle(box);
      if (overflowX === "visible" && overflowY === "visible") continue;
      const outer = box.getBoundingClientRect();
      const left = outer.left + box.clientLeft;
      const top = outer.top + box.clientTop;
      if (rect.left - reach < left - 0.5) hidden.add("left");
      if (rect.top - reach < top - 0.5) hidden.add("top");
      if (rect.right + reach > left + box.clientWidth + 0.5) hidden.add("right");
      if (rect.bottom + reach > top + box.clientHeight + 0.5) hidden.add("bottom");
    }
    return [...hidden];
  });
}

/**
 * Whether the focused title card has stopped scrolling fully inside its
 * row, with nothing (an edge fade, a scroll arrow) drawn over it.
 */
async function focusedCardIsClear(page: Page) {
  return page.evaluate(async () => {
    const card = document.activeElement!;
    let row = card.parentElement;
    while (row && getComputedStyle(row).overflowX !== "auto") row = row.parentElement;
    if (!row) return false;
    const scrolled = row.scrollLeft;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (row.scrollLeft !== scrolled) return false;
    const c = card.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    if (c.left < r.left || c.right > r.right) return false;
    // The fades and arrows sit beside the row, over its edges.
    return [...row.parentElement!.children].every((other) => {
      if (other === row) return true;
      const o = other.getBoundingClientRect();
      return o.right <= c.left || o.left >= c.right || o.bottom <= c.top || o.top >= c.bottom;
    });
  });
}

/** Tabs through a row's cards and one step past it. */
async function tabThroughRow(page: Page, row: Locator) {
  const cards = row.getByRole("link");
  const count = await cards.count();
  await tabTo(page, cards.first());
  for (let i = 0; i < count; i++) {
    if (i > 0) await page.keyboard.press("Tab");
    await expect(cards.nth(i)).toBeFocused();
    await expect.poll(() => focusedCardIsClear(page)).toBe(true);
    expect(await hiddenRingSides(page)).toEqual([]);
  }
  // The scroll arrows aren't Tab stops: the next Tab leaves the row.
  await page.keyboard.press("Tab");
  await expect(row.locator(":focus")).toHaveCount(0);
  await expect(page.locator("body")).not.toBeFocused();
  return count;
}

const recommendations = (page: Page) =>
  page.locator("section").filter({ has: page.getByRole("heading", { name: "You Might Also Like" }) });

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the menu drawer by keyboard", async ({ page }) => {
    await page.goto("/home");
    const drawer = page.getByRole("navigation", { name: "Filter by" });
    await tabTo(page, page.getByRole("button", { name: "Open menu" }));
    await page.keyboard.press("Enter");
    await expect(drawer).toBeVisible();

    // Tab goes into the drawer, its ring in full.
    await page.keyboard.press("Tab");
    await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Home" })).toBeFocused();
    expect(await hiddenRingSides(page)).toEqual([]);

    // Escape closes it and puts focus back on the menu button.
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();

    // Tabbing past the last link closes it too, rather than leaving it
    // open over the page.
    await page.keyboard.press("Enter");
    const lastLink = drawer.getByRole("link").last();
    await tabTo(page, lastLink);
    await page.keyboard.press("Tab");
    await expect(drawer).toBeHidden();
    await expect(page.getByRole("link", { name: "Gayflix home" })).toBeFocused();
    expect(await hiddenRingSides(page)).toEqual([]);
  });

  test.describe("as an admin", () => {
    test.use({ httpCredentials: ADMIN_CREDENTIALS, storageState: ADMIN_STATE });

    test("the admin panel fits, and its menu works by keyboard", async ({ page }) => {
      await page.goto("/admin/library/series");
      // Nothing scrolls the page sideways: the table scrolls on its own,
      // with room for the titles.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect((await page.locator("main tbody a").first().boundingBox())!.width).toBeGreaterThan(100);

      const menu = page.getByRole("navigation", { name: "Admin" });
      const button = page.getByRole("button", { name: "Open menu" });
      await expect(menu).toBeHidden();
      await tabTo(page, button);
      await page.keyboard.press("Enter");
      await page.keyboard.press("Tab");
      await expect(menu.getByRole("link", { name: "Dashboard" })).toBeFocused();
      expect(await hiddenRingSides(page)).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await expect(button).toBeFocused();

      // A link goes there and closes the menu.
      await page.keyboard.press("Enter");
      await tabTo(page, menu.getByRole("link", { name: "Reports" }));
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/admin\/reports$/);
      await expect(menu).toBeHidden();
    });
  });

  test("a title row by keyboard", async ({ page }) => {
    await page.goto("/movie/chosen-family");
    // More cards than fit on the screen.
    expect(await tabThroughRow(page, recommendations(page))).toBeGreaterThan(3);
  });

  test.describe("signed in", () => {
    test.use({ storageState: USER_STATE });

    test("the account links show their whole focus ring", async ({ page }) => {
      await page.goto("/account");
      const links = page.getByRole("navigation", { name: "Account" }).last().getByRole("link");
      for (const name of ["Account", "Favorite", "History", "Setting"]) {
        await tabTo(page, links.filter({ hasText: name }));
        expect(await hiddenRingSides(page)).toEqual([]);
      }
    });
  });
});

test("a title row by keyboard on a wide screen", async ({ page }) => {
  await page.goto("/movie/chosen-family");
  await tabThroughRow(page, recommendations(page));
});

test("search by keyboard", async ({ page }) => {
  await page.goto("/home");
  // The logo is the first stop, with its ring.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Gayflix home" })).toBeFocused();
  expect(await hiddenRingSides(page)).toEqual([]);

  const button = page.getByRole("button", { name: "Search" });
  const input = page.getByPlaceholder("Search titles...");
  await page.keyboard.press("Tab");
  await expect(button).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(input).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(input).toBeHidden();
  await expect(button).toBeFocused();

  // Tab moves through the suggestions; past the last one, the dropdown
  // closes.
  await page.keyboard.press("Enter");
  await expect(input).toBeFocused();
  await page.keyboard.type("brownstone");
  const suggestions = page.getByRole("banner").getByRole("listitem").getByRole("link");
  await expect(suggestions.first()).toHaveAccessibleName(/^The Brownstone/);
  const count = await suggestions.count();
  for (let i = 0; i < count; i++) {
    await page.keyboard.press("Tab");
    await expect(suggestions.nth(i)).toBeFocused();
    expect(await hiddenRingSides(page)).toEqual([]);
  }
  await page.keyboard.press("Tab");
  await expect(input).toBeHidden();
  await expect(page.getByRole("link", { name: "Log in" })).toBeFocused();
});

test("Play keeps focus on the player", async ({ page }) => {
  await page.goto("/watch/chosen-family");
  await tabTo(page, page.getByRole("button", { name: "Play Chosen Family" }));
  expect(await hiddenRingSides(page)).toEqual([]);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Now playing")).toBeFocused();
  expect(await hiddenRingSides(page)).toEqual([]);
});

test("the sign-up terms checkbox shows focus", async ({ page }) => {
  await page.goto("/signup");
  await tabTo(page, page.getByRole("checkbox"));
  expect(await hiddenRingSides(page)).toEqual([]);
});

test.describe("signed in", () => {
  test.use({ storageState: USER_STATE });

  test("the account menu by keyboard", async ({ page }) => {
    await page.goto("/home");
    const button = page.getByRole("button", { name: "Account menu" });
    const myAccount = page.getByRole("link", { name: "My Account" });
    const logOut = page.getByRole("button", { name: "Log Out" });
    await tabTo(page, button);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await expect(myAccount).toBeFocused();
    expect(await hiddenRingSides(page)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(myAccount).toBeHidden();
    await expect(button).toBeFocused();

    // Past the last item, the menu closes.
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(logOut).toBeFocused();
    expect(await hiddenRingSides(page)).toEqual([]);
    await page.keyboard.press("Tab");
    await expect(logOut).toBeHidden();
    await expect(page.locator("body")).not.toBeFocused();
  });
});
