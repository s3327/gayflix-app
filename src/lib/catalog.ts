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

const PUBLISHED = { status: "published" } as const;

/** Home rows and "You Might Also Like" (listRecommendations). */
const ROW_SIZE = 12;
/** Top 10 This Week on the home page and New & Popular. */
const TOP_TEN_SIZE = 10;
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
    synopsis: row.synopsis || undefined,
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
    trailerUrl: row.trailerUrl ?? undefined,
    maturityRating: parseMaturity(row.maturityRating ?? "") ?? undefined,
    contentNotes: row.contentNotes ?? [],
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
export async function getHome() {
  await connection();
  const heroSelect = { ...CARD, synopsis: true, backdropUrl: true } satisfies Prisma.MediaSelect;
  const [featured, topTen, newReleases, movies, series] = await Promise.all([
    db.media.findFirst({
      where: { ...PUBLISHED, featured: true },
      orderBy: ORDER.added,
      select: heroSelect,
    }),
    trendingRows(TOP_TEN_SIZE),
    cards(PUBLISHED, ORDER.added, ROW_SIZE),
    cards({ ...PUBLISHED, type: "movie" }, ORDER.added, ROW_SIZE),
    cards({ ...PUBLISHED, type: "series" }, ORDER.added, ROW_SIZE),
  ]);
  const hero =
    featured ??
    (await db.media.findFirst({ where: PUBLISHED, orderBy: ORDER.added, select: heroSelect }));

  // The rest of the hero, in order: this week's most watched, then the
  // newest, each once, and only those with a backdrop to show.
  const candidates = [...new Set([...topTen, ...newReleases].map((row) => row.id))].filter(
    (id) => id !== hero?.id
  );
  const withBackdrops = candidates.length
    ? await db.media.findMany({
        where: { ...PUBLISHED, id: { in: candidates }, backdropUrl: { not: null } },
        select: heroSelect,
      })
    : [];
  const rest = withBackdrops
    .sort((a, b) => candidates.indexOf(a.id) - candidates.indexOf(b.id))
    .slice(0, HERO_SIZE - 1);
  const toFeatured = (row: NonNullable<typeof hero>): Featured => ({
    ...toMedia(row),
    synopsis: row.synopsis,
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
export async function getNewAndPopular() {
  await connection();
  const [topTen, recentlyAdded, mostWatched] = await Promise.all([
    trendingRows(TOP_TEN_SIZE),
    cards(PUBLISHED, ORDER.added, ROW_SIZE),
    cards(PUBLISHED, ORDER.popular, ROW_SIZE),
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
export async function listContinueWatching(): Promise<RecentlyWatched[]> {
  await connection();
  const session = await getSession();
  if (!session) return [];
  // History holds movie and episode ids; an episode stands for its
  // series. Some of these drop off below (watched to the end), so it
  // reads more than the row shows.
  const rows = await db.$queryRaw<
    (CardRow & {
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
    })[]
  >`
    SELECT ${CARD_COLUMNS}, "backdropUrl", "historyId", "progressSeconds", "durationSeconds",
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
    WHERE status = 'published' AND NOT latest."hiddenFromContinue"
    ORDER BY "watchedAt" DESC, id
    LIMIT ${CONTINUE_WATCHING_SIZE * 4}`;

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
      // Only an episode has a next one.
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
  }: { minScore?: number; excludeIds?: string[]; unwatchedBy?: string } = {}
) {
  return db.$queryRaw<CardRow[]>`
    WITH this AS (
      SELECT genres AS g, tags AS t, "cast" AS c, director AS d, creator AS cr, type AS ty
      FROM media WHERE id = ${id}
    )
    SELECT * FROM (
      SELECT ${CARD_COLUMNS}, "viewCount",
        3 * cardinality(ARRAY(SELECT unnest(genres) INTERSECT SELECT unnest(this.g)))
        + 2 * cardinality(ARRAY(SELECT unnest(tags) INTERSECT SELECT unnest(this.t)))
        + 2 * cardinality(ARRAY(SELECT unnest("cast") INTERSECT SELECT unnest(this.c)))
        + CASE WHEN director = this.d THEN 3 ELSE 0 END
        + CASE WHEN creator = this.cr THEN 3 ELSE 0 END
        + CASE WHEN type = this.ty THEN 1 ELSE 0 END AS score
      FROM media, this
      WHERE status = 'published' AND "trashedAt" IS NULL AND id <> ${id}
        AND NOT (id = ANY(${excludeIds}::text[]))
        ${
          unwatchedBy === undefined
            ? Prisma.empty
            : Prisma.sql`AND id NOT IN (
                -- History holds movie and episode ids; an episode stands for its series.
                SELECT COALESCE(e."mediaId", h."mediaId") FROM watch_history h
                LEFT JOIN episode e ON e.id = h."mediaId"
                WHERE h."userId" = ${unwatchedBy}
                UNION SELECT "mediaId" FROM media_rating WHERE "userId" = ${unwatchedBy}
              )`
        }
    ) related
    WHERE score >= ${minScore}
    ORDER BY score DESC, "viewCount" DESC, "publishedAt" DESC NULLS LAST, id
    LIMIT ${ROW_SIZE}`;
}

/**
 * "You Might Also Like" on a title's page: the other published titles
 * most like it (relatedRows). Titles that share nothing fill out the row.
 */
export async function listRecommendations(id: string): Promise<Media[]> {
  await connection();
  return (await relatedRows(id)).map(toMedia);
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
export async function listBecauseYouWatched(): Promise<BecauseYouWatched[]> {
  await connection();
  const session = await getSession();
  if (!session) return [];
  const userId = session.user.id;
  const seeds = await db.$queryRaw<BecauseYouWatched["seed"][]>`
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
    LIMIT ${BECAUSE_SEEDS}`;

  const rows: BecauseYouWatched[] = [];
  const shown: string[] = [];
  for (const seed of seeds) {
    const related = await relatedRows(seed.id, {
      minScore: BECAUSE_MIN_SCORE,
      excludeIds: shown,
      unwatchedBy: userId,
    });
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
export async function getPerson(name: string): Promise<PersonTitles | null> {
  await connection();
  const rows = await db.$queryRaw<
    (CardRow & { director: string | null; creator: string | null; cast: string[] | null })[]
  >`
    SELECT ${CARD_COLUMNS}, director, creator, "cast" FROM media
    WHERE status = 'published' AND "trashedAt" IS NULL
      AND (
        lower(director) = lower(${name})
        OR lower(creator) = lower(${name})
        OR EXISTS (SELECT 1 FROM unnest("cast") AS person WHERE lower(person) = lower(${name}))
      )
    ORDER BY year DESC, "publishedAt" DESC NULLS LAST, id
    LIMIT 300`;
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
export async function listPublishedPeople(): Promise<string[]> {
  await connection();
  const rows = await db.$queryRaw<{ name: string }[]>`
    SELECT DISTINCT name FROM (
      SELECT unnest("cast") AS name FROM media WHERE status = 'published' AND "trashedAt" IS NULL
      UNION SELECT director FROM media WHERE status = 'published' AND "trashedAt" IS NULL
      UNION SELECT creator FROM media WHERE status = 'published' AND "trashedAt" IS NULL
    ) people
    WHERE name IS NOT NULL AND trim(name) <> ''
    ORDER BY name`;
  return rows.map((row) => row.name);
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

/** Every episode of a published series, for the sitemap. */
export async function listPublishedEpisodes() {
  await connection();
  const rows = await db.episode.findMany({
    where: { media: PUBLISHED },
    orderBy: { id: "asc" },
    select: { id: true, media: { select: { updatedAt: true } } },
  });
  return rows.map((row) => ({ id: row.id, updatedAt: row.media.updatedAt }));
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

/** Fuzzy matching looks through at most this many titles (the catalog is far smaller). */
const FUZZY_POOL = 5000;

/**
 * When nothing matches as typed: the published titles whose names are
 * closest to the query, allowing a typo or two (fuzzyMatches in
 * src/lib/search.ts), at most `limit`. Done here rather than in the
 * database, which has no fuzzy matching built in.
 */
async function fuzzyTitles(query: string, limit: number): Promise<CardRow[]> {
  if (allowedTypos(query.length) === 0) return [];
  const rows = await db.media.findMany({
    where: PUBLISHED,
    orderBy: { viewCount: "desc" },
    take: FUZZY_POOL,
    select: CARD,
  });
  return fuzzyMatches(query, rows, (row) => row.title, limit);
}

/**
 * The search page: one page of matching published titles. When none
 * match as typed, the titles spelled closest to the query, on one page.
 */
export async function searchTitles(rawQuery: string, requestedPage: number): Promise<TitlePage> {
  await connection();
  const query = normalizeQuery(rawQuery);
  if (!query) return { items: [], page: 1, totalPages: 1, total: 0 };

  const settings = await getSiteSettings();
  const perPage = settings.defaultPageSize || PAGE_SIZE;
  const where = searchCondition(query);
  const [{ total }] = await db.$queryRaw<{ total: number }[]>`
    SELECT count(*)::int AS total FROM media WHERE ${where}`;
  if (total === 0) {
    const close = await fuzzyTitles(query, perPage);
    if (close.length > 0) {
      return { items: close.map(toMedia), page: 1, totalPages: 1, total: close.length, fuzzy: true };
    }
  }
  const { page, totalPages, skip } = pageWindow(total, requestedPage, perPage);
  const rows = await db.$queryRaw<CardRow[]>`
    SELECT ${CARD_COLUMNS} FROM media WHERE ${where}
    ORDER BY ${titleMatchOrder(query)}
    LIMIT ${perPage} OFFSET ${skip}`;
  return { items: rows.map(toMedia), page, totalPages, total };
}

/**
 * The header's live search: the first few of the titles the search page
 * finds, in its order, and how many it finds in all (the spelled-closest
 * ones when none match as typed, as on the search page), and the people
 * named on published titles whose names match.
 */
export async function suggestTitles(
  rawQuery: string
): Promise<{ items: SearchSuggestion[]; total: number; people: string[]; fuzzy: boolean }> {
  await connection();
  const query = normalizeQuery(rawQuery);
  if (!query) return { items: [], total: 0, people: [], fuzzy: false };
  const where = searchCondition(query);
  const [items, [{ total }], people] = await Promise.all([
    db.$queryRaw<SearchSuggestion[]>`
      SELECT id, type::text AS type, title, year, "posterUrl" FROM media WHERE ${where}
      ORDER BY ${titleMatchOrder(query)}
      LIMIT ${MAX_SUGGESTIONS}`,
    db.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total FROM media WHERE ${where}`,
    suggestPeople(query),
  ]);
  if (total === 0) {
    // As the search page would show them.
    const settings = await getSiteSettings();
    const close = await fuzzyTitles(query, settings.defaultPageSize || PAGE_SIZE);
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
async function suggestPeople(query: string): Promise<string[]> {
  const escaped = escapeLike(query);
  const rows = await db.$queryRaw<{ name: string }[]>`
    SELECT name FROM (
      SELECT DISTINCT name FROM (
        SELECT unnest("cast") AS name FROM media WHERE status = 'published'
        UNION SELECT director FROM media WHERE status = 'published'
        UNION SELECT creator FROM media WHERE status = 'published'
      ) named
      WHERE name ILIKE ${`%${escaped}%`}
    ) people
    ORDER BY (name ILIKE ${`${escaped}%`}) DESC, lower(name)
    LIMIT ${MAX_PEOPLE_SUGGESTIONS}`;
  if (rows.length > 0 || allowedTypos(query.length) === 0) return rows.map((row) => row.name);
  return fuzzyMatches(query, await listPublishedPeople(), (name) => name, MAX_PEOPLE_SUGGESTIONS);
}

// --- Titles and episodes ------------------------------------------------------

/*
 * A title's page reads it twice, for its <head> (generateMetadata) and
 * for the page itself; cache() makes that one query per request.
 */

/** A published title with its episodes, and whether it's "Most liked", or null. */
export const getTitle = cache(async (id: string): Promise<MediaDetail | null> => {
  await connection();
  if (!isMediaId(id)) return null;
  const [row, ratings] = await Promise.all([
    db.media.findUnique({
      where: { id, ...PUBLISHED },
      include: { episodes: { orderBy: EPISODE_ORDER } },
    }),
    db.mediaRating.groupBy({ by: ["value"], where: { mediaId: id }, _count: true }),
  ]);
  if (!row) return null;
  const count = (values: Rating[]) =>
    ratings.reduce((sum, group) => sum + (values.includes(group.value) ? group._count : 0), 0);
  return {
    ...toDetail(row),
    mostLiked: isMostLiked({ liked: count(["like", "love"]), total: count([...RATINGS]) }),
  };
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

/** Collections showing today: published, and within their dates if they have any. */
function showingCollections(): Prisma.CollectionWhereInput {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return {
    published: true,
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: today } }] },
      { OR: [{ endsAt: null }, { endsAt: { gte: today } }] },
    ],
  };
}

async function collectionCards(
  where: Prisma.CollectionWhereInput,
  { take, titles }: { take?: number; titles?: number } = {}
): Promise<CollectionCard[]> {
  const rows = await db.collection.findMany({
    where: { ...where, items: { some: { media: PUBLISHED } } },
    orderBy: [{ position: "asc" }, { title: "asc" }],
    take,
    select: {
      id: true,
      title: true,
      description: true,
      items: {
        where: { media: PUBLISHED },
        orderBy: [{ position: "asc" }, { addedAt: "asc" }],
        take: titles,
        select: { media: { select: CARD } },
      },
    },
  });
  return rows.map(({ items, ...row }) => ({ ...row, media: items.map((item) => toMedia(item.media)) }));
}

/** /collections: every collection showing today with a published title, in the admins' order. */
export async function listCollections(): Promise<CollectionCard[]> {
  await connection();
  return collectionCards(showingCollections(), { titles: 4 });
}

/** The home page's collection rows: those marked for it, showing today. */
export async function listHomeCollections(): Promise<CollectionCard[]> {
  await connection();
  return collectionCards({ ...showingCollections(), onHome: true }, { take: HOME_COLLECTIONS, titles: ROW_SIZE });
}

/** /collections/[id]: a collection showing today, with its published titles, or null. */
export async function getCollection(id: string): Promise<CollectionCard | null> {
  await connection();
  if (!isMediaId(id)) return null;
  const [collection] = await collectionCards({ ...showingCollections(), id });
  return collection ?? null;
}

/** Every showing collection's address, for the sitemap. */
export async function listCollectionIds(): Promise<string[]> {
  await connection();
  return (await listCollections()).map((collection) => collection.id);
}

/** Admin: every collection, with how many titles it holds. */
export async function listCollectionsForAdmin() {
  await connection();
  await requireAdmin();
  return db.collection.findMany({
    orderBy: [{ position: "asc" }, { title: "asc" }],
    include: { _count: { select: { items: true } } },
  });
}

/** Admin: one collection with all its titles (drafts and trashed ones too), in order. */
export async function getCollectionForEdit(id: string) {
  await connection();
  await requireAdmin();
  if (!isMediaId(id)) return null;
  return db.collection.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: [{ position: "asc" }, { addedAt: "asc" }],
        select: {
          mediaId: true,
          media: { select: { id: true, title: true, year: true, type: true, status: true, trashedAt: true } },
        },
      },
    },
  });
}

/** Admin: titles (not in the trash) whose name has `query`, to add to a collection. */
export async function searchTitlesForCollection(query: string) {
  await connection();
  await requireAdmin();
  const text = query.trim().slice(0, 100);
  if (!text) return [];
  return db.media.findMany({
    where: { trashedAt: null, title: { contains: text, mode: "insensitive" } },
    orderBy: [{ title: "asc" }, { year: "desc" }],
    take: 20,
    select: { id: true, title: true, year: true, type: true, status: true },
  });
}

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

// --- Ratings -----------------------------------------------------------------

/**
 * Whether `id` is a title members can rate (src/lib/rating-actions.ts):
 * a published movie or series. Episodes are rated through their series.
 */
export async function isRatableTitle(id: string): Promise<boolean> {
  await connection();
  if (!isMediaId(id)) return false;
  return (await db.media.count({ where: { id, ...PUBLISHED } })) > 0;
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

/**
 * A movie's or an episode's subtitles, for the player's <track>s: one per
 * language, named for its menu, A to Z. Only a published title's.
 */
export async function getSubtitles(
  target: { mediaId: string } | { episodeId: string }
): Promise<SubtitleTrack[]> {
  await connection();
  const id = "mediaId" in target ? target.mediaId : target.episodeId;
  if (!isMediaId(id)) return [];
  const published = { ...PUBLISHED, trashedAt: null };
  const rows = await db.subtitle.findMany({
    where:
      "mediaId" in target
        ? { mediaId: id, media: { ...published, type: "movie" } }
        : { episodeId: id, episode: { media: published } },
    select: { id: true, language: true },
  });
  return rows
    .map((row) => ({ ...row, label: languageName(row.language) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** A subtitle file as WebVTT (src/app/subtitles/[id]), if its title is published. */
export async function getSubtitleFile(id: string): Promise<string | null> {
  await connection();
  if (!SUBTITLE_ID.test(id)) return null;
  const published = { ...PUBLISHED, trashedAt: null };
  const row = await db.subtitle.findFirst({
    where: {
      id,
      OR: [
        { media: { ...published, type: "movie" } },
        { episode: { media: published } },
      ],
    },
    select: { content: true },
  });
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

/** What the admin panel lists of a movie's or an episode's subtitles (not the files). */
const SUBTITLE_SUMMARY = {
  select: { id: true, language: true, fileName: true, createdAt: true },
} satisfies Prisma.Media$subtitlesArgs;

/** A title with its episodes and a movie's video sources and subtitles, for its edit page. */
export async function getTitleForEdit(id: string) {
  await requireAdmin();
  await connection();
  if (!isMediaId(id)) return null;
  return db.media.findUnique({
    where: { id },
    include: {
      episodes: { orderBy: EPISODE_ORDER },
      videoSources: { orderBy: VIDEO_ORDER },
      subtitles: SUBTITLE_SUMMARY,
    },
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

/** An episode with its series, video sources and subtitles, for its edit page. */
export async function getEpisodeForEdit(id: string) {
  await requireAdmin();
  await connection();
  if (!isMediaId(id)) return null;
  return db.episode.findUnique({
    where: { id },
    include: {
      media: { select: { id: true, title: true, trashedAt: true } },
      videoSources: { orderBy: VIDEO_ORDER },
      subtitles: SUBTITLE_SUMMARY,
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
