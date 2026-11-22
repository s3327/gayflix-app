import { stripHtmlAndEntities } from "@/lib/sanitize-text";
import { connection } from "next/server";
import { cache } from "react";
import type { Kysely, SelectQueryBuilder } from "kysely";
import { sql } from "kysely";
import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/postgres";
import { database } from "@/lib/database";
import type { DB } from "@/lib/db-types";
import { countOf } from "@/lib/sql-helpers";
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
  allowedTypos,
  escapeLike,
  fuzzyMatches,
  MAX_PEOPLE_SUGGESTIONS,
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
import { languageName, SUBTITLE_ID, type SubtitleTrack } from "@/lib/subtitles";
import { isMostLiked, RATINGS, type Rating } from "@/lib/ratings";
import { parseMaturity } from "@/lib/title-extras";
import { trendingSince } from "@/lib/views";
import { isFinished } from "@/lib/watch-progress";

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


/** Home rows and "You Might Also Like" (listRecommendations). */
const ROW_SIZE = 12;
/** Top 10 This Week on the home page and New & Popular. */
const TOP_TEN_SIZE = 10;
const CONTINUE_WATCHING_SIZE = 6;
/** /trending ranks the 100 most viewed titles. */
export const TRENDING_SIZE = 100;
export const LIBRARY_PAGE_SIZE = 50;

export type TitleSort = "added" | "popular" | "released" | "title";

type CardRow = {
  id: string;
  type: MediaType;
  title: string;
  year: number;
  duration: string;
  genres: string[] | null;
  posterUrl: string;
  gradient: string | null;
  category: string | null;
  createdAt: Date | string;
  publishedAt: Date | string | null;
};

/** CARD for raw queries, which get the same row shape back. */
const CARD_COLUMNS_SQL = sql`id, type::text AS type, title, year, duration, genres, "posterUrl", gradient, "createdAt", "publishedAt", category`;

// Dates are stored as calendar days (UTC midnight), so they're shown in UTC.
const longDate = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" });

function toMedia(
  row:
    | CardRow
    | {
        id: string;
        type: MediaType;
        title: string;
        year: number;
        duration: string;
        genres: string[] | null;
        posterUrl: string;
        gradient?: string | null;
        category?: string | null;
        createdAt: Date | string;
        publishedAt?: Date | string | null;
      }
): Media {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    year: row.year,
    duration: row.duration,
    genre: row.genres?.[0] ?? "",
    category: row.category ?? undefined,
    posterUrl: row.posterUrl,
    gradient: row.gradient ?? undefined,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : row.createdAt.toISOString(),
    publishedAt: row.publishedAt
      ? typeof row.publishedAt === "string"
        ? row.publishedAt
        : row.publishedAt.toISOString()
      : undefined,
  };
}

function toEpisode(row: {
  id: string;
  title: string;
  seasonNumber: number;
  episodeNumber: number;
  duration: string;
  airDate?: Date | string | null;
  stillUrl?: string | null;
  synopsis?: string | null;
}): Episode {
  const airDate = row.airDate
    ? row.airDate instanceof Date
      ? row.airDate
      : new Date(row.airDate)
    : undefined;
  return {
    id: row.id,
    title: row.title,
    seasonNumber: row.seasonNumber,
    episodeNumber: row.episodeNumber,
    duration: row.duration,
    airDate: airDate ? longDate.format(airDate) : undefined,
    stillUrl: row.stillUrl ?? undefined,
    synopsis: row.synopsis ? stripHtmlAndEntities(row.synopsis) : undefined,
  };
}

function toDetail(row: {
  id: string;
  type: MediaType;
  title: string;
  year: number;
  duration: string;
  genres: string[] | null;
  country?: string | null;
  language?: string | null;
  synopsis?: string | null;
  tagline?: string | null;
  rating?: number | null;
  director?: string | null;
  creator?: string | null;
  cast?: string[] | null;
  tags?: string[] | null;
  releaseDate?: Date | string | null;
  runtimeMinutes?: number | null;
  posterUrl: string;
  backdropUrl?: string | null;
  trailerUrl?: string | null;
  gradient?: string | null;
  category?: string | null;
  maturityRating?: string | null;
  contentNotes?: string[] | null;
  createdAt: Date | string;
  publishedAt?: Date | string | null;
  episodes?: Parameters<typeof toEpisode>[0][];
}): MediaDetail {
  const releaseDate = row.releaseDate
    ? row.releaseDate instanceof Date
      ? row.releaseDate
      : new Date(row.releaseDate)
    : undefined;
  return {
    ...toMedia(row),
    genres: row.genres ?? [],
    country: row.country ?? "",
    language: row.language ?? "",
    synopsis: stripHtmlAndEntities(row.synopsis ?? ""),
    tagline: row.tagline ?? undefined,
    rating: row.rating ?? undefined,
    director: row.director ?? undefined,
    creator: row.creator ?? undefined,
    cast: row.cast ?? [],
    tags: row.tags ?? [],
    releaseDate: releaseDate ? longDate.format(releaseDate) : undefined,
    runtimeMinutes: row.runtimeMinutes ?? undefined,
    backdropUrl: row.backdropUrl ?? undefined,
    trailerUrl: row.trailerUrl ?? undefined,
    maturityRating: parseMaturity(row.maturityRating ?? "") ?? undefined,
    contentNotes: row.contentNotes ?? [],
    episodes: (row.episodes ?? []).map(toEpisode),
  };
}

function applyOrder<O>(
  query: SelectQueryBuilder<DB, "media", O>,
  sort: TitleSort
): SelectQueryBuilder<DB, "media", O> {
  switch (sort) {
    case "added":
      return query.orderBy("publishedAt", "desc").orderBy("id", "desc");
    case "popular":
      return query.orderBy("viewCount", "desc").orderBy("publishedAt", "desc").orderBy("id", "desc");
    case "released":
      return query
        .orderBy("year", "desc")
        .orderBy(sql`"releaseDate" DESC NULLS LAST`)
        .orderBy("id", "desc");
    case "title":
      return query.orderBy("title", "asc").orderBy("id", "asc");
  }
}

async function cards(
  filter: { status?: MediaStatus; type?: MediaType },
  order: TitleSort,
  take: number,
  executor: Kysely<DB> = database
): Promise<Media[]> {
  let query = executor
    .selectFrom("media")
    .select([
      "id",
      "type",
      "title",
      "year",
      "duration",
      "genres",
      "posterUrl",
      "gradient",
      "category",
      "createdAt",
      "publishedAt",
    ])
    .where("status", "=", filter.status ?? "published")
    .where("trashedAt", "is", null);

  if (filter.type) {
    query = query.where("type", "=", filter.type);
  }

  const rows = await applyOrder(query, order).limit(take).execute();
  return rows.map((r) => toMedia(r as CardRow));
}

/**
 * Trending: published titles by their views in the last TRENDING_DAYS
 * days (src/lib/views.ts), most first; ties go to the most viewed of all
 * time. Titles nobody played in that time aren't trending.
 */
async function trendingRows(limit: number, executor: Kysely<DB> = database) {
  const sinceDate = trendingSince(new Date());
  const { rows } = await sql<CardRow & { views: number }>`
    SELECT ${CARD_COLUMNS_SQL}, views FROM media
    JOIN (
      SELECT "mediaId" AS id, count(*)::int AS views FROM media_view
      WHERE day >= ${sinceDate}::date
      GROUP BY "mediaId"
    ) recent USING (id)
    WHERE status = 'published' AND "trashedAt" IS NULL
    ORDER BY views DESC, "viewCount" DESC, id
    LIMIT ${limit}`.execute(executor);
  return rows;
}

// --- Home ------------------------------------------------------------------

/** The home page hero. */
export type Featured = Media & { synopsis: string; backdropUrl?: string };

/** The currently active home page hero (the featured published title or fallback newest). */
export async function getLiveHero(
  executor: Kysely<DB> = database
): Promise<{ id: string; title: string; type: MediaType } | null> {
  await connection();
  const featured = await executor
    .selectFrom("media")
    .select(["id", "title", "type"])
    .where("status", "=", "published")
    .where("trashedAt", "is", null)
    .where("featured", "=", true)
    .orderBy("publishedAt", "desc")
    .orderBy("id", "desc")
    .executeTakeFirst();
  if (featured) return featured;

  const fallback = await executor
    .selectFrom("media")
    .select(["id", "title", "type"])
    .where("status", "=", "published")
    .where("trashedAt", "is", null)
    .orderBy("publishedAt", "desc")
    .orderBy("id", "desc")
    .executeTakeFirst();

  return fallback ?? null;
}

/** How many titles the home page hero turns through. */
const HERO_SIZE = 5;

