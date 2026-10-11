import { findImported } from "@/lib/catalog";
import {
  checkMatch,
  fillGaps,
  findImdbId,
  formatTmdbRef,
  imdbFacts,
  matchNotices,
  omdbValues,
  tmdbCard,
  tmdbFacts,
  tmdbKind,
  tmdbValues,
  type ImdbCheck,
  type ImdbFacts,
  type SourceCard,
  type TmdbFacts,
  type TmdbRef,
} from "@/lib/import-mapping";
import type { MediaType } from "@/lib/media";
import { getOmdbById, getOmdbByTitle, omdbConfigured } from "@/lib/omdb";
import { SourceError } from "@/lib/source-request";
import { findOnTmdb, getTmdbDetails, searchTmdb, TMDB_MAX_PAGE, TMDB_PAGE_SIZE } from "@/lib/tmdb";
import { parseTitle, type TitleInput, type TitleValues } from "@/lib/title-form";
import type { SourceIds } from "@/lib/title-store";

/*
 * The Import page's searches and imports: TMDB first, then the IMDb check
 * through OMDb. Server code only, for admins (findImported checks). The
 * server function that saves is in src/lib/admin-import-actions.ts, the
 * pure mapping in src/lib/import-mapping.ts.
 */

/** A page of results is two of TMDB's. */
export const IMPORT_PAGE_SIZE = 2 * TMDB_PAGE_SIZE;
const LAST_IMPORT_PAGE = Math.floor(TMDB_MAX_PAGE / 2);

/** A library title a result was already imported as. */
export type ImportedAs = { id: string; type: MediaType; trashed: boolean };

export type ImportCard = SourceCard & { imported: ImportedAs | null };

export type ImportSearch = {
  query: string;
  by: "title" | "imdb";
  type: MediaType;
  page: number;
};

export type SearchResult =
  | { ok: false; message: string }
  | { ok: true; cards: ImportCard[]; page: number; totalPages: number; total: number };

function importedAs(row: { id: string; type: MediaType; trashedAt: Date | null }): ImportedAs {
  return { id: row.id, type: row.type, trashed: row.trashedAt !== null };
}

/** The cards, each with the library title it was imported as, if any. */
async function markImported(cards: SourceCard[], imdbId: string | null): Promise<ImportCard[]> {
  const rows = await findImported({
    tmdbIds: cards.map((card) => card.tmdbId),
    imdbIds: imdbId ? [imdbId] : [],
  });
  const byImdb = rows.find((row) => imdbId !== null && row.imdbId === imdbId);
  return cards.map((card) => {
    const row = rows.find((candidate) => candidate.tmdbId === card.tmdbId) ?? byImdb;
    return { ...card, imported: row ? importedAs(row) : null };
  });
}

/**
 * One page of the Import page's results. A title search asks TMDB for
 * movies or series; an IMDb ID search shows whatever TMDB has under it,
 * of either type.
 */
export async function searchSources({ query, by, type, page }: ImportSearch): Promise<SearchResult> {
  try {
    if (by === "imdb") {
      const imdbId = findImdbId(query);
      if (!imdbId) return { ok: false, message: "Enter an IMDb ID, such as tt0133093." };
      const found = await findOnTmdb(imdbId);
      const cards = [
        ...found.movies.map((result) => tmdbCard("movie", result)),
        ...found.series.map((result) => tmdbCard("tv", result)),
      ].filter((card) => card !== null);
      const marked = await markImported(cards, imdbId);
      return { ok: true, cards: marked, page: 1, totalPages: 1, total: cards.length };
    }

    const kind = tmdbKind(type);
    const wanted = Math.min(page, LAST_IMPORT_PAGE);
    const [first, second] = await Promise.all([
      searchTmdb(kind, query, 2 * wanted - 1),
      searchTmdb(kind, query, 2 * wanted),
    ]);
    const totalPages = Math.max(1, Math.ceil(first.totalPages / 2));
    // Past the last page (an old link): show the last one instead.
    if (wanted > totalPages) return searchSources({ query, by, type, page: totalPages });

    // TMDB's pages can overlap when its results shift between requests.
    const cards: SourceCard[] = [];
    for (const result of [...first.results, ...second.results]) {
      const card = tmdbCard(kind, result);
      if (card && !cards.some((other) => other.tmdbId === card.tmdbId)) cards.push(card);
    }
    return {
      ok: true,
      cards: await markImported(cards, null),
      page: wanted,
      totalPages,
      total: first.totalResults,
    };
  } catch (error) {
    if (error instanceof SourceError) return { ok: false, message: error.message };
    throw error;
  }
}

// --- Importing one title ------------------------------------------------------

