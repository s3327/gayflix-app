import { beforeEach, describe, expect, it, vi } from "vitest";
import { backfillShortFilmCategories } from "./category-backfill";

const mockRequireAdmin = vi.fn();
const mockGetSiteSettings = vi.fn();
const mockExecuteTakeFirst = vi.fn();
const mockWhere = vi.fn();
const mockSet = vi.fn();
const mockUpdateTable = vi.fn();

vi.mock("@/lib/session", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/lib/site-settings", () => ({
  getSiteSettings: () => mockGetSiteSettings(),
}));

vi.mock("@/lib/database", () => {
  const whereChain: Record<string, unknown> = {};
  whereChain.where = (...args: unknown[]) => {
    mockWhere(...args);
    return whereChain;
  };
  whereChain.executeTakeFirst = (...args: unknown[]) => mockExecuteTakeFirst(...args);

  return {
    database: {
      updateTable: (...args: unknown[]) => {
        mockUpdateTable(...args);
        return {
          set: (...setArgs: unknown[]) => {
            mockSet(...setArgs);
            return whereChain;
          },
        };
      },
    },
  };
});

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
    mockExecuteTakeFirst.mockResolvedValue({ numUpdatedRows: BigInt(5) });
  });

  it("updates movies with runtime <= cutoff having no category", async () => {
    const res = await backfillShortFilmCategories();
    expect(res.ok).toBe(true);
    expect(res.updated).toBe(5);
    expect(mockUpdateTable).toHaveBeenCalledWith("media");
    expect(mockSet).toHaveBeenCalledWith({ category: "Short Film" });
    expect(mockWhere).toHaveBeenCalledWith("type", "=", "movie");
    expect(mockWhere).toHaveBeenCalledWith("runtimeMinutes", ">", 0);
    expect(mockWhere).toHaveBeenCalledWith("runtimeMinutes", "<=", 40);
    expect(mockWhere).toHaveBeenCalledWith("category", "is", null);
  });

  it("allows custom cutoff parameter", async () => {
    const res = await backfillShortFilmCategories(30);
    expect(res.ok).toBe(true);
    expect(mockUpdateTable).toHaveBeenCalledWith("media");
    expect(mockSet).toHaveBeenCalledWith({ category: "Short Film" });
    expect(mockWhere).toHaveBeenCalledWith("runtimeMinutes", "<=", 30);
  });
});