/**
 * The home page: the hero's titles and the Top 10 This Week (Trending's
 * first ten), Recently Added, Movies and Series rows.
 *
 * The hero leads with the most recently published featured title (or
 * else the newest), then turns through up to four more that have a
 * backdrop: this week's most watched first, then the newest.
 */
export async function getHome(executor: Kysely<DB> = database) {
  await connection();
  const heroSelect = [
    "id",
    "type",
    "title",
    "year",
    "duration",
    "genres",
    "posterUrl",
    "gradient",
    "category",
    "createdAt",
    "publishedAt",
    "synopsis",
    "backdropUrl",
  ] as const;

  const [featured, topTen, newReleases, movies, series] = await Promise.all([
    executor
      .selectFrom("media")
      .select(heroSelect)
      .where("status", "=", "published")
      .where("trashedAt", "is", null)
      .where("featured", "=", true)
      .orderBy("publishedAt", "desc")
      .orderBy("id", "desc")
      .executeTakeFirst(),
    trendingRows(TOP_TEN_SIZE, executor),
    cards({ status: "published" }, "added", ROW_SIZE, executor),
    cards({ status: "published", type: "movie" }, "added", ROW_SIZE, executor),
    cards({ status: "published", type: "series" }, "added", ROW_SIZE, executor),
  ]);

  const hero =
    featured ??
    (await executor
      .selectFrom("media")
      .select(heroSelect)
      .where("status", "=", "published")
      .where("trashedAt", "is", null)
      .orderBy("publishedAt", "desc")
      .orderBy("id", "desc")
      .executeTakeFirst());

  const candidates = [...new Set([...topTen, ...newReleases].map((row) => row.id))].filter(
    (id) => id !== hero?.id
  );
  const withBackdrops = candidates.length
    ? await executor
        .selectFrom("media")
        .select(heroSelect)
        .where("status", "=", "published")
        .where("trashedAt", "is", null)
        .where("id", "in", candidates)
        .where("backdropUrl", "is not", null)
        .execute()
    : [];
  const rest = withBackdrops
    .sort((a, b) => candidates.indexOf(a.id) - candidates.indexOf(b.id))
    .slice(0, HERO_SIZE - 1);
  const toFeatured = (row: NonNullable<typeof hero>): Featured => ({
    ...toMedia(row as CardRow),
    synopsis: stripHtmlAndEntities(row.synopsis),
    backdropUrl: row.backdropUrl ?? undefined,
  });

  return {
    heroes: hero ? [hero, ...rest].map(toFeatured) : [],
    topTen: topTen.map(toMedia),
    newReleases,
    movies,
    series,
  };
}

/**
 * New & Popular: this week's ten most watched, the newest titles, and the
 * most watched of all time.
 */
export async function getNewAndPopular(executor: Kysely<DB> = database) {
  await connection();
  const [topTen, recentlyAdded, mostWatched] = await Promise.all([
    trendingRows(TOP_TEN_SIZE, executor),
    cards({ status: "published" }, "added", ROW_SIZE, executor),
    cards({ status: "published" }, "popular", ROW_SIZE, executor),
  ]);
  return { topTen: topTen.map(toMedia), recentlyAdded, mostWatched };
}

/**
 * Continue Watching on the home page: the titles the signed-in user
 * played last, newest first, one card per title (a series at the episode
 * played last). A movie watched to the end drops off; a series moves on
 * to the next episode, and drops off after its last. Titles they took
 * off the row stay off until they watch them again. Empty for guests,
 * whose history stays in their browser until they sign in.
 */
export async function listContinueWatching(
  executor: Kysely<DB> = database
): Promise<RecentlyWatched[]> {
  await connection();
  const session = await getSession();
  if (!session) return [];

  const { rows } = await sql<
    CardRow & {
      backdropUrl: string | null;
      historyId: string;
      progressSeconds: number;
      durationSeconds: number;
      episodeId: string | null;
      seasonNumber: number | null;
      episodeNumber: number | null;
      episodeTitle: string | null;
      nextId: string | null;
      nextSeasonNumber: number | null;
      nextEpisodeNumber: number | null;
      nextTitle: string | null;
    }
  >`
    SELECT ${CARD_COLUMNS_SQL}, "backdropUrl", "historyId", "progressSeconds", "durationSeconds",
      "episodeId", "seasonNumber", "episodeNumber", "episodeTitle",
      "nextId", "nextSeasonNumber", "nextEpisodeNumber", "nextTitle"
    FROM (
      SELECT DISTINCT ON (COALESCE(e."mediaId", h."mediaId"))
        COALESCE(e."mediaId", h."mediaId") AS id,
        h."mediaId" AS "historyId",
        h."progressSeconds",
        h."durationSeconds",
        h."hiddenFromContinue",
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
    LEFT JOIN LATERAL (
      -- Renamed, so they don't clash with the title's own columns.
      SELECT n.id AS "nextId", n."seasonNumber" AS "nextSeasonNumber",
        n."episodeNumber" AS "nextEpisodeNumber", n.title AS "nextTitle"
      FROM episode n
      WHERE n."mediaId" = latest.id
        AND (n."seasonNumber", n."episodeNumber") > (latest."seasonNumber", latest."episodeNumber")
      ORDER BY n."seasonNumber", n."episodeNumber"
      LIMIT 1
    ) next ON latest."episodeId" IS NOT NULL
    WHERE status = 'published' AND "trashedAt" IS NULL AND NOT latest."hiddenFromContinue"
    ORDER BY "watchedAt" DESC, id
    LIMIT ${CONTINUE_WATCHING_SIZE * 4}`.execute(executor);

  const items: RecentlyWatched[] = [];
  for (const row of rows) {
    const progress = { position: row.progressSeconds, duration: row.durationSeconds };
    const base = { ...toMedia(row), backdropUrl: row.backdropUrl ?? undefined, historyId: row.historyId };
    if (!isFinished(progress)) {
      items.push({
        ...base,
        progress: progress.duration > 0 ? progress : undefined,
        episode:
          row.episodeId === null
            ? undefined
            : {
                id: row.episodeId,
                seasonNumber: row.seasonNumber!,
                episodeNumber: row.episodeNumber!,
                title: row.episodeTitle!,
              },
      });
    } else if (row.nextId !== null) {
      items.push({
        ...base,
        episode: {
          id: row.nextId,
          seasonNumber: row.nextSeasonNumber!,
          episodeNumber: row.nextEpisodeNumber!,
          title: row.nextTitle!,
          isNext: true,
        },
      });
    }
    if (items.length === CONTINUE_WATCHING_SIZE) break;
  }
  return items;
}

// --- Listings ----------------------------------------------------------------

export type TitleFilter = {
  type?: MediaType;
  category?: string;
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
  /** Search only: nothing matched as typed, so these are the titles spelled closest. */
  fuzzy?: boolean;
};

/** One page of published titles, filtered and sorted. */
export async function listTitles(
  {
    sort,
    page: requestedPage,
    ...filter
  }: TitleFilter & { sort: TitleSort; page: number },
  executor: Kysely<DB> = database
): Promise<TitlePage> {
  await connection();
  let baseQuery = executor
    .selectFrom("media")
    .where("status", "=", "published")
    .where("trashedAt", "is", null);

  if (filter.type) {
    baseQuery = baseQuery.where("type", "=", filter.type);
  }
  if (filter.category) {
    baseQuery = baseQuery.where("category", "=", filter.category);
  }
  if (filter.genre) {
    baseQuery = baseQuery.where(sql<boolean>`${filter.genre} = ANY(genres)`);
  }
  if (filter.country) {
    baseQuery = baseQuery.where("country", "=", filter.country);
  }
  if (filter.language) {
    baseQuery = baseQuery.where("language", "=", filter.language);
  }
  if (filter.year) {
    baseQuery = baseQuery
      .where("year", ">=", filter.year.from)
      .where("year", "<=", filter.year.to);
  }

  const settings = await getSiteSettings();
  const perPage = settings.defaultPageSize || PAGE_SIZE;

  const countRow = await baseQuery
    .select((eb) => eb.fn.countAll().as("count"))
    .executeTakeFirst();
  const total = countRow ? countOf(countRow) : 0;
  const { page, totalPages, skip } = pageWindow(total, requestedPage, perPage);

  const rows = await applyOrder(
    baseQuery.select([
      "id",
      "type",
      "title",
      "year",
      "duration",
      "genres",
      "posterUrl",
      "gradient",
      "category",
      "createdAt",
      "publishedAt",
    ]),
    sort
  )
    .offset(skip)
    .limit(perPage)
    .execute();

  return { items: rows.map((r) => toMedia(r as CardRow)), page, totalPages, total };
}

export type FilterField = "genre" | "country" | "language" | "year";

/**
 * Browse's choices: every value at least one published title has. Years
 * newest first, the rest A to Z.
 */
