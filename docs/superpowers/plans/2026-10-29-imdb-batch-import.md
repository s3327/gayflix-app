# IMDb CSV Batch Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide an admin batch import pipeline and UI on `/admin/import` to upload or paste IMDb export CSV files (e.g. 1,674 titles), fetch metadata from TMDB and OMDb in chunked batches, and save them into the catalog as drafts.

**Architecture:** A client-side RFC 4180 CSV parser extracts normalized IMDb records and pre-checks existing library titles in real time. An admin-gated chunked server action processes batches of 10-20 titles with TMDB/OMDb enrichment, safe draft fallbacks, and database insertions. An interactive UI on `/admin/import` provides drag-and-drop file upload, live progress tracking, pause/resume/cancel controls, metric counters, real-time activity feed, and downloadable run reports.

**Tech Stack:** Next.js 15 (React 19, Server Actions), TypeScript, Prisma ORM 7 (`@prisma/adapter-pg`), Vitest, Tailwind CSS, Lucide icons.

**Spec:** User request to import an IMDb export CSV file containing 1,674 titles into `/admin/import`, processing them in batches, fetching all metadata via TMDB and OMDb, and saving each created title with `status: "draft"`.

## Global Constraints

- **Admin Gate:** All batch actions and pages must enforce `requireAdmin()` and check permissions via `catalogSession()`.
- **Draft Status:** All imported titles must be saved with `status: "draft"` and never `published` or `featured`.
- **Unique Constraints:** `media.tmdbId` and `media.imdbId` have database `@unique` constraints. Duplicates must be skipped or flagged without triggering Prisma `P2002` crashes.
- **Project Conventions:** No `Co-Authored-By` commit trailers. All code must pass `npm run check` (lint, typecheck, vitest, build) before committing.
- **Stand-alone Execution:** Must not break or alter the standalone search view on `/admin/import` or edit `MetaLink.tsx`.

## Review Focus

1. **Quoted & Special Character CSV Rows:** Multi-line quotes, commas inside genres (`"Comedy, Drama"`), and escaped double quotes (`""`) must parse into exact fields without shifting column indices.
2. **Duplicate Handling:** Titles whose `imdbId` or resolved `tmdbId` is already in `db.media` (including in trash) must be detected and counted as `already_exists` rather than throwing unique constraint violations.
3. **Missing Metadata Resiliency:** Obscure indie films or shorts missing runtime, country, language, or genres on TMDB must receive sensible draft fallback placeholders (e.g. runtime from CSV, language "English", country "Unknown") so valid drafts are created instead of failing validation.
4. **Execution Timeouts & Rate Limits:** 1,674 items must be executed in manageable chunks (default 10 items/chunk) driven by the client runner, preventing serverless function timeouts and rate-limit spikes.
5. **Partial Failures & Recovery:** If TMDB/OMDb has no record or network fails for a specific item, that individual item must be logged as `failed` without crashing the remaining items in the chunk or stopping the batch runner.

---

### Task 1: RFC 4180 CSV Parser & IMDb Export Normalizer

**Files:**
- Create: `src/lib/imdb-csv.ts`
- Create: `src/lib/imdb-csv.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ImdbImportItem = {
    imdbId: string;
    title: string;
    originalTitle?: string;
    year?: number;
    titleType?: string;
    mediaType: "movie" | "series";
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

  export function parseCsv(text: string): string[][];
  export function parseImdbExport(content: string): ImdbExportResult;
  ```

