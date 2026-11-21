import { randomUUID } from "node:crypto";
import type { Insertable, Kysely } from "kysely";
import { sql } from "kysely";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DB, Media } from "./db-types";
import {
  FAIL_SAFE_SETTINGS,
  getSiteSettings,
  isDonationEnabled,
  isRegistrationOpen,
  readSiteSettings,
  updateSiteSettings,
} from "./site-settings";
import {
  getSystemHealth,
  listJobRuns,
  pruneActivityLogs,
  publishScheduled,
  purgeTrash,
  runTrashPurgeJob,
} from "./scheduled-jobs";
import {
  getEntityActivity,
  listActivityLogs,
  logActivity,
} from "./activity-logger";
import { withRollback } from "@/test/database";

let mockAdminSession: { user: { id: string; email: string; role?: string | null } } | null = null;

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(async () => mockAdminSession),
  requireAdmin: vi.fn(async () => mockAdminSession),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/safe-url", () => ({
  isPublicHttpsUrl: vi.fn((url: string) => url.startsWith("https://") && !url.includes("127.0.0.1")),
  postJsonToPublicUrl: vi.fn(async () => {}),
}));

async function createTestUser(
  executor: Kysely<DB>,
  email = `test-${randomUUID()}@gayflix.test`
): Promise<string> {
  const id = randomUUID();
  await sql`
    INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at, created_at)
    VALUES (${id}::uuid, ${email}, ${JSON.stringify({})}::jsonb, now(), now())
  `.execute(executor);
  return id;
}

async function createMedia(
  executor: Kysely<DB>,
  id = `media-${randomUUID().slice(0, 8)}`,
  overrides: Partial<Insertable<Media>> = {}
): Promise<string> {
  await executor
    .insertInto("media")
    .values({
      id,
      title: `Test Media ${id}`,
      type: "movie",
      year: 2024,
      duration: "1h 30m",
      country: "US",
      language: "en",
      posterUrl: "https://example.com/poster.jpg",
      status: "published",
      genres: ["Drama"],
      cast: ["Actor A"],
      tags: ["tag1"],
      ...overrides,
    })
    .execute();
  return id;
}