export async function listFilterValues(
  field: FilterField,
  executor: Kysely<DB> = database
): Promise<string[]> {
  await connection();
  switch (field) {
    case "genre": {
      const { rows } = await sql<{ value: string }>`
        SELECT DISTINCT unnest(genres) AS value FROM media
        WHERE status = 'published' AND "trashedAt" IS NULL ORDER BY value`.execute(executor);
      return rows.map((row) => row.value);
    }
    case "country": {
      const rows = await executor
        .selectFrom("media")
        .select("country")
        .distinct()
        .where("status", "=", "published")
        .where("trashedAt", "is", null)
        .where("country", "is not", null)
        .orderBy("country", "asc")
        .execute();
      return rows.map((row) => row.country!).filter(Boolean);
    }
    case "language": {
      const rows = await executor
        .selectFrom("media")
        .select("language")
        .distinct()
        .where("status", "=", "published")
        .where("trashedAt", "is", null)
        .where("language", "is not", null)
        .orderBy("language", "asc")
        .execute();
      return rows.map((row) => row.language!).filter(Boolean);
    }
    case "year": {
      const rows = await executor
        .selectFrom("media")
        .select("year")
        .distinct()
        .where("status", "=", "published")
        .where("trashedAt", "is", null)
        .where("year", "is not", null)
        .orderBy("year", "desc")
        .execute();
      return rows.map((row) => String(row.year));
    }
  }
}

/**
 * /trending: the most viewed published titles of the last
 * TRENDING_DAYS days, ranked from 1. Titles nobody played in that time
 * aren't trending, so the list can be shorter than 100.
 */
export async function listTrending(
  executor: Kysely<DB> = database
): Promise<TrendingMedia[]> {
  await connection();
  const rows = await trendingRows(TRENDING_SIZE, executor);
  return rows.map((row, index) => ({
    ...toMedia(row),
    views: row.views,
    rank: index + 1,
  }));
}

/**
 * The published titles most like title `id`, most alike first. Each
 * shared genre scores 3, each shared tag or cast member 2, the same
 * director or creator 3, and the same type 1. Ties go to the most
 * viewed, then the newest. Titles scoring under `minScore`, those in
 * `excludeIds` and, with `unwatchedBy`, those that user has played or
 * rated are left out.
 */
async function relatedRows(
  id: string,
  {
    minScore = 0,
    excludeIds = [],
    unwatchedBy,
  }: { minScore?: number; excludeIds?: string[]; unwatchedBy?: string } = {},
  executor: Kysely<DB> = database
) {
  const unwatchedCondition =
    unwatchedBy === undefined
      ? sql``
      : sql`AND id NOT IN (
          -- History holds movie and episode ids; an episode stands for its series.
          SELECT COALESCE(e."mediaId", h."mediaId") FROM watch_history h
          LEFT JOIN episode e ON e.id = h."mediaId"
          WHERE h."userId" = ${unwatchedBy}
          UNION SELECT "mediaId" FROM media_rating WHERE "userId" = ${unwatchedBy}
        )`;

  const excludeCondition =
    excludeIds.length === 0
      ? sql``
      : sql`AND NOT (id = ANY(${excludeIds}::text[]))`;

  const { rows } = await sql<CardRow>`
    WITH this AS (
      SELECT genres AS g, tags AS t, "cast" AS c, director AS d, creator AS cr, type AS ty
      FROM media WHERE id = ${id}
    )
    SELECT * FROM (
      SELECT ${CARD_COLUMNS_SQL}, "viewCount",
        3 * cardinality(ARRAY(SELECT unnest(genres) INTERSECT SELECT unnest(this.g)))
        + 2 * cardinality(ARRAY(SELECT unnest(tags) INTERSECT SELECT unnest(this.t)))
        + 2 * cardinality(ARRAY(SELECT unnest("cast") INTERSECT SELECT unnest(this.c)))
        + CASE WHEN director = this.d THEN 3 ELSE 0 END
        + CASE WHEN creator = this.cr THEN 3 ELSE 0 END
        + CASE WHEN type = this.ty THEN 1 ELSE 0 END AS score
      FROM media, this
      WHERE status = 'published' AND "trashedAt" IS NULL AND id <> ${id}
        ${excludeCondition}
        ${unwatchedCondition}
    ) related
    WHERE score >= ${minScore}
    ORDER BY score DESC, "viewCount" DESC, "publishedAt" DESC NULLS LAST, id
    LIMIT ${ROW_SIZE}`.execute(executor);

  return rows;
}

/**
 * "You Might Also Like" on a title's page: the other published titles
 * most like it (relatedRows). Titles that share nothing fill out the row.
 */
export async function listRecommendations(
  id: string,
  executor: Kysely<DB> = database
): Promise<Media[]> {
  await connection();
  return (await relatedRows(id, {}, executor)).map(toMedia);
}

/**
 * A Because You Watched row: titles like `seed`, which the member played
 * ("watched") or rated Like or Love it ("like", "love"; the heading then
 * says so).
 */
export type BecauseYouWatched = {
  seed: { id: string; title: string; reason: "watched" | "like" | "love" };
  media: Media[];
};

/** Home shows this many Because You Watched rows at most. */
const BECAUSE_ROWS = 2;
/** A row needs this many titles; fewer, and it's left out. */
const BECAUSE_MIN_TITLES = 4;
/** Only titles sharing at least a genre or a person (relatedRows' score). */
const BECAUSE_MIN_SCORE = 3;
/** How many of the latest titles played are tried for a row. */
const BECAUSE_SEEDS = 5;

/**
 * Because You Watched on the home page: for the titles the signed-in
 * user played or rated Like or Love it last, latest first, a row of the
 * published titles most like each one (relatedRows), leaving out what
 * they've already played or rated and what an earlier row shows. A title
 * they rated Not for me never gets a row, and one with too few alike
 * gets none either. Empty for guests, whose history stays in their
 * browser.
 */
export async function listBecauseYouWatched(
  executor: Kysely<DB> = database
): Promise<BecauseYouWatched[]> {
  await connection();
  const session = await getSession();
  if (!session) return [];
  const userId = session.user.id;
  const { rows: seeds } = await sql<BecauseYouWatched["seed"]>`
    SELECT media.id, media.title, COALESCE(r.value::text, 'watched') AS reason FROM (
      SELECT id, max(at) AS at FROM (
        -- History holds movie and episode ids; an episode stands for its series.
        SELECT COALESCE(e."mediaId", h."mediaId") AS id, h."watchedAt" AS at
        FROM watch_history h
        LEFT JOIN episode e ON e.id = h."mediaId"
        WHERE h."userId" = ${userId}
        UNION ALL
        SELECT "mediaId", "ratedAt" FROM media_rating
        WHERE "userId" = ${userId} AND value IN ('like', 'love')
      ) activity
      GROUP BY id
    ) seeds
    JOIN media ON media.id = seeds.id
    LEFT JOIN media_rating r ON r."mediaId" = seeds.id AND r."userId" = ${userId}
    WHERE media.status = 'published' AND media."trashedAt" IS NULL
      AND r.value IS DISTINCT FROM 'not_for_me'
    ORDER BY seeds.at DESC, media.id
    LIMIT ${BECAUSE_SEEDS}`.execute(executor);

  const rows: BecauseYouWatched[] = [];
  const shown: string[] = [];
  for (const seed of seeds) {
    const related = await relatedRows(
      seed.id,
      {
        minScore: BECAUSE_MIN_SCORE,
        excludeIds: shown,
        unwatchedBy: userId,
      },
      executor
    );
    if (related.length < BECAUSE_MIN_TITLES) continue;
    rows.push({ seed, media: related.map(toMedia) });
    shown.push(...related.map((row) => row.id));
    if (rows.length === BECAUSE_ROWS) break;
  }
  return rows;
}

/** A person's page (src/app/(main)/people/[name]): their titles by role. */
export type PersonTitles = {
  /** As the catalog writes it (the first title's spelling, if cases differ). */
  name: string;
  directed: Media[];
  created: Media[];
  appearsIn: Media[];
};

/**
 * Everything published that `name` directed, created or is in the cast
 * of, newest first (by release year), matched without regard to case.
 * Null when there's nothing: no page for a name the catalog doesn't have.
 */
