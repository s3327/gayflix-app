# Short Film Auto-Categorization, Admin Setting & Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow administrators to configure a runtime duration cutoff in minutes (e.g. 30 or 40 min). Any movie imported with runtime `<= cutoff` is automatically categorized as `"Short Film"` (under type `movie`). Provide a `category` field box on the title edit page, support taxonomy filtering, and display a `"Short Film"` badge on the public site (poster cards and title detail pages).

**Architecture:** 
1. Database schema stores `shortFilmCutoffMinutes Int @default(40)` in `SiteSetting` and `category String?` in `Media`.
2. Admin settings (`/admin/settings`) provides an input to configure `shortFilmCutoffMinutes` with server-side validation.
3. Import pipelines (`src/lib/title-import.ts`, `src/lib/import-mapping.ts`, and `src/lib/admin-imdb-batch-actions.ts`) inspect the movie's runtime against the active cutoff; if `runtimeMinutes <= cutoff`, `category` is automatically set to `"Short Film"`.
4. Admin title edit page (`TitleForm.tsx`, `title-form.ts`, `title-store.ts`) exposes an editable `category` field box.
5. Catalog queries (`src/lib/catalog.ts`) project `category` to `Media` and `MediaDetail` and support `category` filtering in `listTitles`.
6. Public UI components (`MediaCard.tsx`, `PosterCard.tsx`, `TitleDetail.tsx`) render a prominent Gayflix brand badge (`<Badge tone="brand" size="sm">Short Film</Badge>`) whenever `category === "Short Film"`.

**Tech Stack:** Next.js 16 (React 19, Server Actions), TypeScript, Prisma ORM 7 (`@prisma/adapter-pg`), Tailwind CSS, Vitest.

**Spec:** User request:
- Add a setting in the admin area determining the import process.
- When set to a number (e.g. 30 minutes), any title with runtime duration `<= threshold` has its category set to `"Short Film"`.
- This category counts as a taxonomy while remaining under type `movie`.
- Edit page has a `category` field box.
- Public site displays a `"Short Film"` badge when a title has this category.

---

## Global Constraints

- **Rule Direction:** Use `<=` (less than or equal to) cutoff threshold as explicitly clarified by user, not `>=`.
- **Type Invariant:** Media `type` MUST remain `movie` (never change type to something outside `movie` | `series`).
- **Prisma 7 Convention:** Run `npx prisma generate` after updating `prisma/schema.prisma`.
- **Admin Access:** All admin mutations and reads require `requireAdmin()`.
- **Zero Regressions:** Pass `npm run check` (lint, typecheck, tests, build) before committing.
- **Commit Rules:** Do not add `Co-Authored-By` trailers in git commits.

---

## Review Focus

1. **Edge Case: Zero or Missing Runtime:** Titles with runtime `0`, `null`, or undefined must NOT be categorized as Short Film. Only positive runtimes `1 <= runtime <= cutoff` qualify.
2. **Type Protection: Series Exemption:** TV Series and episodes must never have their category automatically set to Short Film by this movie runtime rule.
3. **Manual Override Integrity:** An admin editing a title must be able to change, add, or clear the `category` text field freely without it being reverted on edit save.
4. **Card Badge Priority:** On `MediaCard`, if a custom badge is passed (such as Trending rank number), that custom badge should take precedence or coexist cleanly without breaking card layout.
5. **Idempotent Backfill:** Existing movies in the database with `runtimeMinutes <= cutoff` should be safely backfillable without overwriting custom categories already set.

---

### Task 1: Database Schema & Prisma Client Generation

**Files:**
- Modify: `prisma/schema.prisma:155-156` (Media model)
- Modify: `prisma/schema.prisma:610-615` (SiteSetting model)

**Interfaces:**
- Produces: `Media.category` (`String?`)
- Produces: `SiteSetting.shortFilmCutoffMinutes` (`Int @default(40)`)

- [ ] **Step 1: Update `prisma/schema.prisma`**

In `model Media`:
```prisma
  /// Category taxonomy under type movie/series (e.g. "Short Film").
  category       String?
```

In `model SiteSetting`:
```prisma
  /// Maximum runtime in minutes to automatically categorize imported movies as "Short Film" (e.g. 30 or 40).
  shortFilmCutoffMinutes Int @default(40)
```

- [ ] **Step 2: Push database schema and run Prisma generator**

Run: `npx prisma db push; npx prisma generate`
Expected: Database schema synchronized, Prisma client generated at `src/generated/prisma`.

