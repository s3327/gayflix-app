import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

// The tests and the server share one environment: DATABASE_URL and
// BETTER_AUTH_SECRET come from the shell (CI) or .env.local (locally).
loadEnvConfig(process.cwd());

const PORT = 3100;
export const BASE_URL = `http://localhost:${PORT}`;
/** e2e/source-stub.mjs: TMDB and OMDb as the Import page's tests need them. */
const SOURCE_STUB = "http://127.0.0.1:3101";
/** Emails the server "sends" during the run; the tests read codes from it. */
export const OUTBOX_FILE = ".playwright/outbox.jsonl";

/**
 * End-to-end tests against a production build (`npm run build` first)
 * and a real Postgres database (`npm run db:deploy` first).
 *
 * The "setup" project creates a verified user and an admin through the
 * real sign-up flow and saves their sessions; the other tests reuse them.
 * The admin password below only exists for this test server.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /accounts\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
  webServer: [
    {
      command: "node e2e/source-stub.mjs 3101",
      url: `${SOURCE_STUB}/health`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npx next start -p ${PORT}`,
      url: `${BASE_URL}/home`,
      reuseExistingServer: !process.env.CI,
      env: {
        ADMIN_BASIC_AUTH_USER: "e2e-admin",
        ADMIN_BASIC_AUTH_PASSWORD: "e2e-password",
        BETTER_AUTH_URL: BASE_URL,
        EMAIL_OUTBOX_FILE: OUTBOX_FILE,
        // Every test signs in from 127.0.0.1; rate limits would trip.
        AUTH_RATE_LIMIT: "off",
        TMDB_API_BASE: `${SOURCE_STUB}/tmdb/3`,
        OMDB_API_BASE: `${SOURCE_STUB}/omdb/`,
        TMDB_API_KEY: "e2e-tmdb-key",
        OMDB_API_KEY: "e2e-omdb-key",
        // Imported posters' host. The build needs it too for next/image
        // (CI sets it); without it the posters just don't load.
        IMAGE_HOSTS: "image.tmdb.org",
      },
    },
  ],
});