export async function getPerson(
  name: string,
  executor: Kysely<DB> = database
): Promise<PersonTitles | null> {
  await connection();
  const { rows } = await sql<
    CardRow & { director: string | null; creator: string | null; cast: string[] | null }
  >`
    SELECT ${CARD_COLUMNS_SQL}, director, creator, "cast" FROM media
    WHERE status = 'published' AND "trashedAt" IS NULL
      AND (
        lower(director) = lower(${name})
        OR lower(creator) = lower(${name})
        OR EXISTS (SELECT 1 FROM unnest("cast") AS person WHERE lower(person) = lower(${name}))
      )
    ORDER BY year DESC, "publishedAt" DESC NULLS LAST, id
    LIMIT 300`.execute(executor);
  if (rows.length === 0) return null;

  const same = (value: string | null | undefined) =>
    value != null && value.toLowerCase() === name.toLowerCase();
  const first = rows[0];
  const spelled = [first.director, first.creator, ...(first.cast ?? [])].find(same) ?? name;
  return {
    name: spelled,
    directed: rows.filter((row) => same(row.director)).map(toMedia),
    created: rows.filter((row) => same(row.creator)).map(toMedia),
    appearsIn: rows.filter((row) => (row.cast ?? []).some(same)).map(toMedia),
  };
}

/** Everyone named on a published title, for the sitemap. */
export async function listPublishedPeople(
  executor: Kysely<DB> = database
): Promise<string[]> {
  await connection();
  const { rows } = await sql<{ name: string }>`
    SELECT DISTINCT name FROM (
      SELECT unnest("cast") AS name FROM media WHERE status = 'published' AND "trashedAt" IS NULL
      UNION SELECT director FROM media WHERE status = 'published' AND "trashedAt" IS NULL
      UNION SELECT creator FROM media WHERE status = 'published' AND "trashedAt" IS NULL
    ) people
    WHERE name IS NOT NULL AND trim(name) <> ''
    ORDER BY name`.execute(executor);
  return rows.map((row) => row.name);
}

/** Every published title, for the sitemap. */
export async function listPublishedTitles(executor: Kysely<DB> = database) {
  await connection();
  return executor
    .selectFrom("media")
    .select(["id", "type", "updatedAt"])
    .where("status", "=", "published")
    .where("trashedAt", "is", null)
    .orderBy("id", "asc")
    .execute();
}

/** Every episode of a published series, for the sitemap. */
export async function listPublishedEpisodes(executor: Kysely<DB> = database) {
  await connection();
  const rows = await executor
    .selectFrom("episode")
    .innerJoin("media", "media.id", "episode.mediaId")
    .select(["episode.id", "media.updatedAt"])
    .where("media.status", "=", "published")
    .where("media.trashedAt", "is", null)
    .orderBy("episode.id", "asc")
    .execute();
  return rows.map((row) => ({ id: row.id, updatedAt: row.updatedAt }));
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
  return sql`status = 'published' AND "trashedAt" IS NULL AND (
    title ILIKE ${pattern}
    OR synopsis ILIKE ${pattern}
    OR director ILIKE ${pattern}
    OR creator ILIKE ${pattern}
    OR country ILIKE ${pattern}
    OR language ILIKE ${pattern}
    OR EXISTS (SELECT 1 FROM unnest("cast") AS person WHERE person ILIKE ${pattern})
    OR EXISTS (SELECT 1 FROM unnest(genres) AS genre WHERE genre ILIKE ${pattern})
    OR EXISTS (SELECT 1 FROM unnest(tags) AS tag WHERE tag ILIKE ${pattern})
    ${year === null ? sql`` : sql`OR year = ${year}`}
  )`;
}

/**
 * Titles starting with the query first ("Loud" before "The Loud House"
 * for "loud"), then other title matches, each group A to Z, so results
 * stay put as someone keeps typing.
 */
function titleMatchOrder(query: string) {
  const escaped = escapeLike(query);
  return sql`(title ILIKE ${`${escaped}%`}) DESC, (title ILIKE ${`%${escaped}%`}) DESC, lower(title), id`;
}

/** Fuzzy matching looks through at most this many titles (the catalog is far smaller). */
const FUZZY_POOL = 5000;

/**
 * When nothing matches as typed: the published titles whose names are
 * closest to the query, allowing a typo or two (fuzzyMatches in
 * src/lib/search.ts), at most `limit`. Done here rather than in the
 * database, which has no fuzzy matching built in.
 */
async function fuzzyTitles(
  query: string,
  limit: number,
  executor: Kysely<DB> = database
): Promise<CardRow[]> {
  if (allowedTypos(query.length) === 0) return [];
  const rows = await executor
    .selectFrom("media")
    .select([
      "id",
      "type",
      "title",
      "year",
      "duration",
      "genres",
      "posterUrl",
      "gradient",
      "category",
      "createdAt",
      "publishedAt",
    ])
    .where("status", "=", "published")
    .where("trashedAt", "is", null)
    .orderBy("viewCount", "desc")
    .limit(FUZZY_POOL)
    .execute();
  return fuzzyMatches(query, rows as CardRow[], (row) => row.title, limit);
}

/**
 * The search page: one page of matching published titles. When none
 * match as typed, the titles spelled closest to the query, on one page.
 */
export async function searchTitles(
  rawQuery: string,
  requestedPage: number,
  executor: Kysely<DB> = database
): Promise<TitlePage> {
  await connection();
  const query = normalizeQuery(rawQuery);
  if (!query) return { items: [], page: 1, totalPages: 1, total: 0 };

  const settings = await getSiteSettings();
  const perPage = settings.defaultPageSize || PAGE_SIZE;
  const where = searchCondition(query);
  const { rows: countRows } = await sql<{ total: number }>`
    SELECT count(*)::int AS total FROM media WHERE ${where}`.execute(executor);
  const total = countRows[0]?.total ?? 0;
  if (total === 0) {
    const close = await fuzzyTitles(query, perPage, executor);
    if (close.length > 0) {
      return { items: close.map(toMedia), page: 1, totalPages: 1, total: close.length, fuzzy: true };
    }
  }
  const { page, totalPages, skip } = pageWindow(total, requestedPage, perPage);
  const { rows } = await sql<CardRow>`
    SELECT ${CARD_COLUMNS_SQL} FROM media WHERE ${where}
    ORDER BY ${titleMatchOrder(query)}
    LIMIT ${perPage} OFFSET ${skip}`.execute(executor);
  return { items: rows.map(toMedia), page, totalPages, total };
}

/**
 * The header's live search: the first few of the titles the search page
 * finds, in its order, and how many it finds in all (the spelled-closest
 * ones when none match as typed, as on the search page), and the people
 * named on published titles whose names match.
 */
export async function suggestTitles(
  rawQuery: string,
  executor: Kysely<DB> = database
): Promise<{ items: SearchSuggestion[]; total: number; people: string[]; fuzzy: boolean }> {
  await connection();
  const query = normalizeQuery(rawQuery);
  if (!query) return { items: [], total: 0, people: [], fuzzy: false };
  const where = searchCondition(query);
  const [{ rows: items }, { rows: countRows }, people] = await Promise.all([
    sql<SearchSuggestion>`
      SELECT id, type::text AS type, title, year, "posterUrl" FROM media WHERE ${where}
      ORDER BY ${titleMatchOrder(query)}
      LIMIT ${MAX_SUGGESTIONS}`.execute(executor),
    sql<{ total: number }>`SELECT count(*)::int AS total FROM media WHERE ${where}`.execute(executor),
    suggestPeople(query, executor),
  ]);
  const total = countRows[0]?.total ?? 0;
  if (total === 0) {
    const settings = await getSiteSettings();
    const close = await fuzzyTitles(query, settings.defaultPageSize || PAGE_SIZE, executor);
    if (close.length > 0) {
      const suggestions = close.slice(0, MAX_SUGGESTIONS).map(({ id, type, title, year, posterUrl }) => ({
        id,
        type,
        title,
        year,
        posterUrl,
      }));
      return { items: suggestions, total: close.length, people, fuzzy: true };
    }
  }
  return { items, total, people, fuzzy: false };
}

/**
 * People named on published titles (cast, directors, creators) whose
 * names have the query, those starting with it first; or, when none do,
 * the names spelled closest to it. At most MAX_PEOPLE_SUGGESTIONS.
 */
async function suggestPeople(
  query: string,
  executor: Kysely<DB> = database
): Promise<string[]> {
  const escaped = escapeLike(query);
  const { rows } = await sql<{ name: string }>`
    SELECT name FROM (
      SELECT DISTINCT name FROM (
        SELECT unnest("cast") AS name FROM media WHERE status = 'published' AND "trashedAt" IS NULL
        UNION SELECT director FROM media WHERE status = 'published' AND "trashedAt" IS NULL
        UNION SELECT creator FROM media WHERE status = 'published' AND "trashedAt" IS NULL
      ) named
      WHERE name ILIKE ${`%${escaped}%`}
    ) people
    ORDER BY (name ILIKE ${`${escaped}%`}) DESC, lower(name)
    LIMIT ${MAX_PEOPLE_SUGGESTIONS}`.execute(executor);
  if (rows.length > 0 || allowedTypos(query.length) === 0) return rows.map((row) => row.name);
  return fuzzyMatches(query, await listPublishedPeople(executor), (name) => name, MAX_PEOPLE_SUGGESTIONS);
}

