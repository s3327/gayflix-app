import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

// The tests and the server share one environment: DATABASE_URL and
// BETTER_AUTH_SECRET come from the shell (CI) or .env.local (locally).
loadEnvConfig(process.cwd());

const PORT = 3100;
export const BASE_URL = `http://localhost:${PORT}`;
/** e2e/source-stub.mjs: TMDB and OMDb as the Import page's tests need them. */
const SOURCE_STUB = "http://127.0.0.1:3101";
/**
 * e2e/report-stub.mjs: Sentry, receiving crash reports. The DSN is fixed
 * at build time, so CI builds with NEXT_PUBLIC_SENTRY_DSN pointing here
 * (http://e2e@127.0.0.1:3102/1); error-reporting.spec.ts is skipped
 * without it.
 */
export const REPORT_STUB = "http://127.0.0.1:3102";
/** e2e/blob-stub.mjs: Vercel Blob, keeping uploaded posters. */
export const BLOB_STUB = "http://127.0.0.1:3103";
/** Emails the server "sends" during the run; the tests read codes from it. */
export const OUTBOX_FILE = ".playwright/outbox.jsonl";

/**
 * End-to-end tests against a production build (`npm run build` first)
 * and a real Postgres database (`npm run db:deploy` first).
 *
 * The "setup" project creates a verified user and an admin through the
 * real sign-up flow and saves their sessions; the other tests reuse them.
 * It also gives the seed titles the tests play a video source. The admin
 * password below only exists for this test server.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // CI's runners have two cores, where Playwright's default (half the
  // cores) runs one test at a time. Two at a time finish a shard about a
  // fifth sooner.
  workers: process.env.CI ? 2 : undefined,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /\.setup\.ts$/ },
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
      command: "node e2e/report-stub.mjs 3102",
      url: `${REPORT_STUB}/health`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "node e2e/blob-stub.mjs 3103",
      url: `${BLOB_STUB}/health`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npx next start -p ${PORT}`,
      url: `${BASE_URL}/home`,
      reuseExistingServer: !process.env.CI,
      env: {
        ADMIN_BASIC_AUTH_USER: "e2e-admin",
        ADMIN_BASIC_AUTH_PASSWORD: "e2e-password",
        CRON_SECRET: "e2e-cron-secret",
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
        // Where video sources may come from (e2e/admin-video.spec.ts,
        // e2e/catalog.setup.ts and e2e/player.spec.ts).
        VIDEO_HOSTS: "player.e2e.example,*.cdn.e2e.example",
        // Uploads on, kept by the stand-in store. Its images don't exist,
        // so they don't load; the tests check what was stored instead.
        BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_e2estore_e2esecret",
        VERCEL_BLOB_API_URL: BLOB_STUB,
      },
    },
  ],
});
