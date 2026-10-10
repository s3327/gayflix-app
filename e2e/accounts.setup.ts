import { mkdirSync } from "node:fs";
import { test as setup, expect } from "@playwright/test";
import { ADMIN_CREDENTIALS, logIn } from "./fixtures";
import {
  ADMIN_STATE,
  USER_STATE,
  adminPasswordStep,
  createVerifiedAccount,
  grantAdmin,
  newAccount,
  saveAccounts,
  setUpTwoFactor,
} from "./accounts";

setup("create a verified user and an admin", async ({ browser, request }) => {
  mkdirSync(".playwright", { recursive: true });
  const user = newAccount("user");
  const admin = newAccount("admin");
  await createVerifiedAccount(request, user);
  await createVerifiedAccount(request, admin);
  await grantAdmin(admin.email);

  // Log each one in through the real form and keep the session cookie.
  const userContext = await browser.newContext();
  const userPage = await userContext.newPage();
  await logIn(userPage, user);
  await expect(userPage).toHaveURL(/\/account$/);
  await userContext.storageState({ path: USER_STATE });
  await userContext.close();

  // The admin goes through two-factor setup on first login.
  const adminContext = await browser.newContext({ httpCredentials: ADMIN_CREDENTIALS });
  const adminPage = await adminContext.newPage();
  await adminPasswordStep(adminPage, admin);
  await setUpTwoFactor(adminPage, admin);
  await adminContext.storageState({ path: ADMIN_STATE });
  await adminContext.close();

  saveAccounts({ user, admin });
});
