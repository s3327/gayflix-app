import { connection } from "next/server";
import { cache } from "react";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { isMediaId } from "@/lib/library-types";
import type {
  Episode,
  Media,
  MediaDetail,
  MediaStatus,
  MediaType,
  RecentlyWatched,
  TrendingMedia,
} from "@/lib/media";
import { PAGE_SIZE, pageWindow } from "@/lib/paginate";
import {
  escapeLike,
  MAX_SUGGESTIONS,
  normalizeQuery,
  queryYear,
  type SearchSuggestion,
} from "@/lib/search";

export { escapeLike, normalizeQuery };
import { getSession, requireAdmin } from "@/lib/session";
import { getSiteSettings } from "@/lib/site-settings";
import { videoHosts, videoUrlAllowed } from "@/lib/video-hosts";
import type { VideoSourceEntry } from "@/lib/video-source";
import { trendingSince } from "@/lib/views";

/*
 * The catalog: every read of titles and episodes goes through here.
 * Server code only.
 *
 * - The public site only ever gets published titles. Drafts and trashed
 *   titles show up only in the admin panel's reads (listLibrary and the
 *   editor's, at the end), which check for an admin themselves.
 * - Every function first waits for a request (connection()), so nothing
 *   reads the catalog at build time: CI builds before its database is
 *   migrated, and preview deploys may have no database at all.
 */

const PUBLISHED = { status: "published" } as const;

/** Home rows and "You Might Also Like" (listRecommendations). */
const ROW_SIZE = 12;
const TRENDING_ROW_SIZE = 6;
const CONTINUE_WATCHING_SIZE = 6;
/** /trending ranks the 100 most viewed titles. */
export const TRENDING_SIZE = 100;
export const LIBRARY_PAGE_SIZE = 50;

const ORDER = {
  /**
   * Newest on the site first: Recently Added, /movie, /series, their home
   * rows and Browse. Editing a title doesn't move it.
   */
  added: [{ publishedAt: "desc" }, { id: "desc" }],
  /** Browse's other sorts: most viewed of all time, newest release, A to Z. */
  popular: [{ viewCount: "desc" }, { publishedAt: "desc" }, { id: "desc" }],
  released: [{ year: "desc" }, { releaseDate: { sort: "desc", nulls: "last" } }, { id: "desc" }],
  title: [{ title: "asc" }, { id: "asc" }],
} satisfies Record<string, Prisma.MediaOrderByWithRelationInput[]>;

export type TitleSort = keyof typeof ORDER;

const EPISODE_ORDER = [
  { seasonNumber: "asc" },
  { episodeNumber: "asc" },
] satisfies Prisma.EpisodeOrderByWithRelationInput[];

/** A movie's or an episode's video sources: the player's tab order. */
const VIDEO_ORDER = [
  { position: "asc" },
  { id: "asc" },
] satisfies Prisma.VideoSourceOrderByWithRelationInput[];

/** What a card needs (see Media). */
const CARD = {
  id: true,
  type: true,
  title: true,
  year: true,
  duration: true,
  genres: true,
  posterUrl: true,
  gradient: true,
  createdAt: true,
  publishedAt: true,
} satisfies Prisma.MediaSelect;

type CardRow = Prisma.MediaGetPayload<{ select: typeof CARD }>;

/** CARD for raw queries, which get the same row shape back. */
const CARD_COLUMNS = Prisma.sql`id, type::text AS type, title, year, duration, genres, "posterUrl", gradient, "createdAt", "publishedAt"`;

// Dates are stored as calendar days (UTC midnight), so they're shown in UTC.
const longDate = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" });

function toMedia(row: CardRow): Media {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    year: row.year,
    duration: row.duration,
    genre: row.genres?.[0] ?? "",
    posterUrl: row.posterUrl,
    gradient: row.gradient ?? undefined,
    createdAt: row.createdAt.toISOString(),
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : undefined,
  };
}

function toEpisode(row: Prisma.EpisodeModel): Episode {
  return {
    id: row.id,
    title: row.title,
    seasonNumber: row.seasonNumber,
    episodeNumber: row.episodeNumber,
    duration: row.duration,
    airDate: row.airDate ? longDate.format(row.airDate) : undefined,
    stillUrl: row.stillUrl ?? undefined,
  };
}

type DetailRow = Prisma.MediaGetPayload<{ include: { episodes: true } }>;