// --- Titles and episodes ------------------------------------------------------

/*
 * A title's page reads it twice, for its <head> (generateMetadata) and
 * for the page itself; cache() makes that one query per request.
 */

/** A published title with its episodes, and whether it's "Most liked", or null. */
export const getTitle = cache(
  async (id: string, executor: Kysely<DB> = database): Promise<MediaDetail | null> => {
    await connection();
    if (!isMediaId(id)) return null;
    const [row, ratings] = await Promise.all([
      executor
        .selectFrom("media")
        .selectAll("media")
        .select((eb) => [
          jsonArrayFrom(
            eb
              .selectFrom("episode")
              .selectAll("episode")
              .whereRef("episode.mediaId", "=", "media.id")
              .orderBy("episode.seasonNumber", "asc")
              .orderBy("episode.episodeNumber", "asc")
          ).as("episodes"),
        ])
        .where("media.id", "=", id)
        .where("media.status", "=", "published")
        .where("media.trashedAt", "is", null)
        .executeTakeFirst(),
      executor
        .selectFrom("media_rating")
        .select(["value", (eb) => eb.fn.countAll<string>().as("count")])
        .where("mediaId", "=", id)
        .groupBy("value")
        .execute(),
    ]);
    if (!row) return null;
    const count = (values: Rating[]) =>
      ratings.reduce(
        (sum, group) => sum + (values.includes(group.value as Rating) ? Number(group.count) : 0),
        0
      );
    return {
      ...toDetail(row),
      mostLiked: isMostLiked({ liked: count(["like", "love"]), total: count([...RATINGS]) }),
    };
  }
);

/** An episode of a published series, with the series, or null. */
export const getEpisode = cache(
  async (
    id: string,
    executor: Kysely<DB> = database
  ): Promise<{ episode: Episode; series: MediaDetail } | null> => {
    await connection();
    if (!isMediaId(id)) return null;
    const row = await executor
      .selectFrom("episode")
      .selectAll("episode")
      .select((eb) => [
        jsonObjectFrom(
          eb
            .selectFrom("media")
            .selectAll("media")
            .select((mb) => [
              jsonArrayFrom(
                mb
                  .selectFrom("episode as other")
                  .selectAll("other")
                  .whereRef("other.mediaId", "=", "media.id")
                  .orderBy("other.seasonNumber", "asc")
                  .orderBy("other.episodeNumber", "asc")
              ).as("episodes"),
            ])
            .whereRef("media.id", "=", "episode.mediaId")
        ).as("media"),
      ])
      .where("episode.id", "=", id)
      .executeTakeFirst();

    if (!row || !row.media || row.media.status !== "published" || row.media.trashedAt !== null) {
      return null;
    }
    return { episode: toEpisode(row), series: toDetail(row.media) };
  }
);

// --- Collections ---------------------------------------------------------------

/** A collection as /collections and the home page show it: published titles only. */
export type CollectionCard = {
  id: string;
  title: string;
  description: string;
  /** Its published titles, in the collection's order. */
  media: Media[];
};

/** Home shows this many collection rows at most. */
const HOME_COLLECTIONS = 3;

async function collectionCards(
  options: {
    id?: string;
    onHome?: boolean;
    take?: number;
    titles?: number;
  } = {},
  executor: Kysely<DB> = database
): Promise<CollectionCard[]> {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  let query = executor
    .selectFrom("collection")
    .select([
      "collection.id",
      "collection.title",
      "collection.description",
    ])
    .select((eb) => [
      jsonArrayFrom(
        eb
          .selectFrom("collection_item")
          .innerJoin("media", "media.id", "collection_item.mediaId")
          .select([
            "media.id",
            "media.type",
            "media.title",
            "media.year",
            "media.duration",
            "media.genres",
            "media.posterUrl",
            "media.gradient",
            "media.category",
            "media.createdAt",
            "media.publishedAt",
          ])
          .whereRef("collection_item.collectionId", "=", "collection.id")
          .where("media.status", "=", "published")
          .where("media.trashedAt", "is", null)
          .orderBy("collection_item.position", "asc")
          .orderBy("collection_item.addedAt", "asc")
          .$if(options.titles !== undefined, (qb) => qb.limit(options.titles!))
      ).as("items"),
    ])
    .where("collection.published", "=", true)
    .where((eb) =>
      eb.or([
        eb("collection.startsAt", "is", null),
        eb("collection.startsAt", "<=", today),
      ])
    )
    .where((eb) =>
      eb.or([
        eb("collection.endsAt", "is", null),
        eb("collection.endsAt", ">=", today),
      ])
    )
    .where((eb) =>
      eb.exists(
        eb
          .selectFrom("collection_item")
          .innerJoin("media", "media.id", "collection_item.mediaId")
          .whereRef("collection_item.collectionId", "=", "collection.id")
          .where("media.status", "=", "published")
          .where("media.trashedAt", "is", null)
      )
    )
    .orderBy("collection.position", "asc")
    .orderBy("collection.title", "asc");

  if (options.id) {
    query = query.where("collection.id", "=", options.id);
  }
  if (options.onHome !== undefined) {
    query = query.where("collection.onHome", "=", options.onHome);
  }
  if (options.take !== undefined) {
    query = query.limit(options.take);
  }

  const rows = await query.execute();
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    media: (row.items ?? []).map((m) => toMedia(m as unknown as CardRow)),
  }));
}

/** /collections: every collection showing today with a published title, in the admins' order. */
export async function listCollections(executor: Kysely<DB> = database): Promise<CollectionCard[]> {
  await connection();
  return collectionCards({ titles: 4 }, executor);
}

/** The home page's collection rows: those marked for it, showing today. */
export async function listHomeCollections(executor: Kysely<DB> = database): Promise<CollectionCard[]> {
  await connection();
  return collectionCards({ onHome: true, take: HOME_COLLECTIONS, titles: ROW_SIZE }, executor);
}

/** /collections/[id]: a collection showing today, with its published titles, or null. */
export async function getCollection(id: string, executor: Kysely<DB> = database): Promise<CollectionCard | null> {
  await connection();
  if (!isMediaId(id)) return null;
  const [collection] = await collectionCards({ id }, executor);
  return collection ?? null;
}

/** Every showing collection's address, for the sitemap. */
export async function listCollectionIds(executor: Kysely<DB> = database): Promise<string[]> {
  await connection();
  return (await listCollections(executor)).map((collection) => collection.id);
}

/** Admin: every collection, with how many titles it holds. */
export async function listCollectionsForAdmin(executor: Kysely<DB> = database) {
  await connection();
  await requireAdmin();
  const rows = await executor
    .selectFrom("collection")
    .selectAll("collection")
    .select((eb) => [
      eb
        .selectFrom("collection_item")
        .select((ib) => ib.fn.countAll().as("count"))
        .whereRef("collection_item.collectionId", "=", "collection.id")
        .as("itemCount"),
    ])
    .orderBy("position", "asc")
    .orderBy("title", "asc")
    .execute();

  return rows.map((row) => {
    const { itemCount, ...rest } = row;
    const count = Number(itemCount ?? 0);
    return {
      ...rest,
      _count: { items: count },
      itemCount: count,
    };
  });
}

/** Admin: one collection with all its titles (drafts and trashed ones too), in order. */
export async function getCollectionForEdit(id: string, executor: Kysely<DB> = database) {
  await connection();
  await requireAdmin();
  if (!isMediaId(id)) return null;

  const collection = await executor
    .selectFrom("collection")
    .selectAll("collection")
    .select((eb) => [
      jsonArrayFrom(
        eb
          .selectFrom("collection_item")
          .select((ib) => [
            "collection_item.mediaId",
            jsonObjectFrom(
              ib
                .selectFrom("media")
                .select([
                  "media.id",
                  "media.title",
                  "media.year",
                  "media.type",
                  "media.status",
                  "media.trashedAt",
                ])
                .whereRef("media.id", "=", "collection_item.mediaId")
            ).as("media"),
          ])
          .whereRef("collection_item.collectionId", "=", "collection.id")
          .orderBy("collection_item.position", "asc")
          .orderBy("collection_item.addedAt", "asc")
      ).as("items"),
    ])
    .where("collection.id", "=", id)
    .executeTakeFirst();

  if (!collection) return null;

  return {
    ...collection,
    items: collection.items
      .filter((item): item is typeof item & { media: NonNullable<typeof item.media> } => item.media !== null),
  };
}

/** Admin: titles (not in the trash) whose name has `query`, to add to a collection. */
export async function searchTitlesForCollection(query: string, executor: Kysely<DB> = database) {
  await connection();
  await requireAdmin();
  const text = query.trim().slice(0, 100);
  if (!text) return [];
  return executor
    .selectFrom("media")
    .select(["id", "title", "year", "type", "status"])
    .where("trashedAt", "is", null)
    .where("title", "ilike", `%${escapeLike(text)}%`)
    .orderBy("title", "asc")
    .orderBy("year", "desc")
    .limit(20)
    .execute();
}

