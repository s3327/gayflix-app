import { USER_STATE } from "./accounts";
import { expect, test } from "./fixtures";

/*
 * Every public page has to work on a phone, a tablet and a desktop: no
 * sideways scrolling, and the navigation either fits on one line or
 * folds into the menu button. Screen sizes: an iPhone 14, an iPad in
 * portrait, and a laptop/desktop.
 */

const SCREENS = {
  phone: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
};

const PAGES = [
  "/",
  "/home",
  "/trending",
  "/browse",
  "/genre?genre=Drama",
  "/search?q=drama",
  "/movie/chosen-family",
  "/series/the-brownstone",
  "/watch/chosen-family",
  "/episode/the-brownstone-season-1-episode-1",
  "/login",
  "/signup",
  "/terms",
];

/** How far the page, and the nav strip if it's showing, run past the screen's edge. */
async function overflow(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const strip = document.querySelector<HTMLElement>('nav[aria-label="Primary"]');
    const stripShown = strip !== null && strip.getClientRects().length > 0;
    return {
      page: doc.scrollWidth - doc.clientWidth,
      nav: stripShown ? strip.scrollWidth - strip.clientWidth : 0,
    };
  });
}

for (const [name, viewport] of Object.entries(SCREENS)) {
  test.describe(`on a ${name}`, () => {
    test.use({ viewport });

    test("public pages fit the screen", async ({ page }) => {
      for (const path of PAGES) {
        await page.goto(path);
        expect(await overflow(page), path).toEqual({ page: 0, nav: 0 });
      }
    });

    test.describe("signed in", () => {
      test.use({ storageState: USER_STATE });

      test("account pages fit the screen", async ({ page }) => {
        for (const path of ["/account", "/account/favorite", "/account/history", "/account/setting"]) {
          await page.goto(path);
          expect(await overflow(page), path).toEqual({ page: 0, nav: 0 });
          // Every account tab is on screen, none scrolled out of view.
          for (const link of await page
            .getByRole("navigation", { name: "Account" })
            .last()
            .getByRole("link")
            .all()) {
            await expect(link).toBeInViewport({ ratio: 1 });
          }
        }
      });
    });
  });
}
