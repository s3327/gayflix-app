import { beforeEach, describe, expect, it, vi } from "vitest";
import { backfillShortFilmCategories } from "./category-backfill";

const mockRequireAdmin = vi.fn();
const mockUpdateMany = vi.fn();
const mockGetSiteSettings = vi.fn();

vi.mock("@/lib/session", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/lib/site-settings", () => ({
  getSiteSettings: () => mockGetSiteSettings(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    media: {
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
  },
}));

vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

describe("backfillShortFilmCategories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({
      user: { id: "admin-1", email: "admin@gayflix.com", role: "admin" },
    });
    mockGetSiteSettings.mockResolvedValue({
      shortFilmCutoffMinutes: 40,
    });
    mockUpdateMany.mockResolvedValue({ count: 5 });
  });

  it("updates movies with runtime <= cutoff having no category", async () => {
    const res = await backfillShortFilmCategories();
    expect(res.ok).toBe(true);
    expect(res.updated).toBe(5);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: {
        type: "movie",
        runtimeMinutes: { gt: 0, lte: 40 },
        category: null,
      },
      data: {
        category: "Short Film",
      },
    });
  });

  it("allows custom cutoff parameter", async () => {
    const res = await backfillShortFilmCategories(30);
    expect(res.ok).toBe(true);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: {
        type: "movie",
        runtimeMinutes: { gt: 0, lte: 30 },
        category: null,
      },
      data: {
        category: "Short Film",
      },
    });
  });
});