// --- Reports -----------------------------------------------------------------

/**
 * The name a report is filed under: a published title's, or "Series:
 * Episode" for an episode of one. Null when there's no such title, so
 * the browser can't file reports under made-up names.
 */
export async function findReportTitle(mediaId: string, executor: Kysely<DB> = database): Promise<string | null> {
  await connection();
  const media = await executor
    .selectFrom("media")
    .select("title")
    .where("id", "=", mediaId)
    .where("status", "=", "published")
    .where("trashedAt", "is", null)
    .executeTakeFirst();
  if (media) return media.title;

  const episode = await executor
    .selectFrom("episode")
    .innerJoin("media", "media.id", "episode.mediaId")
    .select(["episode.title as episodeTitle", "media.title as seriesTitle", "media.status", "media.trashedAt"])
    .where("episode.id", "=", mediaId)
    .executeTakeFirst();

  return episode && episode.status === "published" && !episode.trashedAt
    ? `${episode.seriesTitle}: ${episode.episodeTitle}`
    : null;
}

/** Which of these ids are episodes (their player is /episode/[id]). */
export async function findEpisodeIds(ids: string[], executor: Kysely<DB> = database): Promise<Set<string>> {
  await connection();
  if (ids.length === 0) return new Set();
  const rows = await executor
    .selectFrom("episode")
    .select("id")
    .where("id", "in", ids)
    .execute();
  return new Set(rows.map((row) => row.id));
}

/**
 * Which of these ids are still on the public site: published titles, and
 * episodes of published series. Saved favorites, history and lists hide
 * the rest (src/lib/library.ts), so they never lead to a 404.
 */
export async function findPublishedIds(ids: string[], executor: Kysely<DB> = database): Promise<Set<string>> {
  await connection();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Set();
  const [titles, episodes] = await Promise.all([
    executor
      .selectFrom("media")
      .select("id")
      .where("id", "in", unique)
      .where("status", "=", "published")
      .where("trashedAt", "is", null)
      .execute(),
    executor
      .selectFrom("episode")
      .innerJoin("media", "media.id", "episode.mediaId")
      .select("episode.id")
      .where("episode.id", "in", unique)
      .where("media.status", "=", "published")
      .where("media.trashedAt", "is", null)
      .execute(),
  ]);
  return new Set([...titles, ...episodes].map((row) => row.id));
}

// --- Ratings -----------------------------------------------------------------

/**
 * Whether `id` is a title members can rate (src/lib/rating-actions.ts):
 * a published movie or series. Episodes are rated through their series.
 */
export async function isRatableTitle(id: string, executor: Kysely<DB> = database): Promise<boolean> {
  await connection();
  if (!isMediaId(id)) return false;
  const countRow = await executor
    .selectFrom("media")
    .select((eb) => eb.fn.countAll().as("count"))
    .where("id", "=", id)
    .where("status", "=", "published")
    .where("trashedAt", "is", null)
    .executeTakeFirst();
  return (countRow ? countOf(countRow) : 0) > 0;
}

// --- Views -------------------------------------------------------------------

/**
 * The title a Play press counts a view for (src/lib/view-actions.ts):
 * a published movie, or the published series of an episode. Null for
 * anything else.
 */
export async function findViewTarget(id: string, executor: Kysely<DB> = database): Promise<string | null> {
  await connection();
  if (!isMediaId(id)) return null;
  const movie = await executor
    .selectFrom("media")
    .select("id")
    .where("id", "=", id)
    .where("status", "=", "published")
    .where("trashedAt", "is", null)
    .where("type", "=", "movie")
    .executeTakeFirst();
  if (movie) return movie.id;

  const episode = await executor
    .selectFrom("episode")
    .innerJoin("media", "media.id", "episode.mediaId")
    .select(["media.id as mediaId", "media.status", "media.trashedAt"])
    .where("episode.id", "=", id)
    .executeTakeFirst();

  return episode && episode.status === "published" && !episode.trashedAt ? episode.mediaId : null;
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
  target: { mediaId: string } | { episodeId: string },
  executor: Kysely<DB> = database
): Promise<VideoSourceEntry[]> {
  await connection();
  const id = "mediaId" in target ? target.mediaId : target.episodeId;
  if (!isMediaId(id)) return [];

  const rows =
    "mediaId" in target
      ? await executor
          .selectFrom("video_source")
          .innerJoin("media", "media.id", "video_source.mediaId")
          .select([
            "video_source.id",
            "video_source.label",
            "video_source.kind",
            "video_source.url",
          ])
          .where("video_source.mediaId", "=", id)
          .where("video_source.enabled", "=", true)
          .where("media.status", "=", "published")
          .where("media.trashedAt", "is", null)
          .where("media.type", "=", "movie")
          .orderBy("video_source.position", "asc")
          .orderBy("video_source.id", "asc")
          .execute()
      : await executor
          .selectFrom("video_source")
          .innerJoin("episode", "episode.id", "video_source.episodeId")
          .innerJoin("media", "media.id", "episode.mediaId")
          .select([
            "video_source.id",
            "video_source.label",
            "video_source.kind",
            "video_source.url",
          ])
          .where("video_source.episodeId", "=", id)
          .where("video_source.enabled", "=", true)
          .where("media.status", "=", "published")
          .where("media.trashedAt", "is", null)
          .orderBy("video_source.position", "asc")
          .orderBy("video_source.id", "asc")
          .execute();

  const hosts = videoHosts();
  return rows.filter((row) => videoUrlAllowed(row.url, hosts));
}

/**
 * A movie's or an episode's subtitles, for the player's <track>s: one per
 * language, named for its menu, A to Z. Only a published title's.
 */
