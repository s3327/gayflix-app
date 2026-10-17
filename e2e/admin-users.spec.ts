import type { APIRequestContext, Browser, Page } from "@playwright/test";
import { accounts, ADMIN_STATE, createVerifiedAccount, newAccount, sql, USER_STATE, type Account } from "./accounts";
import { ADMIN_CREDENTIALS, expect, logIn, seriousViolations, signedInPage, test } from "./fixtures";
import { BASE_URL } from "../playwright.config";

/*
 * /admin/users: finding accounts, admin access, bans and signing out.
 * Each test makes its own accounts, so they can run in parallel.
 */

async function userId(email: string) {
  const [row] = await sql<{ id: string }>(`SELECT id FROM "user" WHERE email = $1`, [email]);
  return row.id;
}

async function role(email: string) {
  const [row] = await sql<{ role: string }>(`SELECT role FROM "user" WHERE email = $1`, [email]);
  return row.role;
}

/** A confirmed account, signed in in a browser of its own. */
async function signedInUser(browser: Browser, request: APIRequestContext, label: string) {
  const user = newAccount(label);
  await createVerifiedAccount(request, user);
  return { user, userPage: await signedInPage(browser, user) };
}

/** Is `page` still signed in? /account sends guests to the login page. */
async function expectSignedOut(page: Page) {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login\?next=%2Faccount$/);
}

test.describe("regular users", () => {
  test.use({ httpCredentials: ADMIN_CREDENTIALS, storageState: USER_STATE });

  test("can't reach the Users page", async ({ page }) => {
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/admin\/login(\?.*)?$/);
    await page.goto(`/admin/users/${await userId(accounts().admin.email)}`);
    await expect(page).toHaveURL(/\/admin\/login(\?.*)?$/);
  });
});