- [ ] **Step 3: Verify TypeScript compiles with the new fields**

Run: `npx tsc --noEmit`
Expected: PASS (0 errors).

---

### Task 2: Site Settings Management & Admin Settings UI

**Files:**
- Modify: `src/lib/site-settings.ts`
- Modify: `src/components/admin/SettingsTabs.tsx`
- Modify: `src/lib/site-settings.test.ts`

**Interfaces:**
- Consumes: `SiteSetting.shortFilmCutoffMinutes`
- Produces: `SiteSettingsData.shortFilmCutoffMinutes: number`
- Produces: `UpdateSiteSettingsInput.shortFilmCutoffMinutes?: number`

- [ ] **Step 1: Write the failing unit tests in `src/lib/site-settings.test.ts`**

Add tests to verify:
1. `DEFAULT_SETTINGS.shortFilmCutoffMinutes` equals `40`.
2. `updateSiteSettings` handles `shortFilmCutoffMinutes` from form data and raw object, validating bounds (`1` to `300`).

```ts
it("includes default shortFilmCutoffMinutes of 40", () => {
  expect(DEFAULT_SETTINGS.shortFilmCutoffMinutes).toBe(40);
});

it("updates shortFilmCutoffMinutes within valid bounds", async () => {
  const result = await updateSiteSettings({ shortFilmCutoffMinutes: 30 });
  expect(result.ok).toBe(true);
  expect(mockUpsert).toHaveBeenCalledWith(
    expect.objectContaining({
      update: expect.objectContaining({ shortFilmCutoffMinutes: 30 }),
    })
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/site-settings.test.ts`
Expected: FAIL (`shortFilmCutoffMinutes` is undefined).

- [ ] **Step 3: Update `src/lib/site-settings.ts`**

1. Add `shortFilmCutoffMinutes: number` to `SiteSettingsData`.
2. Add `shortFilmCutoffMinutes: 40` to `DEFAULT_SETTINGS` and `FAIL_SAFE_SETTINGS`.
3. Add `shortFilmCutoffMinutes?: number` to `UpdateSiteSettingsInput`.
4. In `updateSiteSettings`, parse and sanitize `shortFilmCutoffMinutes`:
   - Clamp between `1` and `300` minutes.
   - Include in `db.siteSetting.upsert` create and update data.

- [ ] **Step 4: Update `src/components/admin/SettingsTabs.tsx`**

1. Add `shortFilmCutoffMinutes` state initialized to `String(initialSettings.shortFilmCutoffMinutes ?? 40)`.
2. In the Settings form (under General or Catalog section), add an input field:
   - Label: "Short Film Runtime Cutoff (minutes)"
   - Type: `number`, min: `1`, max: `300`
   - Description / hint: "Imported movies with runtime less than or equal to this duration will automatically receive the 'Short Film' category."
