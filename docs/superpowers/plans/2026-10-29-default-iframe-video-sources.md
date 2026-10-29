# Default Iframe Video Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically populate default iframe embed video sources for movies (`https://gayflix.my.id/embed/movie/{id}`) and series episodes (`https://gayflix.my.id/embed/tv/{id}/{season}/{episode}`) upon import, and backfill all existing titles and episodes currently in the database.

**Architecture:** An embed URL builder resolves IMDb ID (primary) or TMDB numeric ID (fallback) into standardized embed URLs in path or query format. `src/lib/video-hosts.ts` automatically includes `gayflix.my.id` as a trusted default video host, allowing playback and updating the Content Security Policy (`frame-src`). Movie creation (`insertTitle`) and episode import (`importSeriesSeasonsAction`) automatically create a default `VideoSource` record (`kind: "embed"`, `label: "Server 1"`, `position: 1`). An idempotent backfill function updates existing catalog entries.

**Tech Stack:** Next.js 15 (React 19, Server Actions), TypeScript, Prisma ORM 7 (`@prisma/adapter-pg`), Vitest.

**Spec:** User request to add default iframe embeds (`https://gayflix.my.id/embed/movie/movie_id` and `https://gayflix.my.id/embed/tv/{id}/{season}/{episode}`), using IMDb ID first with fallback to TMDB ID, for all newly imported titles and all existing titles/episodes in the database.

---

## Global Constraints

- **Admin Gate:** All mutation and backfill functions must call `requireAdmin()` or run within server transaction context.
- **Video Host Whitelist:** `gayflix.my.id` must be recognized by `videoHosts()` in `src/lib/video-hosts.ts` so `getVideoSources()` in `src/lib/catalog.ts` and `buildContentSecurityPolicy()` in `src/lib/csp.ts` permit the embed.
- **Idempotency:** Backfill and creation must not create duplicate video sources if a source with that URL or position already exists for that title/episode.
- **Project Conventions:** No `Co-Authored-By` trailers in commit messages. `npm run check` (lint, typecheck, tests, build) must pass before pushing.
- **Zero Regressions:** Must not alter existing custom video sources, HLS streams, or `MetaLink.tsx`.

---

## Review Focus

1. **Host Security & CSP:** `gayflix.my.id` must be registered in `DEFAULT_VIDEO_HOSTS` so that watch page CSP headers include `https://gayflix.my.id` in `frame-src` and `videoUrlAllowed()` validates without manual `VIDEO_HOSTS` environment variable configuration.
2. **IMDb Priority & TMDB Fallback:** If `imdbId` is present (e.g. `tt27987047`), it must be used as `{id}`; if missing, TMDB ID (`movie/12345` or `tv/1399`) must be parsed into its clean numeric representation (`12345` or `1399`).
3. **Episode Numbering:** Episode embeds must accurately embed `{seasonNumber}` and `{episodeNumber}` matching the episode record.
4. **Duplicate Prevention:** If a movie or episode already has a video source with this embed URL, importing or backfilling must not create redundant duplicates.
5. **Backfill Completeness:** The backfill must cover both published and draft movies, as well as episodes across all seasons.

---

### Task 1: Register Default Video Host in `video-hosts.ts`

**Files:**
- Modify: `src/lib/video-hosts.ts`
- Modify: `src/lib/video-source.test.ts`

**Interfaces:**
- Produces: `videoHosts(env?: Record<string, string | undefined>): string[]`
- Guarantees: `videoHosts()` always includes `"gayflix.my.id"`.

- [ ] **Step 1: Write the failing test in `src/lib/video-source.test.ts`**

Update `src/lib/video-source.test.ts` to assert that `videoHosts({})` includes `"gayflix.my.id"` by default and `videoUrlAllowed("https://gayflix.my.id/embed/movie/tt27987047", videoHosts())` returns `true`.