test.describe("signed in as an admin", () => {
  test.use({ httpCredentials: ADMIN_CREDENTIALS, storageState: ADMIN_STATE });

  test("finds an account by email and opens it", async ({ page, request }) => {
    const user = newAccount("find");
    await createVerifiedAccount(request, user);

    await page.goto("/admin/users");
    expect(await seriousViolations(page)).toEqual([]);
    await page.getByLabel("Search by name or email").fill(user.email);
    await page.getByRole("button", { name: "Search" }).click();
    const list = page.getByRole("list", { name: "Accounts" });
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await list.getByRole("link", { name: new RegExp(user.email) }).click();

    await expect(page).toHaveURL(new RegExp(`/admin/users/${await userId(user.email)}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(user.name);
    const facts = page.locator("dl");
    await expect(facts).toContainText("Signs in withPassword");
    await expect(facts).toContainText("EmailConfirmed");
    expect(await seriousViolations(page)).toEqual([]);
  });

  test("lists admins and unconfirmed accounts on their own", async ({ page, request }) => {
    const unconfirmed = newAccount("unconfirmed");
    const signUp = await request.post("/api/auth/sign-up/email", { data: unconfirmed, headers: { Origin: BASE_URL } });
    expect(signUp.ok()).toBe(true);

    await page.goto(`/admin/users?show=unconfirmed&q=${encodeURIComponent(unconfirmed.email)}`);
    await expect(page.getByLabel("Show")).toHaveValue("unconfirmed");
    const row = page.getByRole("listitem").filter({ hasText: unconfirmed.email });
    await expect(row).toContainText("Email not confirmed");
    await row.getByRole("link").click();
    // It can't sign in yet, so it can't be made an admin.
    await expect(page.getByText("hasn't confirmed its email yet")).toBeVisible();
    await expect(page.getByRole("button", { name: "Make admin" })).toBeHidden();

    await page.goto(`/admin/users?show=admins&q=${encodeURIComponent(accounts().admin.email)}`);
    await expect(page.getByRole("listitem").filter({ hasText: accounts().admin.email })).toContainText("Admin");
    await page.goto(`/admin/users?show=admins&q=${encodeURIComponent(unconfirmed.email)}`);
    await expect(page.getByText("No accounts match that search.")).toBeVisible();
  });

  test("makes an account an admin and takes it away again", async ({ page, request }) => {
    const user = newAccount("promote");
    await createVerifiedAccount(request, user);
    await page.goto(`/admin/users/${await userId(user.email)}`);

    await page.getByRole("button", { name: "Make admin" }).click();
    const dialog = page.getByRole("dialog", { name: "Make this account an admin?" });
    await expect(dialog).toContainText(user.email);
    await dialog.getByRole("button", { name: "Make admin" }).click();
    await expect(page.getByText("This account can use the admin panel.")).toBeVisible();
    expect(await role(user.email)).toBe("admin");
    // An admin has to lose admin access before a ban.
    await expect(page.getByText("Remove this account's admin access before banning it.")).toBeVisible();

    await page.getByRole("button", { name: "Remove admin access" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove admin access" }).click();
    await expect(page.getByRole("button", { name: "Make admin" })).toBeVisible();
    expect(await role(user.email)).toBe("user");
  });

  test("bans an account, which signs it out and keeps it out until unbanned", async ({
    browser,
    page,
    request,
  }) => {
    const { user, userPage } = await signedInUser(browser, request, "ban");
    await page.goto(`/admin/users/${await userId(user.email)}`);

    await page.getByLabel("How long").selectOption({ label: "7 days" });
    // Enter in the reason field asks first too.
    await page.getByLabel("Reason").fill("e2e: spam in reports");
    await page.getByLabel("Reason").press("Enter");
    const dialog = page.getByRole("dialog", { name: "Ban this account?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("region", { name: "Ban" })).toContainText("Banning signs the account out everywhere");
    await page.getByRole("button", { name: "Ban", exact: true }).click();
    await expect(dialog).toContainText(user.email);
    await dialog.getByRole("button", { name: "Ban" }).click();
    const ban = page.getByRole("region", { name: "Ban" });
    await expect(ban).toContainText(/Banned until .+ UTC\./);
    await expect(ban).toContainText("Reason: e2e: spam in reports");
    await expect(page.getByRole("heading", { level: 1 }).locator("..")).toContainText("Banned");
    expect(await seriousViolations(page)).toEqual([]);

    await expectSignedOut(userPage);
    await tryLogIn(userPage, user);
    await expect(userPage.locator("main").getByRole("alert")).toHaveText("This account has been banned.");

    await page.getByRole("button", { name: "Unban" }).click();
    await expect(ban).toContainText("Banning signs the account out everywhere");
    await tryLogIn(userPage, user);
    await expect(userPage).toHaveURL(/\/account$/);
  });

  test("signs an account out everywhere", async ({ browser, page, request }) => {
    const { user, userPage } = await signedInUser(browser, request, "signout");
    await page.goto(`/admin/users/${await userId(user.email)}`);
    await page.getByRole("button", { name: "Sign out everywhere" }).click();
    const dialog = page.getByRole("dialog", { name: "Sign out everywhere?" });
    await dialog.getByRole("button", { name: "Sign out everywhere" }).click();
    await expect(page.getByText("Not signed in anywhere.")).toBeVisible();
    await expectSignedOut(userPage);
    // It can sign straight back in.
    await tryLogIn(userPage, user);
    await expect(userPage).toHaveURL(/\/account$/);
  });

  test("an admin can't change their own account", async ({ page }) => {
    await page.goto(`/admin/users/${await userId(accounts().admin.email)}`);
    await expect(page.getByText("This is your account.")).toBeVisible();
    for (const name of ["Make admin", "Remove admin access", "Ban", "Sign out everywhere"]) {
      await expect(page.getByRole("button", { name, exact: true })).toBeHidden();
    }
    // The sidebar still shows where this page belongs.
    await expect(page.locator("aside").getByRole("link", { name: "Users" })).toHaveClass(/text-ink-brand/);
  });

  test("an account that doesn't exist says so", async ({ page }) => {
    await page.goto("/admin/users/NoSuchAccountNoSuchAccount00");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("No such account");
  });
});

/** The public login form, from a signed-out page. */
async function tryLogIn(page: Page, account: Account) {
  await page.context().clearCookies();
  await logIn(page, account);
}