3. Include `shortFilmCutoffMinutes: Number(shortFilmCutoffMinutes)` in `handleSubmit` payload.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/site-settings.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma src/lib/site-settings.ts src/lib/site-settings.test.ts src/components/admin/SettingsTabs.tsx
git commit -m "feat: add short film cutoff runtime site setting"
```

---

### Task 3: Title Form & Catalog Actions (Admin Edit Page)

**Files:**
- Modify: `src/lib/media.ts:12-28`
- Modify: `src/lib/title-form.ts`
- Modify: `src/lib/title-form.test.ts`
- Modify: `src/lib/title-store.ts`
- Modify: `src/components/admin/TitleForm.tsx`

**Interfaces:**
- Produces: `Media.category?: string | null`
- Produces: `TitleInput.category: string | null`
- Produces: `TitleValues.category: string`
- Produces: `titleData` writes `category: input.category`

- [ ] **Step 1: Write the failing tests in `src/lib/title-form.test.ts`**

Add tests for:
1. `TITLE_FIELDS` includes `"category"`.
2. `emptyTitleValues().category` equals `""`.
3. `parseTitle` parses optional `category` (trims whitespace, limits to 60 characters).
4. `titleValues` maps `row.category` into `values.category`.

```ts
it("parses valid category and trims whitespace", () => {
  const result = parse({ ...validValues, category: "  Short Film  " });
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.data.category).toBe("Short Film");
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/title-form.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update `src/lib/media.ts`**

Add `category?: string | null;` to `export type Media`.

- [ ] **Step 4: Update `src/lib/title-form.ts`**

1. Add `"category"` to `TITLE_FIELDS`.
2. Add `category: string | null;` to `TitleInput`.
3. In `parseTitle`:
   - Check `check("category", optionalText(values.category, 60));`
   - In return data: `category: values.category?.trim() || null`
4. In `titleValues(row)`:
   - Accept `category?: string | null`
   - Map `category: row.category ?? ""`

- [ ] **Step 5: Update `src/lib/title-store.ts`**

In `titleData(type: MediaType, input: TitleInput)`:
```ts
category: input.category ?? null,
```

- [ ] **Step 6: Update `src/components/admin/TitleForm.tsx`**

Add a `TextField` for `category` in `TitleForm.tsx`:
```tsx
<TextField
  name="category"
  label="Category"
  optional
  hint='Taxonomy classification (e.g. "Short Film"). Automatically assigned on import if runtime <= cutoff.'
  defaultValue={values.category}
  error={errors.category}
  maxLength={60}
/>
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/lib/title-form.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/media.ts src/lib/title-form.ts src/lib/title-form.test.ts src/lib/title-store.ts src/components/admin/TitleForm.tsx
git commit -m "feat: add category field to title form and title store"
```

---

### Task 4: Auto-Categorization on Import (Single TMDB & IMDb Batch)

**Files:**
- Modify: `src/lib/import-mapping.ts`
- Modify: `src/lib/import-mapping.test.ts`
- Modify: `src/lib/title-import.ts`
- Modify: `src/lib/admin-imdb-batch-actions.ts`
- Create: `src/lib/category-backfill.ts`
- Create: `src/lib/category-backfill.test.ts`

**Interfaces:**
- Consumes: `shortFilmCutoffMinutes` from `getSiteSettings()`
- Produces: `values.category = "Short Film"` when `type === "movie"` and `runtimeMinutes <= cutoff`

- [ ] **Step 1: Write the failing tests in `src/lib/import-mapping.test.ts`**

Test auto-categorization logic:
1. Movie with runtime 15 min and cutoff 30 min -> `category: "Short Film"`.
2. Movie with runtime 30 min and cutoff 30 min -> `category: "Short Film"`.
3. Movie with runtime 31 min and cutoff 30 min -> `category: ""`.
4. Movie with runtime 0 or missing -> `category: ""`.
5. Series with runtime <= 30 min -> `category: ""` (series are not short films).

```ts
it("categorizes movie as Short Film when runtime <= shortFilmCutoffMinutes", () => {
  const shortMovie = { ...TMDB_MOVIE, runtime: 25 };
  const values = tmdbValues("movie", shortMovie, "movie", { shortFilmCutoffMinutes: 30 });
  expect(values.category).toBe("Short Film");
});

it("does not categorize movie as Short Film when runtime > shortFilmCutoffMinutes", () => {
  const featureMovie = { ...TMDB_MOVIE, runtime: 95 };
  const values = tmdbValues("movie", featureMovie, "movie", { shortFilmCutoffMinutes: 30 });
  expect(values.category).toBe("");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/import-mapping.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update `src/lib/import-mapping.ts`**

1. In `tmdbValues(kind, details, type, options?: { shortFilmCutoffMinutes?: number })`:
   - If `type === "movie"`, read `runtime = positiveWhole(...)`.
   - If `options?.shortFilmCutoffMinutes !== undefined`:
     ```ts
     const runtimeNum = Number(values.runtime);
     if (runtimeNum > 0 && runtimeNum <= options.shortFilmCutoffMinutes) {
       values.category = "Short Film";
     }
     ```
2. In `fillGaps(values, extra, options?: { shortFilmCutoffMinutes?: number })`:
   - If `values.category` is still empty and `options?.shortFilmCutoffMinutes`:
     ```ts
     const runtimeNum = Number(result.runtime);
     if (runtimeNum > 0 && runtimeNum <= options.shortFilmCutoffMinutes) {
       result.category = "Short Film";
     }
     ```

- [ ] **Step 4: Update `src/lib/title-import.ts`**

In `prepareImport` and `freshValues`:
1. Call `const settings = await getSiteSettings();`.
2. Pass `{ shortFilmCutoffMinutes: settings.shortFilmCutoffMinutes }` into `tmdbValues`.
3. Ensure that if `type === "movie"`, `values.category` is set to `"Short Film"` if `Number(values.runtime) <= settings.shortFilmCutoffMinutes`.

- [ ] **Step 5: Update `src/lib/admin-imdb-batch-actions.ts`**

In `processImdbBatchItemAction`:
1. Call `const settings = await getSiteSettings();`.
2. After resolving `values.runtime`:
   ```ts
   if (targetType === "movie") {
     const runtimeNum = Number(values.runtime);
     if (runtimeNum > 0 && runtimeNum <= settings.shortFilmCutoffMinutes) {
       values.category = "Short Film";
     }
   }
   ```

- [ ] **Step 6: Implement `backfillShortFilmCategories` in `src/lib/category-backfill.ts`**

Implement an idempotent backfill helper:
```ts
export async function backfillShortFilmCategories(cutoff?: number) {
  const settings = await getSiteSettings();
  const threshold = cutoff ?? settings.shortFilmCutoffMinutes;
  
  // Find all movies with runtimeMinutes > 0 and <= threshold that don't have category set
  const result = await db.media.updateMany({
    where: {
      type: "movie",
      runtimeMinutes: { gt: 0, lte: threshold },
      category: null,
    },
    data: {
      category: "Short Film",
    },
  });
  return { updated: result.count };
}
```
Add unit tests in `src/lib/category-backfill.test.ts`.

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/lib/import-mapping.test.ts src/lib/category-backfill.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/import-mapping.ts src/lib/import-mapping.test.ts src/lib/title-import.ts src/lib/admin-imdb-batch-actions.ts src/lib/category-backfill.ts src/lib/category-backfill.test.ts
git commit -m "feat: auto-categorize short films on single and batch import"
```

---

### Task 5: Public Site Badge & Catalog Taxonomy Display

**Files:**
- Modify: `src/lib/catalog.ts`
- Modify: `src/components/MediaCard.tsx`
- Modify: `src/components/PosterCard.tsx`
- Modify: `src/components/TitleDetail.tsx`

**Interfaces:**
- `CARD` includes `category: true`
- `CARD_COLUMNS` includes `, category`
- `toMedia` maps `category: row.category ?? undefined`
- `listTitles` filters on `category?: string`
- `MediaCard`, `PosterCard`, and `TitleDetail` render `<Badge tone="brand" size="sm">Short Film</Badge>`

- [ ] **Step 1: Update `src/lib/catalog.ts`**

1. In `const CARD`:
   ```ts
   category: true,
   ```
2. In `const CARD_COLUMNS`:
   Include `, category` in the raw SQL select.
3. In `function toMedia(row: CardRow): Media`:
   ```ts
   category: row.category ?? undefined,
   ```
4. In `export type TitleFilter`:
   Add `category?: string;`
5. In `listTitles`:
   Add `category: filter.category ? filter.category : undefined,` to `where`.

- [ ] **Step 2: Update `src/components/MediaCard.tsx`**

In `MediaCard.tsx`, render the category badge if no other `badge` prop was provided:
```tsx
const displayBadge =
  badge ??
  (item.category ? (
    <Badge tone="brand" size="sm">
      {item.category}
    </Badge>
  ) : null);

{displayBadge && <span className="absolute left-2 top-2 z-10">{displayBadge}</span>}
```

- [ ] **Step 3: Update `src/components/PosterCard.tsx`**

In `PosterCard.tsx`:
```tsx
{media.category && (
  <span className="absolute left-2 top-2 z-10">
    <Badge tone="brand" size="sm">
      {media.category}
    </Badge>
  </span>
)}
```

- [ ] **Step 4: Update `src/components/TitleDetail.tsx`**

In `TitleDetail.tsx` metadata row (near year and maturity rating):
```tsx
{title.category && (
  <Badge tone="brand" size="sm">
    {title.category}
  </Badge>
)}
```

- [ ] **Step 5: Run catalog and UI tests**

Run: `npx vitest run src/lib/title-extras.test.ts src/lib/browse.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/catalog.ts src/components/MediaCard.tsx src/components/PosterCard.tsx src/components/TitleDetail.tsx
git commit -m "feat: render short film badge on public cards and title details"
```

---

### Task 6: Full Verification & Quality Gate

**Files:**
- Run full test suite and verification scripts

- [ ] **Step 1: Execute backfill for existing titles**
Run scratch script or migration step to ensure existing movies with `runtimeMinutes <= cutoff` receive `"Short Film"` category.

- [ ] **Step 2: Run `npm run check`**
Run: `npm run check`
Expected:
1. `npm run lint` -> 0 errors, 0 warnings.
2. `npm run typecheck` -> 0 errors.
3. `npm test` -> All 50+ test suites passing.
4. `npm run build` -> Next.js production build succeeds.

- [ ] **Step 3: Git status & push check**
Verify git log and working tree are clean.
