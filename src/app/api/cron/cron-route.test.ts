import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./[job]/route";

vi.mock("@/lib/scheduled-jobs", () => ({
  runTrashPurgeJob: vi.fn(),
  runPublishDueJob: vi.fn(),
  runOrphanImageCleanupJob: vi.fn(),
}));

import {
  runTrashPurgeJob,
  runPublishDueJob,
  runOrphanImageCleanupJob,
} from "@/lib/scheduled-jobs";

const mockPurge = vi.mocked(runTrashPurgeJob);
const mockPublish = vi.mocked(runPublishDueJob);
const mockOrphan = vi.mocked(runOrphanImageCleanupJob);

describe("GET /api/cron/[job]", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret-12345";
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  it("returns 401 if authorization header is missing", async () => {
    const req = new Request("http://localhost:3000/api/cron/purge-trash");
    const res = await GET(req, { params: Promise.resolve({ job: "purge-trash" }) });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 if authorization token is incorrect", async () => {
    const req = new Request("http://localhost:3000/api/cron/purge-trash", {
      headers: { authorization: "Bearer wrong-secret" },
    });
    const res = await GET(req, { params: Promise.resolve({ job: "purge-trash" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown job", async () => {
    const req = new Request("http://localhost:3000/api/cron/unknown-job", {
      headers: { authorization: "Bearer test-cron-secret-12345" },
    });
    const res = await GET(req, { params: Promise.resolve({ job: "unknown-job" }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("Unknown job");
  });

  it("executes purge-trash successfully with valid secret", async () => {
    mockPurge.mockResolvedValueOnce({
      id: "run-1",
      jobName: "purge_trash",
      status: "success",
      itemsCount: 5,
      details: "Purged 5 expired titles.",
      durationMs: 120,
      triggeredBy: "cron",
      startedAt: new Date(),
      finishedAt: new Date(),
    });

    const req = new Request("http://localhost:3000/api/cron/purge-trash", {
      headers: { authorization: "Bearer test-cron-secret-12345" },
    });
    const res = await GET(req, { params: Promise.resolve({ job: "purge-trash" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.job).toBe("purge-trash");
    expect(mockPurge).toHaveBeenCalledWith("cron");
  });

  it("executes publish-due successfully with valid secret", async () => {
    mockPublish.mockResolvedValueOnce({
      id: "run-2",
      jobName: "publish_due",
      status: "success",
      itemsCount: 2,
      details: "Auto-published 2 scheduled titles.",
      durationMs: 80,
      triggeredBy: "cron",
      startedAt: new Date(),
      finishedAt: new Date(),
    });

    const req = new Request("http://localhost:3000/api/cron/publish-due", {
      headers: { authorization: "Bearer test-cron-secret-12345" },
    });
    const res = await GET(req, { params: Promise.resolve({ job: "publish-due" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.job).toBe("publish-due");
    expect(mockPublish).toHaveBeenCalledWith("cron");
  });

  it("executes clean-orphans successfully with valid secret", async () => {
    mockOrphan.mockResolvedValueOnce({
      id: "run-3",
      jobName: "clean_orphans",
      status: "skipped",
      itemsCount: 0,
      details: "Scan skipped: blob scanning requires dedicated background worker.",
      durationMs: 10,
      triggeredBy: "cron",
      startedAt: new Date(),
      finishedAt: new Date(),
    });

    const req = new Request("http://localhost:3000/api/cron/clean-orphans", {
      headers: { authorization: "Bearer test-cron-secret-12345" },
    });
    const res = await GET(req, { params: Promise.resolve({ job: "clean-orphans" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.job).toBe("clean-orphans");
    expect(mockOrphan).toHaveBeenCalledWith("cron");
  });

  it("returns 500 when job execution throws", async () => {
    mockPurge.mockRejectedValueOnce(new Error("Database connection lost"));

    const req = new Request("http://localhost:3000/api/cron/purge-trash", {
      headers: { authorization: "Bearer test-cron-secret-12345" },
    });
    const res = await GET(req, { params: Promise.resolve({ job: "purge-trash" }) });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Database connection lost");
  });
});