function toDetail(row: DetailRow): MediaDetail {
  return {
    ...toMedia(row),
    genres: row.genres ?? [],
    country: row.country,
    language: row.language,
    synopsis: row.synopsis,
    tagline: row.tagline ?? undefined,
    rating: row.rating ?? undefined,
    director: row.director ?? undefined,
    creator: row.creator ?? undefined,
    cast: row.cast ?? [],
    tags: row.tags ?? [],
    releaseDate: row.releaseDate ? longDate.format(row.releaseDate) : undefined,
    runtimeMinutes: row.runtimeMinutes ?? undefined,
    backdropUrl: row.backdropUrl ?? undefined,
    episodes: (row.episodes ?? []).map(toEpisode),
  };
}

async function cards(
  where: Prisma.MediaWhereInput,
  orderBy: Prisma.MediaOrderByWithRelationInput[],
  take: number
): Promise<Media[]> {
  const rows = await db.media.findMany({ where, orderBy, take, select: CARD });
  return rows.map(toMedia);
}

/**
 * Trending: published titles by their views in the last TRENDING_DAYS
 * days (src/lib/views.ts), most first; ties go to the most viewed of all
 * time. Titles nobody played in that time aren't trending.
 */
async function trendingRows(limit: number) {
  return db.$queryRaw<(CardRow & { views: number })[]>`
    SELECT ${CARD_COLUMNS}, views FROM media
    JOIN (
      SELECT "mediaId" AS id, count(*)::int AS views FROM media_view
      WHERE day >= ${trendingSince(new Date())}::date
      GROUP BY "mediaId"
    ) recent USING (id)
    WHERE status = 'published' AND "trashedAt" IS NULL
    ORDER BY views DESC, "viewCount" DESC, id
    LIMIT ${limit}`;
}

// --- Home ------------------------------------------------------------------

/** The home page hero. */
export type Featured = Media & { synopsis: string; backdropUrl?: string };

/** The currently active home page hero (the featured published title or fallback newest). */
export async function getLiveHero(): Promise<{ id: string; title: string; type: MediaType } | null> {
  await connection();
  const heroSelect = { id: true, title: true, type: true } satisfies Prisma.MediaSelect;
  const featured = await db.media.findFirst({
    where: { ...PUBLISHED, featured: true },
    orderBy: ORDER.added,
    select: heroSelect,
  });
  if (featured) return featured;
  return db.media.findFirst({ where: PUBLISHED, orderBy: ORDER.added, select: heroSelect });
}

/**
 * The home page: the hero (the most recently published featured title, or
 * else the newest one) and the Trending Now, Recently Added, Movies and
 * Series rows.
 */
export async function getHome() {
  await connection();
  const heroSelect = { ...CARD, synopsis: true, backdropUrl: true } satisfies Prisma.MediaSelect;
  const [featured, trending, newReleases, movies, series] = await Promise.all([
    db.media.findFirst({
      where: { ...PUBLISHED, featured: true },
      orderBy: ORDER.added,
      select: heroSelect,
    }),
    trendingRows(TRENDING_ROW_SIZE),
    cards(PUBLISHED, ORDER.added, ROW_SIZE),
    cards({ ...PUBLISHED, type: "movie" }, ORDER.added, ROW_SIZE),
    cards({ ...PUBLISHED, type: "series" }, ORDER.added, ROW_SIZE),
  ]);
  const hero =
    featured ??
    (await db.media.findFirst({ where: PUBLISHED, orderBy: ORDER.added, select: heroSelect }));

  return {
    featured: hero && ({
      ...toMedia(hero),
      synopsis: hero.synopsis,
      backdropUrl: hero.backdropUrl ?? undefined,
    } satisfies Featured),
    trending: trending.map(toMedia),
    newReleases,
    movies,
    series,
  };
}

/**
 * Continue Watching on the home page: the titles the signed-in user
 * played last, newest first, one card per title (a series at the episode
 * played last). Empty for guests, whose history stays in their browser
 * until they sign in.
 */