export async function getSubtitles(
  target: { mediaId: string } | { episodeId: string },
  executor: Kysely<DB> = database
): Promise<SubtitleTrack[]> {
  await connection();
  const id = "mediaId" in target ? target.mediaId : target.episodeId;
  if (!isMediaId(id)) return [];

  const rows =
    "mediaId" in target
      ? await executor
          .selectFrom("subtitle")
          .innerJoin("media", "media.id", "subtitle.mediaId")
          .select(["subtitle.id", "subtitle.language", "subtitle.fileName"])
          .where("subtitle.mediaId", "=", id)
          .where("media.status", "=", "published")
          .where("media.trashedAt", "is", null)
          .where("media.type", "=", "movie")
          .orderBy("subtitle.language", "asc")
          .execute()
      : await executor
          .selectFrom("subtitle")
          .innerJoin("episode", "episode.id", "subtitle.episodeId")
          .innerJoin("media", "media.id", "episode.mediaId")
          .select(["subtitle.id", "subtitle.language", "subtitle.fileName"])
          .where("subtitle.episodeId", "=", id)
          .where("media.status", "=", "published")
          .where("media.trashedAt", "is", null)
          .orderBy("subtitle.language", "asc")
          .execute();

  return rows
    .map((row) => ({ id: row.id, language: row.language, label: languageName(row.language) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** A subtitle file as WebVTT (src/app/subtitles/[id]), if its title is published. */
export async function getSubtitleFile(
  id: string,
  executor: Kysely<DB> = database
): Promise<string | null> {
  await connection();
  if (!SUBTITLE_ID.test(id)) return null;

  const row = await executor
    .selectFrom("subtitle")
    .leftJoin("media as movie", "movie.id", "subtitle.mediaId")
    .leftJoin("episode", "episode.id", "subtitle.episodeId")
    .leftJoin("media as series", "series.id", "episode.mediaId")
    .select("subtitle.content")
    .where("subtitle.id", "=", id)
    .where((eb) =>
      eb.or([
        eb.and([
          eb("subtitle.mediaId", "is not", null),
          eb("movie.status", "=", "published"),
          eb("movie.trashedAt", "is", null),
          eb("movie.type", "=", "movie"),
        ]),
        eb.and([
          eb("subtitle.episodeId", "is not", null),
          eb("series.status", "=", "published"),
          eb("series.trashedAt", "is", null),
        ]),
      ])
    )
    .executeTakeFirst();

  return row?.content ?? null;
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
export async function listLibrary(
  {
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
  },
  executor: Kysely<DB> = database
) {
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

  let baseQuery = executor
    .selectFrom("media")
    .where("type", "=", type)
    .where("trashedAt", "is", null);

  if (status) {
    baseQuery = baseQuery.where("status", "=", status);
  }
  if (search) {
    baseQuery = baseQuery.where("title", "ilike", `%${escapeLike(search)}%`);
  }
  if (genre) {
    baseQuery = baseQuery.where(sql<boolean>`${genre} = ANY(genres)`);
  }

  if (audit === "missing-video" || audit === "no-video") {
    if (type === "movie") {
      baseQuery = baseQuery
        .where((eb) =>
          eb.not(
            eb.exists(
              eb
                .selectFrom("video_source")
                .whereRef("video_source.mediaId", "=", "media.id")
                .where("video_source.enabled", "=", true)
            )
          )
        )
        .where("status", "=", "published");
    } else {
      baseQuery = baseQuery
        .where((eb) =>
          eb.not(
            eb.exists(
              eb
                .selectFrom("episode")
                .innerJoin("video_source", "video_source.episodeId", "episode.id")
                .whereRef("episode.mediaId", "=", "media.id")
                .where("video_source.enabled", "=", true)
            )
          )
        )
        .where("status", "=", "published");
    }
  } else if (audit === "missing-backdrop" || audit === "no-backdrop") {
    baseQuery = baseQuery.where((eb) =>
      eb.or([eb("backdropUrl", "is", null), eb("backdropUrl", "=", "")])
    );
  } else if (audit === "empty-series") {
    baseQuery = baseQuery.where((eb) =>
      eb.not(
        eb.exists(
          eb.selectFrom("episode").whereRef("episode.mediaId", "=", "media.id")
        )
      )
    );
  } else if (audit === "stale-drafts") {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    baseQuery = baseQuery
      .where("status", "=", "draft")
      .where("createdAt", "<=", twoWeeksAgo);
  }

  const countRow = await baseQuery
    .select((eb) => eb.fn.countAll().as("count"))
    .executeTakeFirst();
  const total = countRow ? countOf(countRow) : 0;
  const { page, totalPages, skip } = pageWindow(total, requestedPage, pageSize);

  let queryBuilder = baseQuery.select([
    "media.id",
    "media.title",
    "media.year",
    "media.type",
    "media.status",
    "media.posterUrl",
    "media.backdropUrl",
    "media.duration",
    "media.genres",
    "media.tags",
    "media.tagline",
    "media.rating",
    "media.viewCount",
    "media.featured",
    "media.publishedAt",
    "media.createdAt",
    "media.updatedAt",
    (eb) =>
      eb
        .selectFrom("video_source")
        .select((ib) => ib.fn.countAll().as("count"))
        .whereRef("video_source.mediaId", "=", "media.id")
        .where("video_source.enabled", "=", true)
        .as("videoSourcesCount"),
    (eb) =>
      eb
        .selectFrom("episode")
        .select((ib) => ib.fn.countAll().as("count"))
        .whereRef("episode.mediaId", "=", "media.id")
        .as("episodesCount"),
  ]);

  if (sort === "title") {
    queryBuilder = queryBuilder.orderBy("title", order).orderBy("id", "desc");
  } else if (sort === "year") {
    queryBuilder = queryBuilder.orderBy("year", order).orderBy("id", "desc");
  } else if (sort === "status") {
    queryBuilder = queryBuilder.orderBy("status", order).orderBy("id", "desc");
  } else if (sort === "viewCount") {
    queryBuilder = queryBuilder.orderBy("viewCount", order).orderBy("id", "desc");
  } else if (sort === "publishedAt") {
    queryBuilder = queryBuilder.orderBy("publishedAt", order).orderBy("id", "desc");
  } else if (sort === "updatedAt") {
    queryBuilder = queryBuilder.orderBy("updatedAt", order).orderBy("id", "desc");
  } else {
    queryBuilder = queryBuilder.orderBy("createdAt", order).orderBy("id", "desc");
  }

  const rows = await queryBuilder.offset(skip).limit(pageSize).execute();

  const seasons = new Map<string, number>();
  if (type === "series" && rows.length > 0) {
    const groups = await executor
      .selectFrom("episode")
      .select(["mediaId", "seasonNumber"])
      .distinct()
      .where("mediaId", "in", rows.map((row) => row.id))
      .execute();
    for (const group of groups) {
      seasons.set(group.mediaId, (seasons.get(group.mediaId) ?? 0) + 1);
    }
  }

  const items: LibraryRow[] = rows.map((row) => {
    const epCount = Number(row.episodesCount ?? 0);
    return {
      id: row.id,
      title: row.title,
      year: row.year,
      type: row.type,
      status: row.status,
      posterUrl: row.posterUrl,
      backdropUrl: row.backdropUrl,
      duration: row.duration,
      genres: row.genres ?? undefined,
      tags: row.tags ?? undefined,
      tagline: row.tagline,
      rating: row.rating,
      viewCount: row.viewCount,
      featured: row.featured,
      publishedAt: row.publishedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      videoSourcesCount: Number(row.videoSourcesCount ?? 0),
      ...(epCount > 0 ? { seasons: seasons.get(row.id), episodes: epCount } : {}),
    };
  });
  return { items, page, totalPages, total, sort, order, audit, pageSize };
}

// --- Admin editor ---------------------------------------------------------------
// Everything here includes drafts and trashed titles, so each one checks
// for an admin itself.

/** A title with its episodes and a movie's video sources and subtitles, for its edit page. */
export async function getTitleForEdit(id: string, executor: Kysely<DB> = database) {
  await requireAdmin();
  await connection();
  if (!isMediaId(id)) return null;
  const row = await executor
    .selectFrom("media")
    .selectAll("media")
    .select((eb) => [
      jsonArrayFrom(
        eb
          .selectFrom("episode")
          .selectAll("episode")
          .whereRef("episode.mediaId", "=", "media.id")
          .orderBy("episode.seasonNumber", "asc")
          .orderBy("episode.episodeNumber", "asc")
      ).as("episodes"),
      jsonArrayFrom(
        eb
          .selectFrom("video_source")
          .selectAll("video_source")
          .whereRef("video_source.mediaId", "=", "media.id")
          .orderBy("video_source.position", "asc")
          .orderBy("video_source.id", "asc")
      ).as("videoSources"),
      jsonArrayFrom(
        eb
          .selectFrom("subtitle")
          .select(["subtitle.id", "subtitle.language", "subtitle.fileName", "subtitle.createdAt"])
          .whereRef("subtitle.mediaId", "=", "media.id")
      ).as("subtitles"),
    ])
    .where("media.id", "=", id)
    .executeTakeFirst();
  if (!row) return null;

  return {
    ...row,
    genres: row.genres ?? [],
    cast: row.cast ?? [],
    tags: row.tags ?? [],
    contentNotes: row.contentNotes ?? [],
    subtitles: (row.subtitles ?? []).map((s) => ({
      ...s,
      createdAt: new Date(s.createdAt),
    })),
  };
}

/** The series an episode can be added to (not trashed), A to Z. */
export async function listSeriesChoices(executor: Kysely<DB> = database) {
  await requireAdmin();
  await connection();
  return executor
    .selectFrom("media")
    .select(["id", "title"])
    .where("type", "=", "series")
    .where("trashedAt", "is", null)
    .orderBy("title", "asc")
    .orderBy("id", "asc")
    .execute();
}

/** A series' last episode (highest season, then episode), or null. */
export async function getLastEpisode(seriesId: string, executor: Kysely<DB> = database) {
  await requireAdmin();
  await connection();
  const row = await executor
    .selectFrom("episode")
    .select(["seasonNumber", "episodeNumber"])
    .where("mediaId", "=", seriesId)
    .orderBy("seasonNumber", "desc")
    .orderBy("episodeNumber", "desc")
    .executeTakeFirst();
  return row ?? null;
}

/** /admin/library/episodes: one page of episodes, of one series or all. */
export type EpisodeSort = "title" | "series" | "season" | "episode" | "airDate";

export async function listEpisodes(
  {
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
  },
  executor: Kysely<DB> = database
) {
  await requireAdmin();
  await connection();
  const search = normalizeQuery(query);
  let baseQuery = executor
    .selectFrom("episode")
    .innerJoin("media", "media.id", "episode.mediaId")
    .where("media.trashedAt", "is", null);

  if (seriesId) {
    baseQuery = baseQuery.where("episode.mediaId", "=", seriesId);
  }
  if (search) {
    baseQuery = baseQuery.where("episode.title", "ilike", `%${escapeLike(search)}%`);
  }

  const countRow = await baseQuery
    .select((eb) => eb.fn.countAll().as("count"))
    .executeTakeFirst();
  const total = countRow ? countOf(countRow) : 0;
  const { page, totalPages, skip } = pageWindow(total, requestedPage, pageSize);

  const episodeColumns = [
    "episode.id",
    "episode.mediaId",
    "episode.seasonNumber",
    "episode.episodeNumber",
    "episode.title",
    "episode.duration",
    "episode.airDate",
    "episode.stillUrl",
    "episode.synopsis",
    "media.title as seriesTitle",
  ] as const;

  let queryBuilder = baseQuery.select(episodeColumns);

  if (sort === "title") {
    queryBuilder = queryBuilder.orderBy("episode.title", order).orderBy("episode.id", "asc");
  } else if (sort === "season") {
    queryBuilder = queryBuilder
      .orderBy("episode.seasonNumber", order)
      .orderBy("episode.episodeNumber", order)
      .orderBy("episode.id", "asc");
  } else if (sort === "episode") {
    queryBuilder = queryBuilder
      .orderBy("episode.episodeNumber", order)
      .orderBy("episode.seasonNumber", order)
      .orderBy("episode.id", "asc");
  } else if (sort === "airDate") {
    queryBuilder = queryBuilder.orderBy("episode.airDate", order).orderBy("episode.id", "asc");
  } else {
    queryBuilder = queryBuilder
      .orderBy("media.title", order)
      .orderBy("episode.mediaId", "asc")
      .orderBy("episode.seasonNumber", "asc")
      .orderBy("episode.episodeNumber", "asc");
  }

  const rows = await queryBuilder.offset(skip).limit(pageSize).execute();
  const items = rows.map(({ seriesTitle, ...rest }) => ({
    ...rest,
    media: { title: seriesTitle },
  }));
  return { items, page, totalPages, total };
}

/** An episode with its series, video sources and subtitles, for its edit page. */
export async function getEpisodeForEdit(id: string, executor: Kysely<DB> = database) {
  await requireAdmin();
  await connection();
  if (!isMediaId(id)) return null;
  const row = await executor
    .selectFrom("episode")
    .selectAll("episode")
    .select((eb) => [
      jsonObjectFrom(
        eb
          .selectFrom("media")
          .select(["id", "title", "trashedAt"])
          .whereRef("media.id", "=", "episode.mediaId")
      ).as("media"),
      jsonArrayFrom(
        eb
          .selectFrom("video_source")
          .selectAll("video_source")
          .whereRef("video_source.episodeId", "=", "episode.id")
          .orderBy("video_source.position", "asc")
          .orderBy("video_source.id", "asc")
      ).as("videoSources"),
      jsonArrayFrom(
        eb
          .selectFrom("subtitle")
          .select(["subtitle.id", "subtitle.language", "subtitle.fileName", "subtitle.createdAt"])
          .whereRef("subtitle.episodeId", "=", "episode.id")
      ).as("subtitles"),
    ])
    .where("episode.id", "=", id)
    .executeTakeFirst();
  if (!row || !row.media) return null;

  return {
    ...row,
    media: row.media,
    subtitles: (row.subtitles ?? []).map((s) => ({
      ...s,
      createdAt: new Date(s.createdAt),
    })),
  };
}

/**
 * Titles already imported from these TMDB or IMDb ids (media.tmdbId and
 * media.imdbId), trashed ones included, so the Import page links to them
 * instead of bringing in a copy.
 */
export async function findImported(
  { tmdbIds, imdbIds }: { tmdbIds: string[]; imdbIds: string[] },
  executor: Kysely<DB> = database
) {
  await requireAdmin();
  await connection();
  if (tmdbIds.length === 0 && imdbIds.length === 0) return [];
  let query = executor
    .selectFrom("media")
    .select(["id", "type", "title", "trashedAt", "tmdbId", "imdbId"]);

  if (tmdbIds.length > 0 && imdbIds.length > 0) {
    query = query.where((eb) =>
      eb.or([eb("tmdbId", "in", tmdbIds), eb("imdbId", "in", imdbIds)])
    );
  } else if (tmdbIds.length > 0) {
    query = query.where("tmdbId", "in", tmdbIds);
  } else {
    query = query.where("imdbId", "in", imdbIds);
  }

  return query.execute();
}

/** /admin/trash: titles moved to the trash, with search and sorting support. */
export async function listTrash(
  {
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
  },
  executor: Kysely<DB> = database
) {
  await requireAdmin();
  await connection();
  const search = normalizeQuery(query);
  let baseQuery = executor.selectFrom("media").where("trashedAt", "is not", null);
  if (search) {
    baseQuery = baseQuery.where("title", "ilike", `%${escapeLike(search)}%`);
  }

  const countRow = await baseQuery
    .select((eb) => eb.fn.countAll().as("count"))
    .executeTakeFirst();
  const total = countRow ? countOf(countRow) : 0;
  const { page, totalPages, skip } = pageWindow(total, requestedPage, pageSize);

  let queryBuilder = baseQuery.select([
    "id",
    "type",
    "title",
    "year",
    "trashedAt",
    "statusBeforeTrash",
    (eb) =>
      eb
        .selectFrom("episode")
        .select((ib) => ib.fn.countAll().as("count"))
        .whereRef("episode.mediaId", "=", "media.id")
        .as("episodesCount"),
  ]);

  if (sort === "title") {
    queryBuilder = queryBuilder.orderBy("title", order).orderBy("id", "asc");
  } else if (sort === "year") {
    queryBuilder = queryBuilder.orderBy("year", order).orderBy("id", "asc");
  } else {
    queryBuilder = queryBuilder.orderBy("trashedAt", order).orderBy("id", "asc");
  }

  const rows = await queryBuilder.offset(skip).limit(pageSize).execute();
  const items = rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    year: r.year,
    trashedAt: r.trashedAt,
    statusBeforeTrash: r.statusBeforeTrash,
    _count: { episodes: Number(r.episodesCount ?? 0) },
  }));
  return { items, page, totalPages, total };
}

/** Admin-only draft preview for titles before they are published. */
export async function getDraftTitleForPreview(
  id: string,
  executor: Kysely<DB> = database
): Promise<(MediaDetail & { status: MediaStatus }) | null> {
  await requireAdmin();
  await connection();
  if (!isMediaId(id)) return null;
  const row = await executor
    .selectFrom("media")
    .selectAll("media")
    .select((eb) => [
      jsonArrayFrom(
        eb
          .selectFrom("episode")
          .selectAll("episode")
          .whereRef("episode.mediaId", "=", "media.id")
          .orderBy("episode.seasonNumber", "asc")
          .orderBy("episode.episodeNumber", "asc")
      ).as("episodes"),
    ])
    .where("id", "=", id)
    .executeTakeFirst();
  return row ? { ...toDetail(row), status: row.status } : null;
}

/** How many titles the dashboard lists under Most played and Recently added. */
const DASHBOARD_LIST_SIZE = 5;

/**
 * /admin/dashboard: the catalog at a glance. Titles by type and status
 * (not counting the trash), plays in Trending's window and the titles
 * played most in it, and the titles added last, drafts included.
 */
export async function getCatalogOverview(executor: Kysely<DB> = database) {
  await requireAdmin();
  await connection();
  const [groups, playCountRow, mostPlayed, recentlyAdded] = await Promise.all([
    executor
      .selectFrom("media")
      .select(["type", "status", (eb) => eb.fn.countAll().as("count")])
      .where("trashedAt", "is", null)
      .groupBy(["type", "status"])
      .execute(),
    executor
      .selectFrom("media_view")
      .innerJoin("media", "media.id", "media_view.mediaId")
      .select((eb) => eb.fn.countAll().as("count"))
      .where("media_view.day", ">=", new Date(trendingSince(new Date())))
      .where("media.status", "=", "published")
      .where("media.trashedAt", "is", null)
      .executeTakeFirst(),
    trendingRows(DASHBOARD_LIST_SIZE, executor),
    executor
      .selectFrom("media")
      .select(["id", "type", "title", "status", "createdAt"])
      .where("trashedAt", "is", null)
      .orderBy("createdAt", "desc")
      .orderBy("id", "desc")
      .limit(DASHBOARD_LIST_SIZE)
      .execute(),
  ]);

  const count = (type: MediaType, status: MediaStatus) => {
    const found = groups.find((group) => group.type === type && group.status === status);
    return found ? countOf(found) : 0;
  };

  return {
    published: { movie: count("movie", "published"), series: count("series", "published") },
    drafts: { movie: count("movie", "draft"), series: count("series", "draft") },
    plays: playCountRow ? countOf(playCountRow) : 0,
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
export async function resolveEpisodeRedirect(
  slug: string,
  executor: Kysely<DB> = database
): Promise<string | null> {
  await connection();
  const seen = new Set([slug]);
  let currentSlug = slug;
  while (seen.size <= 10) {
    const redirect = await executor
      .selectFrom("episode_redirect")
      .select("newSlug")
      .where("oldSlug", "=", currentSlug)
      .executeTakeFirst();
    if (!redirect) break;
    if (seen.has(redirect.newSlug)) return null;
    seen.add(redirect.newSlug);
    currentSlug = redirect.newSlug;
  }
  return currentSlug === slug ? null : currentSlug;
}
