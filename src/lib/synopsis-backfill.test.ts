import { beforeEach, describe, expect, it, vi } from "vitest";
import { backfillCleanSynopses } from "./synopsis-backfill";

let mockRole = "admin";

vi.mock("@/lib/session", () => ({
  requireAdmin: vi.fn(async () => ({
    user: { id: "test-admin", email: "admin@gayflix.test", role: mockRole },
  })),
}));

const mockMediaFindMany = vi.fn();
const mockMediaUpdate = vi.fn();
const mockEpisodeFindMany = vi.fn();
const mockEpisodeUpdate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    media: {
      findMany: (...args: unknown[]) => mockMediaFindMany(...args),
      update: (...args: unknown[]) => mockMediaUpdate(...args),
    },
    episode: {
      findMany: (...args: unknown[]) => mockEpisodeFindMany(...args),
      update: (...args: unknown[]) => mockEpisodeUpdate(...args),
    },
  },
}));

describe("backfillCleanSynopses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRole = "admin";
  });

  it("refuses unauthorized roles", async () => {
    mockRole = "member";
    const res = await backfillCleanSynopses();
    expect(res.ok).toBe(false);
    expect(mockMediaFindMany).not.toHaveBeenCalled();
  });

  it("strips HTML from media and episode synopses and updates changed rows", async () => {
    mockMediaFindMany.mockResolvedValueOnce([
      { id: "m1", synopsis: "<p>Hello <strong>World</strong></p>" },
      { id: "m2", synopsis: "Already clean" },
    ]);
    mockEpisodeFindMany.mockResolvedValueOnce([
      { id: "e1", synopsis: "Episode with &amp; &nbsp; entities" },
      { id: "e2", synopsis: null },
    ]);

    const res = await backfillCleanSynopses();
    expect(res.ok).toBe(true);
    expect(res.mediaUpdated).toBe(1);
    expect(res.episodesUpdated).toBe(1);

    expect(mockMediaUpdate).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { synopsis: "Hello World" },
    });
    expect(mockMediaUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: "m2" } }));

    expect(mockEpisodeUpdate).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { synopsis: "Episode with & entities" },
    });
  });
});