export async function listContinueWatching(): Promise<RecentlyWatched[]> {
  await connection();
  const session = await getSession();
  if (!session) return [];
  // History holds movie and episode ids; an episode stands for its series.
  const rows = await db.$queryRaw<
    (CardRow & {
      backdropUrl: string | null;
      episodeId: string | null;
      seasonNumber: number | null;
      episodeNumber: number | null;
      episodeTitle: string | null;
    })[]
  >`
    SELECT ${CARD_COLUMNS}, "backdropUrl", "episodeId", "seasonNumber", "episodeNumber", "episodeTitle"
    FROM (
      SELECT DISTINCT ON (COALESCE(e."mediaId", h."mediaId"))
        COALESCE(e."mediaId", h."mediaId") AS id,
        e.id AS "episodeId",
        e."seasonNumber",
        e."episodeNumber",
        e.title AS "episodeTitle",
        h."watchedAt"
      FROM watch_history h
      LEFT JOIN episode e ON e.id = h."mediaId"
      WHERE h."userId" = ${session.user.id}
      ORDER BY COALESCE(e."mediaId", h."mediaId"), h."watchedAt" DESC
    ) latest
    JOIN media USING (id)
    WHERE status = 'published'
    ORDER BY "watchedAt" DESC, id
    LIMIT ${CONTINUE_WATCHING_SIZE}`;
  return rows.map((row) => ({
    ...toMedia(row),
    backdropUrl: row.backdropUrl ?? undefined,
    episode:
      row.episodeId === null
        ? undefined
        : {
            id: row.episodeId,
            seasonNumber: row.seasonNumber!,
            episodeNumber: row.episodeNumber!,
            title: row.episodeTitle!,
          },
  }));
}

// --- Listings ----------------------------------------------------------------

export type TitleFilter = {
  type?: MediaType;
  genre?: string;
  country?: string;
  language?: string;
  /** A year (from and to the same) or a decade. */
  year?: { from: number; to: number };
};

export type TitlePage = {
  items: Media[];
  /** The page shown: the requested one, clamped into range. */
  page: number;
  totalPages: number;
  total: number;
};

/** One page of published titles, filtered and sorted. */
export async function listTitles({
  sort,
  page: requestedPage,
  ...filter
}: TitleFilter & { sort: TitleSort; page: number }): Promise<TitlePage> {
  await connection();
  // Prisma skips conditions that are undefined.
  const where: Prisma.MediaWhereInput = {
    ...PUBLISHED,
    type: filter.type,
    genres: filter.genre ? { has: filter.genre } : undefined,
    country: filter.country,
    language: filter.language,
    year: filter.year ? { gte: filter.year.from, lte: filter.year.to } : undefined,
  };
  const settings = await getSiteSettings();
  const perPage = settings.defaultPageSize || PAGE_SIZE;
  const total = await db.media.count({ where });
  const { page, totalPages, skip } = pageWindow(total, requestedPage, perPage);
  const rows = await db.media.findMany({
    where,
    orderBy: ORDER[sort],
    skip,
    take: perPage,
    select: CARD,
  });
  return { items: rows.map(toMedia), page, totalPages, total };
}

export type FilterField = "genre" | "country" | "language" | "year";

/**
 * Browse's choices: every value at least one published title has. Years
 * newest first, the rest A to Z.
 */
export async function listFilterValues(field: FilterField): Promise<string[]> {
  await connection();
  switch (field) {
    case "genre": {
      const rows = await db.$queryRaw<{ value: string }[]>`
        SELECT DISTINCT unnest(genres) AS value FROM media
        WHERE status = 'published' ORDER BY value`;
      return rows.map((row) => row.value);
    }
    case "country": {
      const rows = await db.media.groupBy({
        by: ["country"],
        where: PUBLISHED,
        orderBy: { country: "asc" },
      });
      return rows.map((row) => row.country);
    }
    case "language": {
      const rows = await db.media.groupBy({
        by: ["language"],
        where: PUBLISHED,
        orderBy: { language: "asc" },
      });
      return rows.map((row) => row.language);
    }
    case "year": {
      const rows = await db.media.groupBy({
        by: ["year"],
        where: PUBLISHED,
        orderBy: { year: "desc" },
      });
      return rows.map((row) => String(row.year));
    }
  }
}

/**
 * /trending: the most viewed published titles of the last
 * TRENDING_DAYS days, ranked from 1. Titles nobody played in that time
 * aren't trending, so the list can be shorter than 100.
 */
export async function listTrending(): Promise<TrendingMedia[]> {
  await connection();
  const rows = await trendingRows(TRENDING_SIZE);
  return rows.map((row, index) => ({
    ...toMedia(row),
    views: row.views,
    rank: index + 1,
  }));
}

/**
 * "You Might Also Like" on a title's page: the other published titles
 * most like it. Each shared genre scores 3, each shared tag or cast
 * member 2, the same director or creator 3, and the same type 1. Ties
 * (including titles that share nothing, which fill out the row) go to
 * the most viewed, then the newest.
 */