```ts
it("includes gayflix.my.id as default video host", () => {
  expect(videoHosts({})).toContain("gayflix.my.id");
  expect(videoUrlAllowed("https://gayflix.my.id/embed/movie/tt27987047", videoHosts({}))).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/video-source.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement in `src/lib/video-hosts.ts`**

Define `const DEFAULT_VIDEO_HOSTS = ["gayflix.my.id"];` and return `[...new Set([...DEFAULT_VIDEO_HOSTS, ...hosts])]`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/video-source.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/video-hosts.ts src/lib/video-source.test.ts
git commit -m "feat(video): add gayflix.my.id to default allowed video hosts"
```

---

### Task 2: Embed URL & Iframe Builder

**Files:**
- Create: `src/lib/embed-builder.ts`
- Create: `src/lib/embed-builder.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function buildDefaultMovieEmbedUrl(options: {
    imdbId?: string | null;
    tmdbId?: string | null;
    format?: "path" | "query";
  }): string | null;

  export function buildDefaultEpisodeEmbedUrl(options: {
    seriesImdbId?: string | null;
    seriesTmdbId?: string | null;
    seasonNumber: number;
    episodeNumber: number;
    format?: "path" | "query";
  }): string | null;

  export function buildDefaultMovieIframeHtml(options: {
    imdbId?: string | null;
    tmdbId?: string | null;
  }): string | null;
  ```

- [ ] **Step 1: Write failing tests in `src/lib/embed-builder.test.ts`**

Cover:
1. Movie with IMDb ID produces `https://gayflix.my.id/embed/movie/tt27987047`.
2. Movie with TMDB ID only produces `https://gayflix.my.id/embed/movie/1300854` (stripping `movie/` prefix).
3. Query format: `https://gayflix.my.id/embed/movie?imdb=tt1300854` and `https://gayflix.my.id/embed/movie?tmdb=1300854`.
4. Episode with Series IMDb ID produces `https://gayflix.my.id/embed/tv/tt27987047/1/1`.
5. Episode with Series TMDB ID produces `https://gayflix.my.id/embed/tv/1399/1/1`.
6. Query format for Episode: `https://gayflix.my.id/embed/tv?imdb=tt0944947&season=1&episode=1`.
7. `buildDefaultMovieIframeHtml` returns exact `<iframe ...>` string.
8. Returns `null` when neither IMDb nor TMDB ID is available.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/embed-builder.test.ts`
Expected: FAIL with "Cannot find module './embed-builder'"

- [ ] **Step 3: Implement `src/lib/embed-builder.ts`**

- Extract numeric ID from `tmdbId` via regex `/^(?:movie|tv)\/(\d+)$/` or bare digits.
- Construct path or query string based on options.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/embed-builder.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/embed-builder.ts src/lib/embed-builder.test.ts
git commit -m "feat(video): add embed URL and iframe builder for movies and episodes"
```

---

### Task 3: Auto-create Default Video Source for Movie Imports

**Files:**
- Modify: `src/lib/title-store.ts`
- Modify: `src/lib/title-store.test.ts` (or add unit test)

**Interfaces:**
- Consumes: `buildDefaultMovieEmbedUrl` from `src/lib/embed-builder.ts`
- In `insertTitle(type, input, { tmdbId, imdbId })`:
  - When `type === "movie"` and (`imdbId` or `tmdbId`):
    - Check if videoSource exists for `id`. If none, create `VideoSource`:
      ```ts
      const defaultUrl = buildDefaultMovieEmbedUrl({ imdbId, tmdbId });
      if (defaultUrl) {
        await tx.videoSource.create({
          data: {
            mediaId: id,
            label: "Server 1",
            kind: "embed",
            url: defaultUrl,
            position: 1,
            enabled: true,
          },
        });
      }
      ```

- [ ] **Step 1: Write test verifying movie import creates default video source**

In test, call `insertTitle("movie", ...)` and assert that `tx.videoSource.create` is invoked with `Server 1`, `kind: "embed"`, and correct embed URL.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/title-store.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement in `src/lib/title-store.ts`**

