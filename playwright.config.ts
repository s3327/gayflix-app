import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

/**
 * End-to-end tests against a production build (`npm run build` first).
 * The admin password below only exists for this test server.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/home`,
    reuseExistingServer: !process.env.CI,
    env: {
      ADMIN_BASIC_AUTH_USER: "e2e-admin",
      ADMIN_BASIC_AUTH_PASSWORD: "e2e-password",
    },
  },
});
