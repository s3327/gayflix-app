import type { MediaType } from "@/lib/media";

export type ImdbImportItem = {
  imdbId: string;
  title: string;
  originalTitle?: string;
  year?: number;
  titleType?: string;
  mediaType: MediaType;
  runtimeMinutes?: number;
  genres?: string[];
  directors?: string;
  rating?: number;
  releaseDate?: string;
};

export type ImdbExportResult = {
  items: ImdbImportItem[];
  totalRows: number;
  validCount: number;
  movieCount: number;
  seriesCount: number;
  shortCount: number;
  skippedCount: number;
  errors: string[];
};

/**
 * Standard RFC 4180 CSV parser supporting escaped quotes, multi-line fields,
 * embedded commas, carriage returns, and BOM stripping.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  // Strip UTF-8 BOM if present
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        field += c;
        i++;
        continue;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (c === ",") {
        row.push(field);
        field = "";
        i++;
        continue;
      } else if (c === "\r") {
        if (i + 1 < text.length && text[i + 1] === "\n") {
          i++;
        }
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
        i++;
        continue;
      } else if (c === "\n") {
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
        i++;
        continue;
      } else {
        field += c;
        i++;
        continue;
      }
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ""));
}

/** Check if text is an IMDb ID: "tt0133093". */
export function isImdbId(val: string): boolean {
  return /^tt\d{7,10}$/i.test(val.trim());
}

/**
 * Maps IMDb Title Type string to Gayflix catalog MediaType ("movie" | "series").
 */
export function normalizeMediaType(titleType: string | undefined): MediaType {
  if (!titleType) return "movie";
  const normalized = titleType.trim().toLowerCase();
  if (normalized.includes("series") || normalized.includes("tv mini series")) {
    return "series";
  }
  return "movie";
}

/**
 * Parses an IMDb export CSV (Watchlist, Ratings, or Custom List),
 * or falls back to a raw newline/comma-separated list of IMDb IDs.
 */
export function parseImdbExport(content: string): ImdbExportResult {
  const rows = parseCsv(content);
  const result: ImdbExportResult = {
    items: [],
    totalRows: rows.length,
    validCount: 0,
    movieCount: 0,
    seriesCount: 0,
    shortCount: 0,
    skippedCount: 0,
    errors: [],
  };

  if (rows.length === 0) return result;

  const headerRow = rows[0].map((h) => h.trim().toLowerCase());
  const constIdx = headerRow.findIndex(
    (h) => h === "const" || h === "imdb id" || h === "imdbid" || h === "id"
  );

  const seenIds = new Set<string>();

  if (constIdx !== -1) {
    // Header-based IMDb export
    const titleIdx = headerRow.findIndex((h) => h === "title");
    const origTitleIdx = headerRow.findIndex((h) => h === "original title");
    const typeIdx = headerRow.findIndex((h) => h === "title type" || h === "type");
    const yearIdx = headerRow.findIndex((h) => h === "year");
    const runtimeIdx = headerRow.findIndex((h) => h.includes("runtime"));
    const genresIdx = headerRow.findIndex((h) => h === "genres" || h === "genre");
    const directorsIdx = headerRow.findIndex((h) => h === "directors" || h === "director");
    const ratingIdx = headerRow.findIndex((h) => h.includes("imdb rating") || h === "rating");
    const releaseDateIdx = headerRow.findIndex((h) => h === "release date");

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rawId = (row[constIdx] ?? "").trim();
      if (!isImdbId(rawId)) {
        result.skippedCount++;
        continue;
      }
      const imdbId = rawId.toLowerCase();
      if (seenIds.has(imdbId)) {
        result.skippedCount++;
        continue;
      }
      seenIds.add(imdbId);

      const title = (titleIdx !== -1 ? row[titleIdx] : "")?.trim() || imdbId;
      const originalTitle = origTitleIdx !== -1 ? row[origTitleIdx]?.trim() : undefined;
      const titleType = typeIdx !== -1 ? row[typeIdx]?.trim() : undefined;
      const mediaType = normalizeMediaType(titleType);

      const rawYear = yearIdx !== -1 ? Number.parseInt(row[yearIdx]?.trim() || "", 10) : Number.NaN;
      const year = Number.isInteger(rawYear) && rawYear > 1880 && rawYear < 2100 ? rawYear : undefined;

      const rawRuntime = runtimeIdx !== -1 ? Number.parseInt(row[runtimeIdx]?.trim() || "", 10) : Number.NaN;
      const runtimeMinutes = Number.isInteger(rawRuntime) && rawRuntime > 0 ? rawRuntime : undefined;

      const genres = genresIdx !== -1 && row[genresIdx]
        ? row[genresIdx]
            .split(",")
            .map((g) => g.trim())
            .filter(Boolean)
        : undefined;

      const directors = directorsIdx !== -1 ? row[directorsIdx]?.trim() : undefined;

      const rawRating = ratingIdx !== -1 ? Number.parseFloat(row[ratingIdx]?.trim() || "") : Number.NaN;
      const rating = Number.isFinite(rawRating) && rawRating >= 0 && rawRating <= 10 ? rawRating : undefined;

      const releaseDate = releaseDateIdx !== -1 ? row[releaseDateIdx]?.trim() : undefined;

      if (titleType?.toLowerCase() === "short") {
        result.shortCount++;
      }
      if (mediaType === "movie") {
        result.movieCount++;
      } else {
        result.seriesCount++;
      }

      result.items.push({
        imdbId,
        title,
        ...(originalTitle ? { originalTitle } : {}),
        ...(year ? { year } : {}),
        ...(titleType ? { titleType } : {}),
        mediaType,
        ...(runtimeMinutes ? { runtimeMinutes } : {}),
        ...(genres && genres.length > 0 ? { genres } : {}),
        ...(directors ? { directors } : {}),
        ...(rating !== undefined ? { rating } : {}),
        ...(releaseDate ? { releaseDate } : {}),
      });
    }
  } else {
    // Fallback: extract bare IMDb IDs anywhere in rows
    for (const row of rows) {
      for (const cell of row) {
        const match = /(tt\d{7,10})/i.exec(cell);
        if (match) {
          const imdbId = match[1].toLowerCase();
          if (!seenIds.has(imdbId)) {
            seenIds.add(imdbId);
            result.items.push({
              imdbId,
              title: imdbId,
              mediaType: "movie",
            });
            result.movieCount++;
          }
        }
      }
    }
    result.skippedCount = Math.max(0, rows.length - result.items.length);
  }

  result.validCount = result.items.length;
  return result;
}
