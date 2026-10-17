import {
  USER_STATE,
  accounts,
  codeFrom,
  createVerifiedAccount,
  newAccount,
  sql,
  waitForEmail,
} from "./accounts";
import { expect, seriousViolations, signedInPage, test } from "./fixtures";

/*
 * Getting into an account without losing your place: logging in or
 * signing up comes back to the page it started from (?next=), whichever
 * way the visitor goes.
 */

test("logging in from a page comes back to it", async ({ page, consoleProblems }) => {
  void consoleProblems;
  await page.goto("/browse?genre=Drama");
  await page.getByRole("banner").getByRole("link", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fbrowse%3Fgenre%3DDrama$/);

  // Over to sign up and back keeps it.
  await page.locator("main").getByRole("link", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/signup\?next=%2Fbrowse%3Fgenre%3DDrama$/);
  await page.locator("main").getByRole("link", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fbrowse%3Fgenre%3DDrama$/);

  const { user } = accounts();
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Log In" }).click();
  await expect(page).toHaveURL(/\/browse\?genre=Drama$/);
});

test("a guest's favorite leads through sign-up and back to the title", async ({
  page,
  consoleProblems,
}) => {
  void consoleProblems;
  const account = newAccount("journey");
  await page.goto("/movie/chosen-family");
  await page.getByRole("button", { name: "Add to Favorites" }).click();
  const dialog = page.getByRole("dialog", { name: "Log in to save favorites" });
  await expect(dialog).toContainText("you'll come right back to Chosen Family.");
  await expect(dialog.getByRole("link", { name: "Log in" })).toHaveAttribute(
    "href",
    "/login?next=%2Fmovie%2Fchosen-family"
  );
  expect(await seriousViolations(page)).toEqual([]);

  await dialog.getByRole("link", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/signup\?next=%2Fmovie%2Fchosen-family$/);
  const since = Date.now();
  await page.getByLabel("Name").fill(account.name);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Sign Up" }).click();
  await expect(page).toHaveURL(/\/verify-email\?email=.+&next=%2Fmovie%2Fchosen-family$/);
  await expect(page.getByRole("link", { name: "Back to login" })).toHaveAttribute(
    "href",
    "/login?next=%2Fmovie%2Fchosen-family"
  );

  const code = codeFrom(await waitForEmail(account.email, since));
  await page.getByLabel("Digit 1 of 6").fill(code);
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/movie\/chosen-family$/);
  await page.getByRole("button", { name: "Add to Favorites" }).click();
  await expect(page.getByRole("button", { name: "Remove from Favorites" })).toBeVisible();
});

test("Clear All asks before emptying the history", async ({ browser, request }) => {
  const account = newAccount("clear");
  await createVerifiedAccount(request, account);
  await sql(
    `INSERT INTO watch_history ("userId", "mediaId", entry, "watchedAt")
     SELECT id, 'chosen-family', $2::jsonb, now() FROM "user" WHERE email = $1`,
    [
      account.email,
      JSON.stringify({
        id: "chosen-family",
        title: "Chosen Family",
        year: 2025,
        duration: "1h 52m",
        type: "movie",
        genre: "Drama",
      }),
    ]
  );
  const page = await signedInPage(browser, account);
  await page.goto("/account/history");
  const main = page.locator("main");
  const card = main.locator('a[href="/movie/chosen-family"]');
  await expect(card).toBeVisible();

  await main.getByRole("button", { name: "Clear All" }).click();
  const dialog = page.getByRole("dialog", { name: "Clear your history?" });
  await expect(dialog).toContainText("All 1 title is removed from History and Continue Watching.");
  expect(await seriousViolations(page)).toEqual([]);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(card).toBeVisible();

  await main.getByRole("button", { name: "Clear All" }).click();
  await dialog.getByRole("button", { name: "Clear All" }).click();
  await expect(main.getByText("No watch history yet")).toBeVisible();
});

test.describe("signed in", () => {
  test.use({ storageState: USER_STATE });

  test("members who open log in or sign up go straight on", async ({ page }) => {
    await page.goto("/login?next=%2Fseries%2Fthe-brownstone");
    await expect(page).toHaveURL(/\/series\/the-brownstone$/);
    await page.goto("/signup");
    await expect(page).toHaveURL(/\/home$/);
    await page.goto("/login?next=https%3A%2F%2Fevil.example%2F");
    await expect(page).toHaveURL(/\/home$/);
  });
});