export async function listRecommendations(id: string): Promise<Media[]> {
  await connection();
  return (
    await db.$queryRaw<CardRow[]>`
      WITH this AS (
        SELECT genres AS g, tags AS t, "cast" AS c, director AS d, creator AS cr, type AS ty
        FROM media WHERE id = ${id}
      )
      SELECT ${CARD_COLUMNS} FROM media, this
      WHERE status = 'published' AND "trashedAt" IS NULL AND id <> ${id}
      ORDER BY
        3 * cardinality(ARRAY(SELECT unnest(genres) INTERSECT SELECT unnest(this.g)))
        + 2 * cardinality(ARRAY(SELECT unnest(tags) INTERSECT SELECT unnest(this.t)))
        + 2 * cardinality(ARRAY(SELECT unnest("cast") INTERSECT SELECT unnest(this.c)))
        + CASE WHEN director = this.d THEN 3 ELSE 0 END
        + CASE WHEN creator = this.cr THEN 3 ELSE 0 END
        + CASE WHEN type = this.ty THEN 1 ELSE 0 END DESC,
        "viewCount" DESC, "publishedAt" DESC NULLS LAST, id
      LIMIT ${ROW_SIZE}`
  ).map(toMedia);
}

/** Every published title, for the sitemap. */
export async function listPublishedTitles() {
  await connection();
  return db.media.findMany({
    where: PUBLISHED,
    orderBy: { id: "asc" },
    select: { id: true, type: true, updatedAt: true },
  });
}

// --- Search ------------------------------------------------------------------

/**
 * Titles whose title, synopsis, director, creator, country, language, or
 * one of its cast, genres or tags contains the query, plus titles from
 * that year when the query is a year. A title page's people and tags
 * link here (src/lib/browse-href.ts).
 */
function searchCondition(query: string) {
  const pattern = `%${escapeLike(query)}%`;
  const year = queryYear(query);
  return Prisma.sql`status = 'published' AND (
    title ILIKE ${pattern}
    OR synopsis ILIKE ${pattern}
    OR director ILIKE ${pattern}
    OR creator ILIKE ${pattern}
    OR country ILIKE ${pattern}
    OR language ILIKE ${pattern}
    OR EXISTS (SELECT 1 FROM unnest("cast") AS person WHERE person ILIKE ${pattern})
    OR EXISTS (SELECT 1 FROM unnest(genres) AS genre WHERE genre ILIKE ${pattern})
    OR EXISTS (SELECT 1 FROM unnest(tags) AS tag WHERE tag ILIKE ${pattern})
    ${year === null ? Prisma.empty : Prisma.sql`OR year = ${year}`}
  )`;
}

/**
 * Titles starting with the query first ("Loud" before "The Loud House"
 * for "loud"), then other title matches, each group A to Z, so results
 * stay put as someone keeps typing.
 */
function titleMatchOrder(query: string) {
  const escaped = escapeLike(query);
  return Prisma.sql`(title ILIKE ${`${escaped}%`}) DESC, (title ILIKE ${`%${escaped}%`}) DESC, lower(title), id`;
}

/** The search page: one page of matching published titles. */
export async function searchTitles(rawQuery: string, requestedPage: number): Promise<TitlePage> {
  await connection();
  const query = normalizeQuery(rawQuery);
  if (!query) return { items: [], page: 1, totalPages: 1, total: 0 };

  const settings = await getSiteSettings();
  const perPage = settings.defaultPageSize || PAGE_SIZE;
  const where = searchCondition(query);
  const [{ total }] = await db.$queryRaw<{ total: number }[]>`
    SELECT count(*)::int AS total FROM media WHERE ${where}`;
  const { page, totalPages, skip } = pageWindow(total, requestedPage, perPage);
  const rows = await db.$queryRaw<CardRow[]>`
    SELECT ${CARD_COLUMNS} FROM media WHERE ${where}
    ORDER BY ${titleMatchOrder(query)}
    LIMIT ${perPage} OFFSET ${skip}`;
  return { items: rows.map(toMedia), page, totalPages, total };
}

/**
 * The header's live search: the first few of the titles the search page
 * finds, in its order, and how many it finds in all.
 */
