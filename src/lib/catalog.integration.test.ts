import { randomUUID } from "node:crypto";
import type { Insertable, Kysely } from "kysely";
import { describe, expect, it, vi } from "vitest";
import type { DB, Media } from "@/lib/db-types";
import {
  getHome,
  getTitle,
  listRecommendations,
  listTitles,
  searchTitles,
} from "./catalog";
import { withRollback } from "@/test/database";

vi.mock("next/server", () => ({
  connection: vi.fn(async () => {}),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(async () => null),
  requireUser: vi.fn(async () => null),
  requireAdmin: vi.fn(async () => null),
}));

async function createTestMedia(
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
      posterUrl: "/posters/test.jpg",
      status: "published",
      genres: ["Drama"],
      cast: ["Actor A"],
      tags: ["tag1"],
      ...overrides,
    })
    .execute();
  return id;
}

describe("catalog integration", () => {
  it("drafts and trashed titles never appear in public reads", async () => {
    await withRollback(async (trx) => {
      const uid = randomUUID().slice(0, 8);
      const pubId = `pub-${uid}`;
      const draftId = `draft-${uid}`;
      const trashedId = `trashed-${uid}`;

      await createTestMedia(trx, pubId, {
        title: `Published Unique ${uid}`,
        status: "published",
        trashedAt: null,
        backdropUrl: "/backdrops/pub.jpg",
      });

      await createTestMedia(trx, draftId, {
        title: `Draft Unique ${uid}`,
        status: "draft",
        trashedAt: null,
        backdropUrl: "/backdrops/draft.jpg",
      });

      await createTestMedia(trx, trashedId, {
        title: `Trashed Unique ${uid}`,
        status: "published",
        trashedAt: new Date(),
        backdropUrl: "/backdrops/trashed.jpg",
      });

      // 1. listTitles
      const titlesPage = await listTitles({ sort: "added", page: 1 }, trx);
      expect(titlesPage.items.some((m) => m.id === draftId)).toBe(false);
      expect(titlesPage.items.some((m) => m.id === trashedId)).toBe(false);
      expect(titlesPage.items.some((m) => m.id === pubId)).toBe(true);

      // 2. getHome
      const home = await getHome(trx);
      const allHomeMedia = [
        ...home.heroes,
        ...home.topTen,
        ...home.newReleases,
        ...home.movies,
        ...home.series,
      ].filter(Boolean);
      expect(allHomeMedia.some((m) => m?.id === draftId)).toBe(false);
      expect(allHomeMedia.some((m) => m?.id === trashedId)).toBe(false);

      // 3. searchTitles
      const searchRes = await searchTitles(`Unique ${uid}`, 1, trx);
      expect(searchRes.items.some((m) => m.id === draftId)).toBe(false);
      expect(searchRes.items.some((m) => m.id === trashedId)).toBe(false);
      expect(searchRes.items.some((m) => m.id === pubId)).toBe(true);

      // 4. getTitle
      const pubDetail = await getTitle(pubId, trx);
      expect(pubDetail).not.toBeNull();
      expect(pubDetail?.id).toBe(pubId);

      const draftDetail = await getTitle(draftId, trx);
      expect(draftDetail).toBeNull();

      const trashedDetail = await getTitle(trashedId, trx);
      expect(trashedDetail).toBeNull();

      // 5. listRecommendations
      const recs = await listRecommendations(pubId, trx);
      expect(recs.some((m) => m.id === draftId)).toBe(false);
      expect(recs.some((m) => m.id === trashedId)).toBe(false);
    });
  });

  it("relatedRows ranks by the same score as before (fixture of 4 titles, expected order pinned)", async () => {
    await withRollback(async (trx) => {
      const uid = randomUUID().slice(0, 8);
      const seedId = `seed-${uid}`;
      const candAId = `cand-a-${uid}`;
      const candBId = `cand-b-${uid}`;
      const candCId = `cand-c-${uid}`;
      const candDId = `cand-d-${uid}`;

      const g1 = `genre-1-${uid}`;
      const g2 = `genre-2-${uid}`;
      const t1 = `tag-1-${uid}`;
      const t2 = `tag-2-${uid}`;
      const c1 = `cast-1-${uid}`;
      const dir = `dir-${uid}`;
      const creator = `creator-${uid}`;

      // Seed
      await createTestMedia(trx, seedId, {
        title: `Seed ${uid}`,
        type: "movie",
        genres: [g1, g2],
        tags: [t1, t2],
        cast: [c1],
        director: dir,
        creator: creator,
        status: "published",
        trashedAt: null,
        viewCount: 10,
      });

      // Candidate A (Score = 17: type=1, genres=2*3=6, tag=2, cast=2, director=3, creator=3)
      await createTestMedia(trx, candAId, {
        title: `Cand A ${uid}`,
        type: "movie",
        genres: [g1, g2],
        tags: [t1],
        cast: [c1],
        director: dir,
        creator: creator,
        status: "published",
        trashedAt: null,
        viewCount: 10,
      });

      // Candidate B (Score = 9: type=1, genres=2*3=6, tag=2, other director/creator)
      await createTestMedia(trx, candBId, {
        title: `Cand B ${uid}`,
        type: "movie",
        genres: [g1, g2],
        tags: [t1],
        cast: [],
        director: `other-dir-${uid}`,
        creator: null,
        status: "published",
        trashedAt: null,
        viewCount: 10,
      });

      // Candidate C (Score = 5: series=0, genre=1*3=3, tag=2)
      await createTestMedia(trx, candCId, {
        title: `Cand C ${uid}`,
        type: "series",
        genres: [g1],
        tags: [t2],
        cast: [],
        director: null,
        creator: null,
        status: "published",
        trashedAt: null,
        viewCount: 10,
      });

      // Candidate D (Score = 3: type=1, tag=2)
      await createTestMedia(trx, candDId, {
        title: `Cand D ${uid}`,
        type: "movie",
        genres: [],
        tags: [t2],
        cast: [],
        director: null,
        creator: null,
        status: "published",
        trashedAt: null,
        viewCount: 10,
      });

      const recommendations = await listRecommendations(seedId, trx);
      const recIds = recommendations
        .map((r) => r.id)
        .filter((id) => [candAId, candBId, candCId, candDId].includes(id));

      // Order must match score rank: A (17) > B (9) > C (5) > D (3)
      expect(recIds).toEqual([candAId, candBId, candCId, candDId]);
      expect(recommendations.slice(0, 4).map((r) => r.id)).toEqual([
        candAId,
        candBId,
        candCId,
        candDId,
      ]);
    });
  });
});
