import { toCsvRow } from "@/lib/csv";
import type { ImdbImportItem } from "@/lib/imdb-csv";
import type { ImdbItemImportResult } from "@/lib/admin-imdb-batch-actions";

/**
 * Splits an array into chunks of the specified size.
 */
export function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0 || items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Calculates processing speed and estimated seconds remaining for a batch run.
 */
export function calculateEta(
  totalItems: number,
  processedItems: number,
  elapsedMs: number
): { secondsRemaining: number; itemsPerSecond: number } {
  if (processedItems <= 0 || totalItems <= processedItems || elapsedMs <= 0) {
    return { secondsRemaining: 0, itemsPerSecond: 0 };
  }

  const elapsedSeconds = elapsedMs / 1000;
  const itemsPerSecond = Math.round((processedItems / elapsedSeconds) * 10) / 10;
  const remainingItems = totalItems - processedItems;
  const secondsRemaining = itemsPerSecond > 0 ? Math.ceil(remainingItems / itemsPerSecond) : 0;

  return { secondsRemaining, itemsPerSecond };
}

/**
 * Filters items based on catalog existence and media type filter.
 */
export function filterImportItems(
  items: ImdbImportItem[],
  {
    skipExisting,
    existingIds,
    typeFilter,
  }: {
    skipExisting: boolean;
    existingIds: Set<string>;
    typeFilter: "all" | "movie" | "series";
  }
): ImdbImportItem[] {
  return items.filter((item) => {
    if (skipExisting && existingIds.has(item.imdbId.toLowerCase())) {
      return false;
    }
    if (typeFilter !== "all" && item.mediaType !== typeFilter) {
      return false;
    }
    return true;
  });
}

/**
 * Generates an RFC 4180 CSV export report summarizing the batch run results.
 */
export function generateBatchReportCsv(results: ImdbItemImportResult[]): string {
  const headers = ["IMDb ID", "Title", "Status", "Media ID", "Type", "Error"];
  const rows = [toCsvRow(headers)];

  for (const res of results) {
    rows.push(
      toCsvRow([
        res.imdbId,
        res.title,
        res.status,
        res.mediaId ?? "",
        res.mediaType ?? "",
        res.error ?? "",
      ])
    );
  }

  return rows.join("\r\n");
}