export async function suggestTitles(
  rawQuery: string
): Promise<{ items: SearchSuggestion[]; total: number }> {
  await connection();
  const query = normalizeQuery(rawQuery);
  if (!query) return { items: [], total: 0 };
  const where = searchCondition(query);
  const [items, [{ total }]] = await Promise.all([
    db.$queryRaw<SearchSuggestion[]>`
      SELECT id, type::text AS type, title, year, "posterUrl" FROM media WHERE ${where}
      ORDER BY ${titleMatchOrder(query)}
      LIMIT ${MAX_SUGGESTIONS}`,
    db.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total FROM media WHERE ${where}`,
  ]);
  return { items, total };
}

// --- Titles and episodes ------------------------------------------------------

/*
 * A title's page reads it twice, for its <head> (generateMetadata) and
 * for the page itself; cache() makes that one query per request.
 */

/** A published title with its episodes, or null. */
export const getTitle = cache(async (id: string): Promise<MediaDetail | null> => {
  await connection();
  if (!isMediaId(id)) return null;
  const row = await db.media.findUnique({
    where: { id, ...PUBLISHED },
    include: { episodes: { orderBy: EPISODE_ORDER } },
  });
  return row && toDetail(row);
});

/** An episode of a published series, with the series, or null. */
export const getEpisode = cache(
  async (id: string): Promise<{ episode: Episode; series: MediaDetail } | null> => {
    await connection();
    if (!isMediaId(id)) return null;
    const row = await db.episode.findUnique({
      where: { id },
      include: { media: { include: { episodes: { orderBy: EPISODE_ORDER } } } },
    });
    if (!row || row.media.status !== "published") return null;
    return { episode: toEpisode(row), series: toDetail(row.media) };
  }
);

// --- Reports -----------------------------------------------------------------

/**
 * The name a report is filed under: a published title's, or "Series:
 * Episode" for an episode of one. Null when there's no such title, so
 * the browser can't file reports under made-up names.
 */
export async function findReportTitle(mediaId: string): Promise<string | null> {
  await connection();
  const media = await db.media.findUnique({
    where: { id: mediaId, ...PUBLISHED },
    select: { title: true },
  });
  if (media) return media.title;
  const episode = await db.episode.findUnique({
    where: { id: mediaId },
    select: { title: true, media: { select: { title: true, status: true } } },
  });
  return episode?.media.status === "published"
    ? `${episode.media.title}: ${episode.title}`
    : null;
}

/** Which of these ids are episodes (their player is /episode/[id]). */
export async function findEpisodeIds(ids: string[]): Promise<Set<string>> {
  await connection();
  if (ids.length === 0) return new Set();
  const rows = await db.episode.findMany({ where: { id: { in: ids } }, select: { id: true } });
  return new Set(rows.map((row) => row.id));
}

/**
 * Which of these ids are still on the public site: published titles, and
 * episodes of published series. Saved favorites, history and lists hide
 * the rest (src/lib/library.ts), so they never lead to a 404.
 */
export async function findPublishedIds(ids: string[]): Promise<Set<string>> {
  await connection();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Set();
  const [titles, episodes] = await Promise.all([
    db.media.findMany({ where: { id: { in: unique }, ...PUBLISHED }, select: { id: true } }),
    db.episode.findMany({
      where: { id: { in: unique }, media: PUBLISHED },
      select: { id: true },
    }),
  ]);
  return new Set([...titles, ...episodes].map((row) => row.id));
}

// --- Views -------------------------------------------------------------------

/**
 * The title a Play press counts a view for (src/lib/view-actions.ts):
 * a published movie, or the published series of an episode. Null for
 * anything else.
 */
export async function findViewTarget(id: string): Promise<string | null> {
  await connection();
  if (!isMediaId(id)) return null;
  const movie = await db.media.findFirst({
    where: { id, ...PUBLISHED, type: "movie" },
    select: { id: true },
  });
  if (movie) return movie.id;
  const episode = await db.episode.findUnique({
    where: { id },
    select: { media: { select: { id: true, status: true } } },
  });
  return episode?.media.status === "published" ? episode.media.id : null;
}

// --- Video ----------------------------------------------------------------------

/**
 * What a published movie or episode plays from, for the watch and
 * episode pages: its sources that are on, in tab order. Sources whose
 * host was taken out of VIDEO_HOSTS are left out, since the
 * Content-Security-Policy would block them. Empty for anything else,
 * drafts and trashed titles included.
 */
export async function getVideoSources(
  target: { mediaId: string } | { episodeId: string }
): Promise<VideoSourceEntry[]> {
  await connection();
  const id = "mediaId" in target ? target.mediaId : target.episodeId;
  if (!isMediaId(id)) return [];
  const published = { ...PUBLISHED, trashedAt: null };
  const rows = await db.videoSource.findMany({
    where:
      "mediaId" in target
        ? { mediaId: id, enabled: true, media: { ...published, type: "movie" } }
        : { episodeId: id, enabled: true, episode: { media: published } },
    orderBy: VIDEO_ORDER,
    select: { id: true, label: true, kind: true, url: true },
  });
  const hosts = videoHosts();
  return rows.filter((row) => videoUrlAllowed(row.url, hosts));
}

// --- Admin library -------------------------------------------------------------

export type LibraryRow = {
  id: string;
  title: string;
  year: number;
  type: MediaType;
  status: MediaStatus;
  posterUrl?: string;
  backdropUrl?: string | null;
  duration?: string;
  genres?: string[];
  tags?: string[];
  tagline?: string | null;
  rating?: number | null;
  viewCount?: number;
  featured?: boolean;
  publishedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  videoSourcesCount?: number;
  /** Series with episodes: counted from them. */
  seasons?: number;
  episodes?: number;
};

const LIBRARY_SORTS = [
  "title",
  "year",
  "status",
  "viewCount",
  "publishedAt",
  "createdAt",
  "updatedAt",
] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];
export type LibraryOrder = "asc" | "desc";
const LIBRARY_AUDITS = [
  "missing-video",
  "no-video",
  "missing-backdrop",
  "no-backdrop",
  "empty-series",
  "stale-drafts",
] as const;
export type LibraryAudit = (typeof LIBRARY_AUDITS)[number];
/** The most rows one library page shows (and one bulk action can check). */
export const MAX_LIBRARY_PAGE_SIZE = 100;

/**
 * The admin library: one page of movies or series, drafts included.
 * Supports sorting, audit filters, and configurable page size.
 * Only for admins (checked here too).
 */
export async function listLibrary({
  type,
  page: requestedPage,
  query = "",
  status,
  sort = "createdAt",
  order = "desc",
  pageSize = LIBRARY_PAGE_SIZE,
  genre,
  audit,
}: {
  type: MediaType;
  page: number;
  /** Matches titles containing it. */
  query?: string;
  status?: MediaStatus;
  sort?: LibrarySort;
  order?: LibraryOrder;
  pageSize?: number;
  genre?: string;
  audit?: LibraryAudit;
}) {
  await requireAdmin();
  await connection();
  // These come from the address bar: anything unknown falls back to the default.
  sort = LIBRARY_SORTS.find((known) => known === sort) ?? "createdAt";
  order = order === "asc" ? "asc" : "desc";
  audit = LIBRARY_AUDITS.find((known) => known === audit);
  pageSize = Number.isInteger(pageSize)
    ? Math.min(Math.max(pageSize, 1), MAX_LIBRARY_PAGE_SIZE)
    : LIBRARY_PAGE_SIZE;
  const search = normalizeQuery(query);
  const where: Prisma.MediaWhereInput = {
    type,
    status,
    trashedAt: null,
    title: search ? { contains: escapeLike(search), mode: "insensitive" } : undefined,
    ...(genre ? { genres: { has: genre } } : {}),
  };

  if (audit === "missing-video" || audit === "no-video") {
    if (type === "movie") {
      where.videoSources = { none: { enabled: true } };
      where.status = "published";
    } else {
      where.episodes = { none: { videoSources: { some: { enabled: true } } } };
      where.status = "published";
    }
  } else if (audit === "missing-backdrop" || audit === "no-backdrop") {
    where.OR = [{ backdropUrl: null }, { backdropUrl: "" }];
  } else if (audit === "empty-series") {
    where.episodes = { none: {} };
  } else if (audit === "stale-drafts") {
    where.status = "draft";
    where.createdAt = { lte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) };
  }

  const sortMap: Record<LibrarySort, Prisma.MediaOrderByWithRelationInput> = {
    title: { title: order },
    year: { year: order },
    status: { status: order },
    viewCount: { viewCount: order },
    publishedAt: { publishedAt: order },
    createdAt: { createdAt: order },
    updatedAt: { updatedAt: order },
  };
  const orderBy: Prisma.MediaOrderByWithRelationInput[] = [
    sortMap[sort],
    { id: "desc" },
  ];

  const total = await db.media.count({ where });
  const { page, totalPages, skip } = pageWindow(total, requestedPage, pageSize);
  const rows = await db.media.findMany({
    where,
    orderBy,
    skip,
    take: pageSize,
    select: {
      id: true,
      title: true,
      year: true,
      type: true,
      status: true,
      posterUrl: true,
      backdropUrl: true,
      duration: true,
      genres: true,
      tags: true,
      tagline: true,
      rating: true,
      viewCount: true,
      featured: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { episodes: true, videoSources: { where: { enabled: true } } } },
    },
  });

  const seasons = new Map<string, number>();
  if (type === "series" && rows.length > 0) {
    const groups = await db.episode.groupBy({
      by: ["mediaId", "seasonNumber"],
      where: { mediaId: { in: rows.map((row) => row.id) } },
    });
    for (const group of groups) {
      seasons.set(group.mediaId, (seasons.get(group.mediaId) ?? 0) + 1);
    }
  }

  const items: LibraryRow[] = rows.map(({ _count, ...row }) => ({
    ...row,
    videoSourcesCount: _count.videoSources,
    ...(_count.episodes > 0 ? { seasons: seasons.get(row.id), episodes: _count.episodes } : {}),
  }));
  return { items, page, totalPages, total, sort, order, audit, pageSize };
}

// --- Admin editor ---------------------------------------------------------------
// Everything here includes drafts and trashed titles, so each one checks
// for an admin itself.

/** A title with its episodes and a movie's video sources, for its edit page. */
export async function getTitleForEdit(id: string) {
  await requireAdmin();
  await connection();
  if (!isMediaId(id)) return null;
  return db.media.findUnique({
    where: { id },
    include: { episodes: { orderBy: EPISODE_ORDER }, videoSources: { orderBy: VIDEO_ORDER } },
  });
}

/** The series an episode can be added to (not trashed), A to Z. */
export async function listSeriesChoices() {
  await requireAdmin();
  await connection();
  return db.media.findMany({
    where: { type: "series", trashedAt: null },
    orderBy: [{ title: "asc" }, { id: "asc" }],
    select: { id: true, title: true },
  });
}

/** A series' last episode (highest season, then episode), or null. */
export async function getLastEpisode(seriesId: string) {
  await requireAdmin();
  await connection();
  return db.episode.findFirst({
    where: { mediaId: seriesId },
    orderBy: [{ seasonNumber: "desc" }, { episodeNumber: "desc" }],
    select: { seasonNumber: true, episodeNumber: true },
  });
}

/** /admin/library/episodes: one page of episodes, of one series or all. */
export type EpisodeSort = "title" | "series" | "season" | "episode" | "airDate";

export async function listEpisodes({
  seriesId,
  query = "",
  page: requestedPage,
  sort = "series",
  order = "asc",
  pageSize = LIBRARY_PAGE_SIZE,
}: {
  seriesId?: string;
  query?: string;
  page: number;
  sort?: EpisodeSort;
  order?: "asc" | "desc";
  pageSize?: number;
}) {
  await requireAdmin();
  await connection();
  const search = normalizeQuery(query);
  const where: Prisma.EpisodeWhereInput = {
    ...(seriesId ? { mediaId: seriesId } : {}),
    media: { trashedAt: null },
    ...(search ? { title: { contains: escapeLike(search), mode: "insensitive" } } : {}),
  };
  const total = await db.episode.count({ where });
  const { page, totalPages, skip } = pageWindow(total, requestedPage, pageSize);

  const orderBy: Prisma.EpisodeOrderByWithRelationInput[] =
    sort === "title"
      ? [{ title: order }, { id: "asc" }]
      : sort === "season"
      ? [{ seasonNumber: order }, { episodeNumber: order }, { id: "asc" }]
      : sort === "episode"
      ? [{ episodeNumber: order }, { seasonNumber: order }, { id: "asc" }]
      : sort === "airDate"
      ? [{ airDate: order }, { id: "asc" }]
      : [{ media: { title: order } }, { mediaId: "asc" }, ...EPISODE_ORDER];

  const items = await db.episode.findMany({
    where,
    orderBy,
    skip,
    take: pageSize,
    include: { media: { select: { title: true } } },
  });
  return { items, page, totalPages, total };
}

/** An episode with its series and video sources, for its edit page. */
export async function getEpisodeForEdit(id: string) {
  await requireAdmin();
  await connection();
  if (!isMediaId(id)) return null;
  return db.episode.findUnique({
    where: { id },
    include: {
      media: { select: { id: true, title: true, trashedAt: true } },
      videoSources: { orderBy: VIDEO_ORDER },
    },
  });
}

/**
 * Titles already imported from these TMDB or IMDb ids (media.tmdbId and
 * media.imdbId), trashed ones included, so the Import page links to them
 * instead of bringing in a copy.
 */
export async function findImported({ tmdbIds, imdbIds }: { tmdbIds: string[]; imdbIds: string[] }) {
  await requireAdmin();
  await connection();
  if (tmdbIds.length === 0 && imdbIds.length === 0) return [];
  return db.media.findMany({
    where: { OR: [{ tmdbId: { in: tmdbIds } }, { imdbId: { in: imdbIds } }] },
    select: { id: true, type: true, title: true, trashedAt: true, tmdbId: true, imdbId: true },
  });
}

/** /admin/trash: titles moved to the trash, with search and sorting support. */
export async function listTrash({
  page: requestedPage,
  query = "",
  sort = "trashedAt",
  order = "desc",
  pageSize = LIBRARY_PAGE_SIZE,
}: {
  page: number;
  query?: string;
  sort?: "title" | "year" | "trashedAt";
  order?: "asc" | "desc";
  pageSize?: number;
}) {
  await requireAdmin();
  await connection();
  const search = normalizeQuery(query);
  const where: Prisma.MediaWhereInput = {
    trashedAt: { not: null },
    ...(search ? { title: { contains: escapeLike(search), mode: "insensitive" } } : {}),
  };
  const total = await db.media.count({ where });
  const { page, totalPages, skip } = pageWindow(total, requestedPage, pageSize);
  const orderBy: Prisma.MediaOrderByWithRelationInput[] =
    sort === "title"
      ? [{ title: order }, { id: "asc" }]
      : sort === "year"
      ? [{ year: order }, { id: "asc" }]
      : [{ trashedAt: order }, { id: "asc" }];

  const items = await db.media.findMany({
    where,
    orderBy,
    skip,
    take: pageSize,
    select: {
      id: true,
      type: true,
      title: true,
      year: true,
      trashedAt: true,
      statusBeforeTrash: true,
      _count: { select: { episodes: true } },
    },
  });
  return { items, page, totalPages, total };
}

/** Admin-only draft preview for titles before they are published. */
export async function getDraftTitleForPreview(
  id: string
): Promise<(MediaDetail & { status: MediaStatus }) | null> {
  await requireAdmin();
  await connection();
  if (!isMediaId(id)) return null;
  const row = await db.media.findUnique({
    where: { id },
    include: { episodes: { orderBy: EPISODE_ORDER } },
  });
  return row && { ...toDetail(row), status: row.status };
}

/** How many titles the dashboard lists under Most played and Recently added. */
const DASHBOARD_LIST_SIZE = 5;

/**
 * /admin/dashboard: the catalog at a glance. Titles by type and status
 * (not counting the trash), plays in Trending's window and the titles
 * played most in it, and the titles added last, drafts included.
 */
export async function getCatalogOverview() {
  await requireAdmin();
  await connection();
  const live: Prisma.MediaWhereInput = { trashedAt: null };
  const [groups, plays, mostPlayed, recentlyAdded] = await Promise.all([
    db.media.groupBy({ by: ["type", "status"], where: live, _count: { _all: true } }),
    db.mediaView.count({
      where: {
        day: { gte: new Date(trendingSince(new Date())) },
        media: { status: "published", trashedAt: null },
      },
    }),
    trendingRows(DASHBOARD_LIST_SIZE),
    db.media.findMany({
      where: live,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: DASHBOARD_LIST_SIZE,
      select: { id: true, type: true, title: true, status: true, createdAt: true },
    }),
  ]);
  const count = (type: MediaType, status: MediaStatus) =>
    groups.find((group) => group.type === type && group.status === status)?._count._all ?? 0;
  return {
    published: { movie: count("movie", "published"), series: count("series", "published") },
    drafts: { movie: count("movie", "draft"), series: count("series", "draft") },
    plays,
    mostPlayed: mostPlayed.map(({ id, type, title, views }) => ({ id, type, title, plays: views })),
    recentlyAdded,
  };
}

/**
 * Resolves an old episode slug to its latest slug through any episode
 * redirects, following chains up to 10 hops. A chain that loops back on
 * itself leads nowhere (null), so the page is a 404 rather than a
 * redirect loop.
 */
export async function resolveEpisodeRedirect(slug: string): Promise<string | null> {
  await connection();
  const seen = new Set([slug]);
  let currentSlug = slug;
  while (seen.size <= 10) {
    const redirect = await db.episodeRedirect.findFirst({
      where: { oldSlug: currentSlug },
      select: { newSlug: true },
    });
    if (!redirect) break;
    if (seen.has(redirect.newSlug)) return null;
    seen.add(redirect.newSlug);
    currentSlug = redirect.newSlug;
  }
  return currentSlug === slug ? null : currentSlug;
}