describe("jobs and settings integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminSession = null;
  });

  describe("scheduled jobs", () => {
    it("purge-trash deletes only rows past the window", async () => {
      await withRollback(async (trx) => {
        // 1. Expired trashed row (> 30 days)
        const expiredId = `expired-${randomUUID().slice(0, 8)}`;
        const thirtyFiveDaysAgo = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
        await createMedia(trx, expiredId, {
          trashedAt: thirtyFiveDaysAgo,
          status: "draft",
        });

        // 2. Recent trashed row (<= 30 days)
        const recentId = `recent-${randomUUID().slice(0, 8)}`;
        const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
        await createMedia(trx, recentId, {
          trashedAt: fiveDaysAgo,
          status: "draft",
        });

        // 3. Active row (not trashed)
        const activeId = `active-${randomUUID().slice(0, 8)}`;
        await createMedia(trx, activeId, {
          trashedAt: null,
          status: "published",
        });

        // Run purgeTrash
        const run = await purgeTrash("test-suite", trx);
        expect(run.status).toBe("success");
        expect(run.jobName).toBe("purge_trash");
        expect(run.itemsCount).toBeGreaterThanOrEqual(1);

        // Confirm only expired row was deleted
        const checkExpired = await trx
          .selectFrom("media")
          .select("id")
          .where("id", "=", expiredId)
          .executeTakeFirst();
        expect(checkExpired).toBeUndefined();

        const checkRecent = await trx
          .selectFrom("media")
          .select("id")
          .where("id", "=", recentId)
          .executeTakeFirst();
        expect(checkRecent).toBeDefined();

        const checkActive = await trx
          .selectFrom("media")
          .select("id")
          .where("id", "=", activeId)
          .executeTakeFirst();
        expect(checkActive).toBeDefined();

        // Also check scheduled_job_run was inserted
        const runRecord = await trx
          .selectFrom("scheduled_job_run")
          .selectAll()
          .where("id", "=", run.id)
          .executeTakeFirst();
        expect(runRecord).toBeDefined();
        expect(runRecord?.status).toBe("success");
      });
    });

    it("publishScheduled publishes due titles and leaves future drafts untouched", async () => {
      await withRollback(async (trx) => {
        const pastDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hr ago
        const futureDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hr ahead

        const dueId = `due-${randomUUID().slice(0, 8)}`;
        await createMedia(trx, dueId, {
          status: "draft",
          publishAt: pastDate,
          publishedAt: null,
          trashedAt: null,
        });

        const futureId = `future-${randomUUID().slice(0, 8)}`;
        await createMedia(trx, futureId, {
          status: "draft",
          publishAt: futureDate,
          publishedAt: null,
          trashedAt: null,
        });

        const run = await publishScheduled("test-suite", trx);
        expect(run.status).toBe("success");
        expect(run.itemsCount).toBeGreaterThanOrEqual(1);

        const dueRow = await trx
          .selectFrom("media")
          .select(["status", "publishAt", "publishedAt"])
          .where("id", "=", dueId)
          .executeTakeFirst();
        expect(dueRow?.status).toBe("published");
        expect(dueRow?.publishAt).toBeNull();
        expect(dueRow?.publishedAt).toBeDefined();

        const futureRow = await trx
          .selectFrom("media")
          .select(["status", "publishAt", "publishedAt"])
          .where("id", "=", futureId)
          .executeTakeFirst();
        expect(futureRow?.status).toBe("draft");
        expect(futureRow?.publishAt).toBeDefined();
      });
    });

    it("getSystemHealth measures latency and aggregates database counts", async () => {
      await withRollback(async (trx) => {
        const health = await getSystemHealth(trx);
        expect(health.dbStatus).toBe("healthy");
        expect(health.dbLatencyMs).toBeGreaterThanOrEqual(0);
        expect(typeof health.totalMedia).toBe("number");
        expect(typeof health.totalReports).toBe("number");
      });
    });

    it("listJobRuns retrieves scheduled job runs", async () => {
      await withRollback(async (trx) => {
        await runTrashPurgeJob("test-audit", trx);
        const runs = await listJobRuns(10, trx);
        expect(runs.length).toBeGreaterThanOrEqual(1);
        expect(runs[0].jobName).toBeDefined();
      });
    });
  });

  describe("site settings", () => {
    it("settings fall back to FAIL_SAFE_SETTINGS on error", async () => {
      const failingExecutor = {
        selectFrom: () => {
          throw new Error("Simulated database failure");
        },
      } as unknown as Kysely<DB>;

      // readSiteSettings throws on database failure
      await expect(readSiteSettings(failingExecutor)).rejects.toThrow("Simulated database failure");

      // getSiteSettings catches the failure and returns FAIL_SAFE_SETTINGS
      const settings = await getSiteSettings(failingExecutor);
      expect(settings).toEqual(FAIL_SAFE_SETTINGS);
      expect(settings.maintenanceMode).toBe(true);
      expect(settings.registrationOpen).toBe(false);
      expect(settings.donationEnabled).toBe(false);

      // isRegistrationOpen and isDonationEnabled fall back safely
      expect(await isRegistrationOpen(failingExecutor)).toBe(false);
      expect(await isDonationEnabled(failingExecutor)).toBe(false);
    });

    it("reads and updates site settings via upsert", async () => {
      await withRollback(async (trx) => {
        const adminId = await createTestUser(trx, "admin@gayflix.test");
        mockAdminSession = {
          user: { id: adminId, email: "admin@gayflix.test", role: "admin" },
        };

        const initial = await readSiteSettings(trx);
        expect(initial.id).toBe("default");

        const updateRes = await updateSiteSettings(
          {
            siteTitle: "Gayflix Integration",
            tagline: "Custom Queer Cinema",
            defaultPageSize: 36,
            shortFilmCutoffMinutes: 45,
            maintenanceMode: false,
            registrationOpen: true,
            donationEnabled: true,
          },
          trx
        );

        expect(updateRes.ok).toBe(true);

        const updated = await readSiteSettings(trx);
        expect(updated.siteTitle).toBe("Gayflix Integration");
        expect(updated.tagline).toBe("Custom Queer Cinema");
        expect(updated.defaultPageSize).toBe(36);
        expect(updated.shortFilmCutoffMinutes).toBe(45);
        expect(updated.maintenanceMode).toBe(false);
        expect(updated.registrationOpen).toBe(true);
        expect(updated.donationEnabled).toBe(true);

        // Verify helper functions
        expect(await isRegistrationOpen(trx)).toBe(true);
        expect(await isDonationEnabled(trx)).toBe(true);
      });
    });
  });

  describe("activity logger", () => {
    it("logs activity, queries with filters, and prunes old logs", async () => {
      await withRollback(async (trx) => {
        const actorId = await createTestUser(trx);
        const testEmail = `admin-${randomUUID().slice(0, 6)}@gayflix.test`;

        await logActivity(
          {
            actorId,
            actorEmail: testEmail,
            actorRole: "admin",
            action: "setting.update",
            entityType: "setting",
            entityId: "default",
            summary: "Integration test log",
            details: { test: true },
          },
          trx
        );

        const result = await listActivityLogs(
          {
            actor: testEmail,
            action: "setting.update",
            entityType: "setting",
          },
          trx
        );

        expect(result.total).toBe(1);
        expect(result.items.length).toBe(1);
        expect(result.items[0].actorEmail).toBe(testEmail);
        expect(result.items[0].summary).toBe("Integration test log");

        const entityLogs = await getEntityActivity("setting", "default", 10, trx);
        expect(entityLogs.some((l) => l.actorEmail === testEmail)).toBe(true);

        // Test pruneActivityLogs
        const pruneRun = await pruneActivityLogs(90, "test-suite", trx);
        expect(pruneRun.status).toBe("success");
      });
    });
  });
});