const NO_MATCH = "IMDb has no title that matches.";

type ImdbLookup =
  | { found: true; facts: ImdbFacts; answer: unknown; check: ImdbCheck }
  | { found: false; reason: string };

/**
 * The IMDb check: OMDb's answer for the IMDb id TMDB has, or, when TMDB
 * has none, IMDb's best match by title and year, kept only if they agree.
 */
async function lookUpImdb(tmdb: TmdbFacts): Promise<ImdbLookup> {
  if (!omdbConfigured()) return { found: false, reason: "OMDB_API_KEY isn't set." };
  try {
    const answer = tmdb.imdbId
      ? await getOmdbById(tmdb.imdbId)
      : await getOmdbByTitle(tmdb.titles[0] ?? "", tmdb.year);
    const facts = imdbFacts(answer);
    if (!facts) {
      const reason = tmdb.imdbId ? `IMDb has nothing under ${tmdb.imdbId}.` : NO_MATCH;
      return { found: false, reason };
    }
    if (!facts.type) {
      return { found: false, reason: `IMDb lists ${facts.imdbId} as neither a movie nor a series.` };
    }
    const check = checkMatch(tmdb, facts);
    if (!tmdb.imdbId && !(check.sameTitle && check.sameYear)) return { found: false, reason: NO_MATCH };
    return { found: true, facts, answer, check };
  } catch (error) {
    if (error instanceof SourceError) return { found: false, reason: error.message };
    throw error;
  }
}

export type ImportPlan =
  | { status: "failed"; message: string }
  /** Imported before (maybe as the other type, or in the trash). */
  | { status: "exists"; title: ImportedAs }
  /** TMDB and IMDb disagree on the type, and no type was picked. */
  | { status: "conflict"; tmdbType: MediaType; imdbType: MediaType }
  | {
      status: "ready";
      type: MediaType;
      /** The title form's values, and what's wrong with them. */
      values: TitleValues;
      errors: Record<string, string>;
      /** Shown above the form: a doubtful match, or why IMDb wasn't checked. */
      notices: string[];
      sources: SourceIds & { tmdbId: string };
      /** Set when the draft can be saved without opening the form. */
      input: TitleInput | null;
    };

/**
 * Everything an import needs, from TMDB's details and the IMDb check.
 * `as` is the type an admin picked (on the Import page when TMDB and IMDb
 * disagree, or by opening the other type's form); null for TMDB's own.
 */
export async function prepareImport(ref: TmdbRef, as: MediaType | null): Promise<ImportPlan> {
  const tmdbId = formatTmdbRef(ref);
  const [before] = await findImported({ tmdbIds: [tmdbId], imdbIds: [] });
  if (before) return { status: "exists", title: importedAs(before) };

  let details: unknown;
  try {
    details = await getTmdbDetails(ref.kind, ref.id);
  } catch (error) {
    if (error instanceof SourceError) return { status: "failed", message: error.message };
    throw error;
  }
  if (details === null) return { status: "failed", message: "TMDB doesn't have that title." };
  const tmdb = tmdbFacts(ref.kind, details);

  const imdb = await lookUpImdb(tmdb);
  if (imdb.found) {
    const [sameImdb] = await findImported({ tmdbIds: [], imdbIds: [imdb.facts.imdbId] });
    if (sameImdb) return { status: "exists", title: importedAs(sameImdb) };
    if (!as && imdb.facts.type && imdb.facts.type !== tmdb.type) {
      return { status: "conflict", tmdbType: tmdb.type, imdbType: imdb.facts.type };
    }
  }

  const type = as ?? tmdb.type;
  let values = tmdbValues(ref.kind, details, type);
  const notices: string[] = [];
  let doubtful = false;
  if (imdb.found) {
    values = fillGaps(values, omdbValues(imdb.answer, type)).values;
    notices.push(...matchNotices(tmdb, imdb.facts, imdb.check));
    doubtful = !imdb.check.sameTitle || !imdb.check.sameYear;
  } else {
    notices.push(`Not checked against IMDb: ${imdb.reason}`);
  }

  const parsed = parseTitle(type, values);
  return {
    status: "ready",
    type,
    values,
    errors: parsed.ok ? {} : parsed.errors,
    notices,
    sources: { tmdbId, imdbId: imdb.found ? imdb.facts.imdbId : null },
    input: parsed.ok && !doubtful ? parsed.data : null,
  };
}

/** What the Import page's Import button shows after it's pressed. */
export type ImportState = {
  message?: string;
  /** Already in the library: the title to link to. */
  existing?: ImportedAs;
  /** TMDB and IMDb disagree on the type: the admin picks one. */
  conflict?: { tmdb: MediaType; imdb: MediaType };
};
