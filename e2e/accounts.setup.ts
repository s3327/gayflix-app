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
  saveAccount,
  setUpTwoFactor,
} from "./accounts";

// The user first: the admin step needs the folder, and a failed user
// step skips it.
setup.describe.configure({ mode: "serial" });

setup("create a verified user", async ({ browser, request }) => {
  mkdirSync(".playwright", { recursive: true });
  const user = newAccount("user");
  await createVerifiedAccount(request, user);

  // Log in through the real form and keep the session cookie.
  const userContext = await browser.newContext();
  const userPage = await userContext.newPage();
  await logIn(userPage, user);
  await expect(userPage).toHaveURL(/\/account$/);
  await userContext.storageState({ path: USER_STATE });
  await userContext.close();

  saveAccount("user", user);
});

setup("create an admin", async ({ browser, request }) => {
  const admin = newAccount("admin");
  await createVerifiedAccount(request, admin);
  await grantAdmin(admin.email);

  // The admin goes through two-factor setup on first login.
  const adminContext = await browser.newContext({ httpCredentials: ADMIN_CREDENTIALS });
  const adminPage = await adminContext.newPage();
  await adminPasswordStep(adminPage, admin);
  await setUpTwoFactor(adminPage, admin);
  await adminContext.storageState({ path: ADMIN_STATE });
  await adminContext.close();

  saveAccount("admin", admin);
});
