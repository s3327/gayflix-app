import { readFile } from "node:fs/promises";
import { createVerifiedAccount, newAccount } from "./accounts";
import { expect, guestPage, signedInPage, test } from "./fixtures";

/*
 * "Download my data" (A15): Account → Setting downloads one JSON file
 * with what the account holds, and never its secrets. Guests get nothing.
 */

test("a member downloads their data from Setting", async ({ browser, request }) => {
  const account = newAccount("export");
  await createVerifiedAccount(request, account);
  const page = await signedInPage(browser, account);

  // Something to find in it: a favorite and a nickname.
  await page.goto("/movie/chosen-family");
  await page.getByRole("region", { name: "Chosen Family" }).getByRole("button", { name: "Add to Favorites" }).click();
  await expect(page.getByText("Added to Favorites")).toBeVisible();
  const nickname = `Exporter${Math.random().toString(36).slice(2, 8)}`;
  await page.goto("/account/setting");
  await page.getByRole("region", { name: "Nickname" }).getByLabel("Nickname").fill(nickname);
  await page.getByRole("button", { name: "Save Nickname" }).click();
  await expect(page.getByText("Nickname saved")).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download My Data" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^gayflix-data-\d{4}-\d{2}-\d{2}\.json$/);
  const text = await readFile((await file.path())!, "utf8");
  const data = JSON.parse(text);
  expect(data.account.email).toBe(account.email);
  expect(data.nickname.nickname).toBe(nickname);
  expect(data.favorites.map((favorite: { title: { id: string } }) => favorite.title.id)).toEqual(["chosen-family"]);
  expect(data.signedInDevices.length).toBeGreaterThan(0);
  // No secrets: not the password, nor any session token.
  expect(text).not.toContain(account.password);
  expect(text).not.toMatch(/"token"|"password"|"secret"|backupCodes/i);

  const guest = await guestPage(browser);
  const response = await guest.request.get("/api/account/export");
  expect(response.status()).toBe(401);
});