Add default video source creation inside the transaction in `insertTitle`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/title-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/title-store.ts
git commit -m "feat(video): auto-populate default embed video source on movie import"
```

---

### Task 4: Auto-create Default Video Source for Series Episodes

**Files:**
- Modify: `src/lib/admin-catalog-actions.ts`

**Interfaces:**
- Consumes: `buildDefaultEpisodeEmbedUrl` from `src/lib/embed-builder.ts`
- In `importSeriesSeasonsAction`:
  - When creating each missing episode in `db.episode.create`:
    - Create default `VideoSource` with:
      `episodeId: id, label: "Server 1", kind: "embed", url: buildDefaultEpisodeEmbedUrl({ seriesImdbId: series.imdbId, seriesTmdbId: series.tmdbId, seasonNumber: sNum, episodeNumber: ep.episode_number }), position: 1, enabled: true`.
- In `saveNewEpisode`:
  - Fetch parent series `imdbId` and `tmdbId`, and create default `VideoSource` if none exists.

- [ ] **Step 1: Write tests for episode import auto-populating default video source**

Verify `importSeriesSeasonsAction` creates `VideoSource` for imported episodes with correct embed URL.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/admin-catalog-actions.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement in `src/lib/admin-catalog-actions.ts`**

Update `importSeriesSeasonsAction` and `saveNewEpisode` to create default video source.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/admin-catalog-actions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-catalog-actions.ts
git commit -m "feat(video): auto-populate default embed video source on episode import"
```

---

### Task 5: Backfill Pipeline for Existing Database Titles & Episodes

**Files:**
- Create: `src/lib/video-backfill.ts`
- Create: `src/lib/video-backfill.test.ts`
- Modify: `src/lib/scheduled-jobs.ts`
- Create: `scripts/backfill-embeds.ts`

**Interfaces:**
- Produces:
  ```ts
  export type BackfillResult = {
    moviesChecked: number;
    moviesUpdated: number;
    episodesChecked: number;
    episodesUpdated: number;
    errors: string[];
  };

  export async function backfillDefaultVideoSources(): Promise<BackfillResult>;
  export async function backfillDefaultVideoSourcesAction(): Promise<{ ok: boolean; message: string; result?: BackfillResult }>;
  ```

- Logic:
  1. Find movies where `type = "movie"` and (`imdbId IS NOT NULL` OR `tmdbId IS NOT NULL`).
  2. For each movie, check if it already has a `VideoSource` with the default embed URL. If not, add `VideoSource` (`position: (maxPos + 1) || 1`).
  3. Find episodes joined with parent series `media` (where series has `imdbId` or `tmdbId`).
  4. For each episode, check if it already has a `VideoSource` with the default embed URL. If not, add `VideoSource`.
  5. Add job `"backfill_default_embeds"` to `AVAILABLE_JOBS` in `src/lib/scheduled-jobs.ts` so admins can also trigger it from `/admin/jobs`.

- [ ] **Step 1: Write test in `src/lib/video-backfill.test.ts`**

Test backfilling movies and episodes missing video sources and verifying idempotency (no duplicate sources on second run).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/video-backfill.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/lib/video-backfill.ts` and `scripts/backfill-embeds.ts`**

Implement idempotent queries and transactions.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/video-backfill.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/video-backfill.ts src/lib/video-backfill.test.ts src/lib/scheduled-jobs.ts scripts/backfill-embeds.ts
git commit -m "feat(video): implement backfill pipeline for existing movies and episodes"
```

---

### Task 6: Execution & Full Verification Suite

**Files:**
- Run database backfill and full verification suite

- [ ] **Step 1: Execute backfill on current database**

Run: `npx tsx scripts/backfill-embeds.ts`
Expected: Backfill successfully applies to all existing movies and episodes in current database.

- [ ] **Step 2: Run full verification suite**

Run: `npm run check` (ESLint + Typecheck + Vitest + Next.js Turbopack build).
Expected: 100% clean pass.

- [ ] **Step 3: Commit and Push**

```bash
git push origin main
```