- [ ] **Step 1: Write the failing test in `src/lib/imdb-csv.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { parseCsv, parseImdbExport } from "./imdb-csv";

describe("parseCsv", () => {
  it("parses comma-separated values with quotes and embedded commas", () => {
    const raw = '1,tt17076682,"Concerned Citizen","Comedy, Drama",2022\n2,tt21110704,"Háblame de ti","Drama",2022';
    const rows = parseCsv(raw);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(["1", "tt17076682", "Concerned Citizen", "Comedy, Drama", "2022"]);
    expect(rows[1][1]).toBe("tt21110704");
  });

  it("handles CRLF and escaped quotes", () => {
    const raw = 'ColA,ColB\r\n"He said ""Hello""",123\r\n';
    const rows = parseCsv(raw);
    expect(rows).toHaveLength(2);
    expect(rows[1][0]).toBe('He said "Hello"');
    expect(rows[1][1]).toBe("123");
  });
});

describe("parseImdbExport", () => {
  it("parses standard IMDb watchlist/ratings export headers", () => {
    const csv = `Position,Const,Created,Modified,Description,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors,Your Rating,Date Rated
1,tt17076682,2023-11-12,2023-11-12,,"Concerned Citizen","Ezrah Mudag",https://www.imdb.com/title/tt17076682/,Movie,6.0,82,2022,"Comedy, Drama",532,2023-06-02,"Idan Haguel",,
2,tt28642799,2023-11-12,2023-11-12,,"I Love You, and It Hurts","Te Quiero y Me Duele",https://www.imdb.com/title/tt28642799/,TV Series,5.6,,2023,"Drama",135,2023-08-17,,,
3,tt21156936,2023-11-12,2023-11-12,,"Hornbeam","Hornbeam",https://www.imdb.com/title/tt21156936/,Short,6.7,16,2022,"Short, Drama",71,2022,"Mark Pluck",,`;

    const result = parseImdbExport(csv);
    expect(result.validCount).toBe(3);
    expect(result.movieCount).toBe(2); // Movie + Short mapped to movie
    expect(result.seriesCount).toBe(1);
    expect(result.items[0]).toMatchObject({
      imdbId: "tt17076682",
      title: "Concerned Citizen",
      originalTitle: "Ezrah Mudag",
      mediaType: "movie",
      year: 2022,
      runtimeMinutes: 82,
      directors: "Idan Haguel",
    });
    expect(result.items[1].mediaType).toBe("series");
  });

  it("extracts bare IMDb ID list if plain text is provided", () => {
    const text = "tt17076682\ntt21110704\ntt17174750";
    const result = parseImdbExport(text);
    expect(result.validCount).toBe(3);
    expect(result.items[0].imdbId).toBe("tt17076682");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/imdb-csv.test.ts`
Expected: FAIL with "Cannot find module './imdb-csv'"

- [ ] **Step 3: Implement `src/lib/imdb-csv.ts`**

Implement RFC 4180 CSV character state machine in `parseCsv(text)` and `parseImdbExport(content)`:
- Support UTF-8 with BOM stripping (`0xfeff`).
- Header index finder for `Const`, `Title`, `Original Title`, `Title Type`, `Year`, `Runtime (mins)`, `Genres`, `Release Date`, `Directors`.
- Type normalizer:
  - `Movie`, `TV Movie`, `Short`, `Video`, `TV Special`, `TV Episode` -> `mediaType = "movie"`.
  - `TV Series`, `TV Mini Series` -> `mediaType = "series"`.
- Plain list fallback: regex search `tt\d{7,10}` per line if no standard header is found.
- Deduplication of IMDb IDs in input.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/imdb-csv.test.ts`
Expected: PASS (4 tests passing)

- [ ] **Step 5: Commit**

```bash
git add src/lib/imdb-csv.ts src/lib/imdb-csv.test.ts
git commit -m "feat(import): add RFC 4180 parser and IMDb export normalizer"
```

---

### Task 2: Batch Pre-Check Server Action

**Files:**
- Create: `src/lib/admin-imdb-batch-actions.ts`
- Create: `src/lib/admin-imdb-batch-actions.test.ts`

**Interfaces:**
- Consumes: `requireAdmin` from `src/lib/session.ts`, `db` from `src/lib/db.ts`
- Produces:
  ```ts
  export type ExistingCheckResponse = {
    ok: boolean;
    existingImdbIds: string[];
    error?: string;
  };

  export async function checkExistingImdbBatch(imdbIds: string[]): Promise<ExistingCheckResponse>;
  ```

- [ ] **Step 1: Write the failing test in `src/lib/admin-imdb-batch-actions.test.ts`**

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { checkExistingImdbBatch } from "./admin-imdb-batch-actions";
import { db } from "./db";

vi.mock("@/lib/admin-guard", () => ({
  catalogSession: vi.fn().mockResolvedValue({
    session: { user: { id: "admin-1", role: "admin", email: "admin@example.com" } },
    allowed: true,
  }),
  FORBIDDEN_CATALOG: "Forbidden",
}));

vi.mock("@/lib/db", () => ({
  db: {
    media: {
      findMany: vi.fn(),
    },
  },
}));

describe("checkExistingImdbBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns list of existing IMDb IDs in library", async () => {
    vi.mocked(db.media.findMany).mockResolvedValue([
      { imdbId: "tt17076682" },
      { imdbId: "tt21110704" },
    ] as any);

    const res = await checkExistingImdbBatch(["tt17076682", "tt21110704", "tt99999999"]);
    expect(res.ok).toBe(true);
    expect(res.existingImdbIds).toEqual(["tt17076682", "tt21110704"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/admin-imdb-batch-actions.test.ts`
Expected: FAIL with "Cannot find module './admin-imdb-batch-actions'"

- [ ] **Step 3: Implement `checkExistingImdbBatch` in `src/lib/admin-imdb-batch-actions.ts`**

- Add `"use server"` directive.
- Call `catalogSession()` from `src/lib/admin-guard.ts` to check admin privileges.
- Sanitize and chunk up to 500 IDs per query: `db.media.findMany({ where: { imdbId: { in: ids } }, select: { imdbId: true } })`.
- Return `{ ok: true, existingImdbIds }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/admin-imdb-batch-actions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-imdb-batch-actions.ts src/lib/admin-imdb-batch-actions.test.ts
git commit -m "feat(import): add server action to check existing IMDb IDs"
```

---

### Task 3: Chunked Batch Importer Server Action with Draft Persistence

**Files:**
- Modify: `src/lib/admin-imdb-batch-actions.ts`
- Modify: `src/lib/admin-imdb-batch-actions.test.ts`
- Modify: `src/lib/title-import.ts` (export helper for batch draft creation with safe fallbacks)

**Interfaces:**
- Consumes:
  - `ImdbImportItem` from `src/lib/imdb-csv.ts`
  - `findOnTmdb`, `getTmdbDetails` from `src/lib/tmdb.ts`
  - `getOmdbById` from `src/lib/omdb.ts`
  - `insertTitle` from `src/lib/title-store.ts`
- Produces:
  ```ts
  export type ImdbItemImportResult = {
    imdbId: string;
    title: string;
    status: "imported" | "already_exists" | "failed";
    mediaId?: string;
    mediaType?: "movie" | "series";
    error?: string;
  };

  export type BatchChunkResponse = {
    ok: boolean;
    results: ImdbItemImportResult[];
    importedCount: number;
    alreadyExistsCount: number;
    failedCount: number;
    error?: string;
  };

  export async function importImdbBatchChunk(items: ImdbImportItem[]): Promise<BatchChunkResponse>;
  ```

- [ ] **Step 1: Write the failing tests in `src/lib/admin-imdb-batch-actions.test.ts`**

Add tests for:
1. Importing a single item chunk successfully creates a draft.
2. Skipping an item that already exists in DB by `imdbId` or `tmdbId`.
3. Safe fallbacks for missing movie runtime/genres/country from CSV.
4. Catching TMDB 404 or errors per-item without failing other items in chunk.

```ts
it("imports a chunk of items as drafts and reports existing", async () => {
  // Test mock setup verifying status: "draft"
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/admin-imdb-batch-actions.test.ts`
Expected: FAIL with "importImdbBatchChunk is not a function"

- [ ] **Step 3: Implement `importImdbBatchChunk` in `src/lib/admin-imdb-batch-actions.ts`**

- Limit chunk size to max 25 items per request for safety.
- For each item:
  1. Check if `imdbId` exists in `db.media`. If found, push `{ imdbId, title: item.title, status: "already_exists", mediaId: row.id }`.
  2. Call `findOnTmdb(item.imdbId)`.
     - Match movie or series result (respecting `item.mediaType` preference).
     - If TMDB found:
       - Ref: `{ kind: "movie" | "tv", id }`.
       - Check if `formatTmdbRef(ref)` exists in DB. If yes, mark `already_exists`.
       - Fetch `getTmdbDetails(ref.kind, ref.id)`.
       - Enrich with OMDb if configured (`lookUpImdb` + `fillGaps`).
       - Apply safe draft fallbacks:
         - `runtime`: if empty and movie, use `item.runtimeMinutes` or `90`.
         - `country`: if empty, use "United States" or "Unknown".
         - `language`: if empty, use "English" or "Unknown".
         - `genres`: if empty, use `item.genres?.join(", ")` or "Drama".
         - `status`: strictly `"draft"`.
       - Run `parseTitle(type, values)`.
       - Insert via `insertTitle(type, parsed.data, { tmdbId: formatTmdbRef(ref), imdbId: item.imdbId })`.
       - Return `{ imdbId: item.imdbId, title: parsed.data.title, status: "imported", mediaId: id, mediaType: type }`.
     - If TMDB `/find/` returns nothing:
       - Fallback to OMDb via `getOmdbById(item.imdbId)`.
       - If OMDb has title, fill gaps and insert draft with `tmdbId: null, imdbId: item.imdbId`.
       - If neither found, return `{ imdbId: item.imdbId, title: item.title, status: "failed", error: "Not found on TMDB/OMDb" }`.
  3. Wrap each item in try/catch to isolate per-item errors.
- Trigger `revalidatePath("/", "layout")`.
- Return `{ ok: true, results, importedCount, alreadyExistsCount, failedCount }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/admin-imdb-batch-actions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-imdb-batch-actions.ts src/lib/admin-imdb-batch-actions.test.ts src/lib/title-import.ts
git commit -m "feat(import): implement chunked batch import server action with draft persistence"
```

---

### Task 4: Interactive Batch Import UI Component

**Files:**
- Create: `src/components/admin/import/ImdbBatchImporter.tsx`
- Create: `src/components/admin/import/ImdbBatchImporter.test.tsx`

**Interfaces:**
- Consumes:
  - `parseImdbExport` from `src/lib/imdb-csv.ts`
  - `checkExistingImdbBatch`, `importImdbBatchChunk` from `src/lib/admin-imdb-batch-actions.ts`
- Produces:
  - Client component `<ImdbBatchImporter />` for `/admin/import`.

- [ ] **Step 1: Write test for `ImdbBatchImporter` in `src/components/admin/import/ImdbBatchImporter.test.tsx`**

Test scenarios:
1. Renders file dropzone and paste area.
2. Parsing CSV displays analysis summary (e.g. 1,674 rows parsed, breakdown by type).
3. Clicking "Start Batch Import" processes chunks and updates progress bar.
4. "Pause" halts subsequent chunk dispatch until "Resume" is clicked.
5. Exporting summary generates a CSV download.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/admin/import/ImdbBatchImporter.test.tsx`
Expected: FAIL with "Cannot find module './ImdbBatchImporter'"

- [ ] **Step 3: Implement `ImdbBatchImporter.tsx`**

Features to implement:
- **File Input & Drag-and-Drop Zone:**
  - Accepts `.csv` file via drag-and-drop or file selector.
  - Textarea tab for pasting CSV text or raw IMDb ID list directly.
- **Client Parsing & Real-Time Stats:**
  - Instantly parses with `parseImdbExport`.
  - Runs `checkExistingImdbBatch` in background on extracted IDs to flag items already in catalog.
  - Summary cards: Total titles, Movies, Series, Shorts, and Already in Library.
- **Configuration & Filters:**
  - Checkbox: "Skip titles already in catalog" (checked by default).
  - Filter: "All types", "Movies only", "Series only".
  - Chunk size selector (default: 10 items).
- **Execution Controller:**
  - State machine: `idle` | `running` | `paused` | `stopped` | `completed`.
  - Buttons: "Start Batch Import", "Pause", "Resume", "Stop / Cancel".
- **Visual Progress & Metrics:**
  - Animated progress bar: percentage, count (`X / Y`), elapsed time, and ETA (`~X min remaining`).
  - Metric badges:
    - 🟢 Drafts Created (count)
    - 🟡 Already in Library (count)
    - 🔴 Failed / Not Found (count)
- **Live Activity Feed:**
  - Real-time scrollable log showing processed items with status pill (`Draft Created`, `Already in Library`, `Failed`) and direct link to view the created draft in `/admin/library/movies/[id]` or `/admin/library/series/[id]`.
- **Completion & Export:**
  - Completion modal/banner with summary.
  - "Download Run Report (.csv)" button containing full logs with IDs and statuses.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/admin/import/ImdbBatchImporter.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/import/ImdbBatchImporter.tsx src/components/admin/import/ImdbBatchImporter.test.tsx
git commit -m "feat(import): add interactive IMDb batch importer UI component"
```

---

### Task 5: Integrate Batch Importer into `/admin/import`

**Files:**
- Modify: `src/app/admin/(panel)/import/page.tsx`

**Interfaces:**
- Consumes: `<ImdbBatchImporter />` from `src/components/admin/import/ImdbBatchImporter.tsx`
- Updates `/admin/import` page to support two modes via URL param / tab state:
  1. `tab=search`: Existing TMDB/IMDb live search view.
  2. `tab=batch`: IMDb CSV & List Batch Import view.

- [ ] **Step 1: Update `ImportPage` in `src/app/admin/(panel)/import/page.tsx`**

- Read `tab` from `searchParams` (default `"search"`).
- Render a tab navigation header below page title:
  - `[Search TMDB / IMDb]`
  - `[IMDb Batch Import (CSV)]`
- When `tab === "batch"`, render `<ImdbBatchImporter />`.
- When `tab === "search"`:
  - Render existing `ImportSearchBar`, results, and `BatchImportBar`.
  - In empty state ("Quick Import Tips"), add a highlighted quick-action banner:
    "Have an IMDb Watchlist or export CSV? [Switch to IMDb Batch Import] to import 1,000+ titles as drafts in batch."

- [ ] **Step 2: Verify page rendering and routing**

Run: `npm run check`
Expected: PASS (Next.js build succeeds with valid types and pages)

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/(panel)/import/page.tsx
git commit -m "feat(import): integrate IMDb batch importer tab on /admin/import"
```

---

### Task 6: Full Verification Suite & End-to-End Test

**Files:**
- Test all components and integration

- [ ] **Step 1: Run comprehensive tests**

Run: `npm test`
Expected: All test suites pass (including new `imdb-csv.test.ts`, `admin-imdb-batch-actions.test.ts`, `ImdbBatchImporter.test.tsx`).

- [ ] **Step 2: Run full build and lint check**

Run: `npm run check`
Expected: Clean linting, TypeScript typecheck passes with 0 errors, Next.js build generates all static and dynamic routes.

- [ ] **Step 3: Final Verification Commit**

```bash
git commit --allow-empty -m "chore(import): verify IMDb batch import pipeline"
```
