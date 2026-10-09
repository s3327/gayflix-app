# Gayflix

Public-facing site, phase 1 (UI/UX only — no backend/streaming yet).

## Stack

- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS**, configured with the full approved design token system
- Fonts self-hosted via `next/font/google`: **Baloo 2** (display) / **Inter** (body)

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000 — you should see a dark placeholder page with a
pink "Play" button, a secondary "My List" button, and three genre chips.
That confirms fonts + colors are wired correctly. Replace `app/page.tsx`
once real page designs come in.

## Design tokens

Every color/font token lives in **`tailwind.config.ts`**, matching
`gayflix-design-tokens.html` (the approved v1 reference sheet) exactly.
Never hardcode a hex value in a component — pull from the token classes:

| Purpose | Class example |
|---|---|
| Primary button | `bg-brand-pink hover:bg-brand-pink-light active:bg-brand-pink-dark` |
| Secondary button | `border border-border-strong hover:bg-bg-elevated` |
| Link | `text-brand-pink hover:text-brand-pink-light` |
| Page background | `bg-bg-base` |
| Card / row background | `bg-bg-surface` |
| Modal / hovered card | `bg-bg-elevated` |
| Body text | `text-ink-primary` / `text-ink-secondary` / `text-ink-muted` |
| Genre chip (pick one) | `bg-pride-red-light` / `bg-pride-yellow` / `bg-pride-blue-light` / etc. |
| Display heading | `font-display` |
| Body/UI text | `font-body` |
| Focus ring | automatic via `:focus-visible` in `globals.css` (yellow, not pink) |

## Project structure

```
src/app/
  layout.tsx         → fonts, global <html>/<body> setup — NO header here
  globals.css         → Tailwind directives + base dark-theme resets
  page.tsx            → domain.com — marketing landing page (placeholder, no header)
  (main)/
    layout.tsx         → renders <Header/>, wraps every route below
    home/page.tsx       → domain.com/home — the real home page (hero + rows)
    search/page.tsx     → placeholder (search icon in header links here)
    user/page.tsx       → placeholder (account icon in header links here)
src/components/
  Header.tsx          → global site header — logo, search icon, account icon
  PosterCard.tsx       → single title card (title/year/duration below the poster)
  ContentRow.tsx        → horizontal-scrolling row of PosterCards
src/lib/
  mock-titles.ts       → placeholder catalog data — swap for real DB queries later
public/brand/          → logo assets (full lockup, icon-only, wordmark+tagline)
tailwind.config.ts     → design token system (source of truth for color/type)
```

## Routing split: landing vs. app

`domain.com/` (root) and `domain.com/home` are deliberately different pages:

- **`/` (root layout only)** — the pre-login marketing/landing page. No
  `<Header/>` — it'll likely want its own simpler or fully custom top
  treatment later (logo + sign up CTA, no search/account icons).
- **`/home` and everything else under the `(main)` route group** — the real
  browsing experience. `src/app/(main)/layout.tsx` renders `<Header/>` once, so
  every current and future page in that group (`/home`, `/search`, `/user`,
  and later `/browse`, `/title/[id]`, etc.) gets it automatically without
  re-importing it per page. The `(main)` folder name is a Next.js **route
  group** — the parentheses mean it doesn't add a URL segment, so
  `src/app/(main)/home/page.tsx` is still just `/home`.

## Home page

`src/app/(main)/home/page.tsx` — a hero banner (featured title, gradient
standing in for a real backdrop image, Play / More Info buttons), followed
by:

- **Continue Watching** — landscape thumbnails with a progress bar per
  title (`src/components/ContinueWatchingSection.tsx` +
  `ContinueWatchingCard.tsx`). Always exactly **one row**, capped at the
  6 most recent items regardless of how large the real history is —
  **3 cards on mobile, 4 on tablet, 6 on desktop**. This is a fixed grid
  (not horizontally scrolling like the rows below it): each breakpoint's
  column count is matched by hiding the extra pre-rendered cards via CSS
  rather than letting the grid wrap, so it can never spill onto a second
  row. Uses mock data (`src/lib/mock-continue-watching.ts`) — swap for a
  real query (`ORDER BY last_watched_at DESC LIMIT 6`) once accounts and
  watch history exist.
- **Trending Now** — different layout mechanics per breakpoint, not just a
  scaled-down version of one layout:
  - **Desktop (lg+):** all 6 titles in a single fixed row (`grid-cols-6`),
    centered on screen (`max-w-[1440px] mx-auto`), no scrolling
  - **Tablet (sm–lg):** a swipeable horizontal row — ~4 cards visible at
    once, swipe/scroll to reach the remaining 2 (6 total)
  - **Mobile (<sm):** a fixed 3×2 grid — all 6 titles, exactly 2 rows,
    no scrolling
  - Implemented in `src/components/TrendingNowSection.tsx` as three
    separate containers, each shown/hidden per breakpoint via Tailwind's
    `hidden`/`sm:flex`/`lg:grid` utilities — the layout *model* changes
    (grid vs. scroll-flex), not just the column count, so one responsive
    grid alone couldn't express this.
  - Has its own "See More" button (top-right of the section header,
    `ChevronRight` icon) — no route wired up yet, visual only.
  - **Swipe affordance on tablet:** `src/components/SwipeableRow.tsx` (a
    small client component) wraps the tablet scroll row. It fixes a real
    CSS Scroll Snap gotcha — a scroll-snap container's `padding` isn't
    automatically respected by the snap alignment itself, so without
    matching `scroll-padding` the row visually drifts flush to the left
    edge instead of lining up with the sections above/below it. It also
    shows a fade + arrow button on whichever edge still has unscrolled
    content, and hides it once you've reached that end — so it's visually
    obvious there's more to swipe to. The same scroll-padding fix was
    applied to `ContentRow.tsx` (New Releases), since it had the identical
    underlying issue even though it wasn't flagged there yet.
  - **Click-and-drag scrolling for mouse users:** touch devices get native
    swipe scrolling for free, but a plain desktop mouse has no way to
    scroll a horizontal row at all otherwise. `SwipeableRow` adds
    pointer-based drag-to-scroll (mouse only — touch is untouched, still
    native), with a `grab`/`grabbing` cursor and drag-vs-click detection
    so dragging across a poster doesn't accidentally "click" it. This also
    means the row is testable with a normal cursor, no DevTools
    touch-emulation needed.
  - **`PosterCard.tsx`** was refactored to fill `w-full` of whatever
    container it's placed in, rather than hardcoding its own pixel width.
    The fixed `150px`/`180px` sizing used by scrolling rows now lives in
    the wrapping `<div>` inside `ContentRow.tsx` instead — this is what
    let Trending Now reuse the exact same card (same aspect ratio, same
    padding, same hover treatment) in a fixed-column grid without
    touching how it looks in New Releases's scroll row.
- **Caption placement:** title/year/duration used to be overlaid on top of
  the poster image itself. Moved below the poster instead (matching
  `ContinueWatchingCard`'s pattern) — this applies everywhere `PosterCard`
  is used (Trending Now and New Releases both), since it's the same
  shared component.
- **New Releases, Movies, Series** — all three share one generic
  component, `src/components/TitleGridSection.tsx` (originally built as a
  one-off for New Releases, generalized once Movies and Series needed the
  identical structure). Fixed 12-card grid, no scrolling:
  - **Desktop (lg+):** 6 columns × 2 rows, centered (`max-w-[1440px] mx-auto`)
  - **Tablet (sm–lg):** 4 columns × 3 rows
  - **Mobile (<sm):** 3 columns × 4 rows
  - All three breakpoints are the *same* `grid-cols-3 sm:grid-cols-4
    lg:grid-cols-6` element — unlike Trending Now, this doesn't need
    separate layouts or per-index hiding, because 12 divides evenly by
    every breakpoint's column count (12÷3=4, 12÷4=3, 12÷6=2), so the grid
    just wraps to the right row count on its own.
  - Each has its own "See More" button (top-right, `ChevronRight`, no
    route yet), matching Trending Now.
  - Usage is just `<TitleGridSection title="Movies" titles={movies} />` —
    swap in whatever 12+ items you want under whatever heading.
  - `mock-titles.ts` now exports `newReleases`, `movies`, and `series`,
    12 items each, so all three grids have enough data.
  - `ContentRow.tsx` (the old generic scrolling-row component New
    Releases used before it became a grid) is no longer referenced
    anywhere, but left in place — still a valid, reusable
    horizontally-scrolling row for a future section (e.g. "Recently
    Added") if one comes up.

Poster/thumbnail art throughout used to be a plain gradient per title —
see the "Real placeholder images" section below for what replaced that.

## Real placeholder images (Picsum)

Every title across the homepage (Hero, Continue Watching, Trending Now,
New Releases/Movies/Series) now renders an actual photo instead of a flat
gradient block, so the page reads like it's pulling from a real
database/CDN rather than obviously-fake color swatches.

- **`https://picsum.photos`** — a free placeholder-photo service. URLs are
  seeded by each title's existing `id` (`poster("chosen-family")` →
  `picsum.photos/seed/chosen-family/500/750`), so a given title always
  gets the *same* photo across reloads — deterministic, not random each
  render.
- **`mock-titles.ts`** — `Title` gained `posterUrl` (portrait, 2:3, every
  entry) and `backdropUrl` (landscape, 16:9, currently only set on
  `featuredTitle` for the Hero). The `poster()`/`backdrop()` helper
  functions live at the top of the file; all 42 catalog entries were
  updated via a one-time script rather than by hand, to avoid
  transcription errors across that many rows.
- **`mock-continue-watching.ts`** — `ContinueWatchingItem` gained
  `imageUrl` (landscape, 16:9), same seeding approach.
- **`PosterCard.tsx` / `ContinueWatchingCard.tsx`** — now render a real
  `next/image` with `fill` + `object-cover`. The `gradient` field wasn't
  removed from the data — it's kept as the `<div>`'s own background color,
  sitting *behind* the `<Image>`, so there's a themed color (not a blank
  flash) visible for the instant before the photo finishes loading.
- **Hero** — same treatment, `featuredTitle.backdropUrl` now renders
  behind the existing darkening gradients (unchanged layout/copy — the
  Hero redesign is still explicitly deferred, this only swapped what
  fills the background). The brand gradient wash was kept too, but
  reduced to `opacity-40` with `mix-blend-multiply`, tinting the photo
  with the brand gradient rather than fully hiding it.
- **`next.config.mjs`** — `picsum.photos` added to `images.remotePatterns`,
  required for `next/image` to optimize external images from a new host.
- **Scope:** this covers what's visible on the homepage, as asked. The
  movie/watch detail pages' large poster panels use a separate mock file
  (`mock-movie-details.ts`) and still render gradients — say the word if
  you want that extended too.

## Header

`src/components/Header.tsx` is rendered once from `src/app/(main)/layout.tsx`, so
it's on every page in that group automatically — but NOT on the root
landing page (`/`), which is intentional (see routing split above). It's a
plain Server Component (no client-side state), sticky to the top of the
viewport, using the `gayflix-logo-tagline.png` lockup on the left and
`Search` / `User` icons (from `lucide-react`) on the right, linking to
`/search` and `/user`.

## Nav menu

`src/components/NavMenu.tsx` — the secondary bar directly below the
header (`src/app/(main)/layout.tsx`, same scoping as `Header`/`Footer`:
every page in the `(main)` group, not the root landing page). It's a
client component (needs `usePathname` to highlight the active item), also
sticky (`top-16 sm:top-20`, stacking right under the header's own sticky
position), and horizontally scrollable with hidden scrollbars on narrow
screens rather than wrapping to a second line.

- **`nav-menu-items.ts`** — the menu items (label + href) live in one
  array, single source of truth. Add/reorder/rename items there; you
  mentioned more might come later, so this is set up to make that trivial.
- Current items: **Home, Trending, New Releases, Browse, Genre, Country,
  Year, Language**
- Active state: current page's link turns brand pink
  (`aria-current="page"` set too, for accessibility)
- **All 7 new destinations get a real (non-blank) placeholder page** —
  `src/components/PagePlaceholder.tsx` (new, public-site version;
  distinct from the admin panel's `PagePlaceholder` — different visual
  treatment for a different context) renders a heading + a description of
  what will eventually live there, same pattern already used for early
  admin pages. Home already existed with real content, so it just links
  to the existing `/home`.

## Header / NavMenu responsive behavior

Three distinct states, not just scaled-down versions of one layout:

- **Desktop (lg+):** full "gayflix" tagline lockup in the header, centered.
  NavMenu links at their original size (`text-sm`).
- **Tablet (sm–lg):** header logo swaps to **icon-only** (`gayflix-icon.png`
  instead of the tagline lockup) — two `<Image>`s are rendered with one
  hidden via CSS (`lg:hidden` / `hidden lg:block`) rather than swapped in
  JS, since which one shows is a pure breakpoint decision, no interactivity
  needed. NavMenu stays visible but at a smaller size (`text-xs`, scaling
  back up to `text-sm` at `lg:`). Search/account icons were already
  icon-only with no label at every size — nothing changed there, that was
  by design from the start, not something narrower screens needed to drop.
- **Mobile (<sm):** logo stays icon-only and centered. NavMenu is hidden
  entirely (`hidden sm:block` on its wrapper) rather than shown at an even
  smaller size — at this width a horizontal link row stops being usable
  regardless of font size. In its place, the header's reserved left slot
  (previously an empty spacer, kept specifically for this) becomes a
  `Menu` (hamburger) icon button. **Not wired up to open anything yet** —
  this is the visual groundwork for a future mobile nav drawer, not a
  functional menu.

**Bug fix — off-center header at tablet/desktop:** the hamburger's
container is a grid item in the header's `grid-cols-[1fr_auto_1fr]`
layout. It was initially hidden at `sm:` and up with `hidden`
(`display:none`) — but CSS Grid removes a `display:none` item from grid
placement *entirely*, not just visually. With only 2 real items left for
3 declared columns, the grid collapsed to `[logo][icons][empty]` instead
of `[empty][logo][icons]`, shoving the logo left instead of keeping it
centered — exactly the tablet/desktop-only misalignment reported (mobile
was fine, since the hamburger is a real visible grid item there). Fixed
by using `invisible` (`visibility:hidden`) instead: the column's space
stays reserved for centering math, it just doesn't render visually when
not needed.

## Footer

`src/components/Footer.tsx` — rendered once from
`src/app/(main)/layout.tsx`, same scoping as `Header` (on every page in
that group, not on the root landing page `/`).

- Brand block (tagline lockup + one line of description), three link
  columns (Browse / Company / Legal), and a bottom bar with a copyright
  line + a small tagline-ish sign-off
- None of the links go anywhere yet — they're `<button>`s, not `<Link>`s,
  consistent with the "no route yet" pattern used everywhere else in this
  project (no `/about`, `/terms`, `/privacy`, etc. pages exist)
- **Deliberately no social media icons.** lucide-react's brand icons
  (Twitter, Facebook, Instagram, Linkedin, Github) are deprecated and
  have been removed entirely in recent versions of the library, since
  they're trademarked logos rather than generic icons — not something
  worth building on. If social links are wanted later, that'll need a
  dedicated icon set brought in specifically for that.

## Brand assets

All three logo files live in `public/brand/`, referenced by URL path (not
imported as modules — that's the correct pattern for anything in Next's
`public/` folder):

- `gayflix-logo-full.png` — full lockup (icon + wordmark + tagline)
- `gayflix-icon.png` — "G" play-button icon only
- `gayflix-logo-tagline.png` — wordmark + tagline, no icon (used in the header)

**Compressed** — the originals were 1254–1536px source files (from the
uploaded artwork) being displayed at 32–56px everywhere in the app, 20–40×
more resolution than needed. Resized each to a size with comfortable
retina headroom for its actual largest on-screen use, then losslessly
re-compressed on top of that (`PIL`, `optimize=True` — no quality loss,
just better deflate compression than whatever tool originally exported
them):

| File | Before | After | New size | Used at (max) |
|---|---|---|---|---|
| `gayflix-icon.png` | 929KB | 180KB | 500×500 | ~40px |
| `gayflix-logo-tagline.png` | 622KB | 166KB | 600×600 | ~56px |
| `gayflix-logo-full.png` | 1.4MB | 302KB | 1000×667 | not currently used in code |

All `width`/`height` props on the `<Image>` components referencing these
files (`Header.tsx` ×2, `Footer.tsx`, `admin/Sidebar.tsx`,
`admin/login/page.tsx`) were updated to match the new actual file
dimensions.

## Next steps

- Share the UI design (Figma / screenshots) for: home/browse, title detail,
  search, and any auth pages
- We'll build out `app/browse/`, `app/title/[id]/`, the real `/search` and
  `/user` pages, and the `NavMenu` bar from there
- `next/image` should be used for all poster/thumbnail art — add your CDN
  domain to `next.config.mjs` under `images.remotePatterns` once you have one

## Admin panel (admin.domain.com)

Single Next.js app, single deploy — `src/middleware.ts` detects the
`admin.` hostname prefix and internally rewrites requests to `/admin/*`
(the visitor's address bar still shows `admin.domain.com`, never
`domain.com/admin`). As a safety net, the reverse is also blocked: visiting
`/admin/*` directly on the main domain redirects to `/`.

```
src/
  middleware.ts            → subdomain detection + rewrite
  app/
    admin/
      layout.tsx             → admin root layout — no public <Header/>
      page.tsx                → redirects to /admin/login for now
      login/page.tsx           → email + password + "forgot password?" (UI only)
      forgot-password/page.tsx → placeholder
```

**No auth logic yet** — the login form has no `onSubmit`/`action`, it's
markup and styling only, ready to wire up once a database + auth provider
(Neon Managed Better Auth, or otherwise) is chosen.

**Testing locally:** visit `http://admin.localhost:3000` — Chrome/Edge/
Firefox all resolve `*.localhost` to `127.0.0.1` automatically, no hosts
file editing needed. In production, point the `admin` subdomain at the
same deployment (e.g. add `admin.yourdomain.com` as a domain on the same
Vercel project) — no separate deploy required.

## Admin panel — sidebar + pages

Everything past login lives under `src/app/admin/(panel)/`, a route group
that wraps its pages with the collapsible left sidebar (`(panel)` doesn't
affect the URL — same trick as the public site's `(main)` group). `/login`
and `/forgot-password` sit outside this group, so they stay full-screen
with no sidebar.

```
src/app/admin/(panel)/
  layout.tsx           → renders <Sidebar/> + content area
  dashboard/page.tsx
  import/page.tsx
  library/
    movies/page.tsx
    series/page.tsx
    episodes/page.tsx
  upload/
    movies/page.tsx
    series/page.tsx
    episodes/page.tsx
  users/page.tsx
  trash/page.tsx
  setting/page.tsx
src/components/admin/
  nav-config.ts        → the menu structure (labels, hrefs, icons) — single
                          source of truth; edit this to add/reorder menu items
  Sidebar.tsx           → renders nav-config.ts, handles collapse + active state
  PagePlaceholder.tsx    → shared "not built yet" page shell (no fake data)
  ImportSearchBar.tsx    → search bar for the Import page (see below)
```

**Import page (`import/page.tsx`) — in progress:**
Only the search bar is built so far, per instruction — no result area yet.

- Text field (`flex-1` — takes all remaining space, pushes the rest right)
- **Search by** dropdown — Title (default) / IMDb ID. This is the gate
  that will later determine how the import process interprets the text
  field (title search vs. direct ID lookup); for now it just swaps the
  text field's placeholder between "Search by title" and "Search by ID".
  This is what made the component a client component (`"use client"`) —
  everything else here is static markup, but a dynamic placeholder needs
  actual state.
- **Media type** dropdown — options Movie (default) / Series
- **Source** dropdown — currently just `OMDb` (only option); adding TMDb
  later is one more `<option>`
- **Search** button — `Search` icon + label, no click handler yet
- All three dropdowns use native `<select>` with a custom chevron overlay
  (`appearance-none` + absolutely-positioned `ChevronDown`) rather than a
  hand-built dropdown component, so they're fully functional/
  keyboard-accessible without writing open/close state logic for
  something not wired to real data yet.

Next up: the 10×4 (40-card) result grid with pagination — not started.

**Sidebar behavior:**
- Collapse/expand toggle (top of sidebar) shrinks it to icon-only width;
  labels and dropdowns hide, icons stay
- **Library** and **Upload** are expandable groups — clicking toggles their
  Movies/Series/Episodes sub-items; auto-opens if you're already on one of
  their sub-pages on load
- Active state: exact-match pages get a pink background + pink text; when
  you're inside a group's sub-page, the group header itself also picks up
  a subtle highlight so you can tell which section you're in
- Every item has a hover state independent of active state

None of the placeholder destination pages have mock/fake data — each just
names what will eventually live there. **Library — Movies is the first
exception** (see below) since it needed real list data to demonstrate the
table/search UI.

**To test:** log in isn't wired up yet, so go straight to
`http://admin.localhost:3000/dashboard` to see the sidebar, or click
around — `/admin` itself still redirects to `/admin/login`.

## Library — Movies (`library/movies/page.tsx`)

First library list page — Series and Episodes aren't built yet, but this
was built with reuse in mind since they'll need the identical structure:

- **`LibrarySearchBar.tsx`** — text field (`flex-1`, "Search by title") +
  Status dropdown (All / Draft / Published, default All) + Search button.
  Same native-`<select>`-with-chevron-overlay pattern as the Import page's
  dropdowns.
- **`LibraryTable.tsx`** — checkbox / Title / Year / Status / Action
  columns:
  - Checkbox column exists for future bulk actions (draft/trash/publish
    in bulk) — not wired to any state yet, just present
  - Uses `table-fixed` so Year/Status/Action's widths are actually
    enforced instead of treated as hints — without it, the default table
    layout algorithm redistributes space based on content across every
    column, which is what caused Year/Status to drift wide with leftover
    gaps instead of Title claiming that space. With `table-fixed`, Title
    (no width set) automatically gets 100% of whatever's left over.
  - Status renders as a pill badge — green-tinted for Published, neutral
    gray for Draft
  - Action column is icon buttons (lucide `Pencil` / `Eye`+`EyeOff` /
    `Trash2`), not text labels — each has a native `title` attribute, so
    hovering shows a browser tooltip naming the action, no extra tooltip
    library needed. Publish/Unpublish swaps between `Eye`/`EyeOff` based
    on the row's current status. Trash is styled red
    (`text-status-error`).
  - Title itself is a clickable button (hover turns brand pink) — same
    for every action icon — but none of them are routed anywhere yet,
    per instruction ("we will route this later")
  - Rows are sorted newest-first by `createdAt` (actual `.sort()` in code,
    not just array order) — so newly imported/uploaded media will show up
    on top once real data exists
- **`mock-library.ts`** — mixed movie/series mock data on purpose, so the
  future Series library page can reuse the same source, just filtered by
  `type === "series"` instead of `"movie"`

## Setting (`admin/(panel)/setting/page.tsx`)

First pass — tab layout only, per instruction.

- **`SettingsTabs.tsx`** (new, client component — needs local state to
  switch tabs) — **General / Site / User / Ads**, underline-style tabs
  (active tab gets a pink underline + pink text, matches the visual
  language used elsewhere rather than introducing a new tab pattern)
- Tab *switching* is real — click between them, the content actually
  changes. What's behind each tab is still just a placeholder heading +
  one line describing what settings will eventually live there (site
  name/timezone for General, branding/SEO for Site, roles/permissions for
  User, ad network config for Ads) — no actual form fields yet
- Replaced the old `AdminPagePlaceholder`-based Setting page entirely

## Library — Series (`library/series/page.tsx`)

Reuses `LibrarySearchBar` and `LibraryTable` as-is — the only difference
from Movies is one extra column and the `type === "series"` filter.

- **Seasons/Episodes column** — added before Year, only on this page
  (`<LibraryTable items={seriesItems} showEpisodes />` — `showEpisodes`
  defaults to `false`, so Movies is unaffected). Reads
  **"1 Season · 8 Episodes"** rather than a slash-separated number pair
  (`8/1`) — that notation is genuinely ambiguous without a memorized
  convention (is it episodes/seasons or seasons/episodes?), so it's
  spelled out instead. Matches the vocabulary already used in
  `mock-titles.ts`, which stores series duration as `"3 Seasons"`, not a
  bare number.
- `LibraryItem` in `mock-library.ts` gained optional `seasons`/`episodes`
  fields (movies leave them `undefined`), and all 12 series titles from
  `mock-titles.ts`'s `series` array were added here too, each with a
  season/episode count and a mix of draft/published statuses.

## New Releases page (`(main)/new-releases/page.tsx`)

The full "browse everything, newest first" listing — distinct from the
home page's `New Releases` preview row (still uses `TitleGridSection`
with 12 items, unchanged).

- Removed the subtitle ("Every title recently added or published, newest
  first.") — heading only now.
- **"NEW" badge** — top-left of the poster, shown when a title's
  `createdAt` falls within the configured period (default: last 7 days).
  Computed via `is-new.ts`'s `isRecentlyAdded()` against
  `new-badge-config.ts`.
- **`Badge.tsx`** (new, shared) — tone (`brand`/`success`/`neutral`) +
  size (`sm`/`md`) variants. Used for the NEW badge (`brand`, `sm`) here,
  and the admin Library table's status pill (`Published`/`Draft`) was
  refactored to use it too (`success`/`neutral`, `md` — the default size
  matches its old hardcoded styling exactly, so no visual change there),
  so "reusable" means something concrete rather than just a single
  one-off usage.
- **`new-badge-config.ts`** (new) — `{ enabled: true, periodDays: 7 }`,
  a stand-in for what a real settings table would hold.
- **Same native responsive grid as Trending** — 24 total, 3 cols × 8 rows
  (mobile), 4 × 6 (tablet), 6 × 4 (desktop). Reused the exact same
  `PER_PAGE = 24` reasoning as Trending (divides evenly by every
  breakpoint's column count, so page size doesn't depend on viewport —
  stays a Server Component with plain `?page=` URL pagination).
- **Genuinely open-ended pagination, not capped like Trending.** Trending
  is explicitly "top 100" — a fixed-size ranked list. New Releases is
  "query all media," which by definition has no natural upper bound. To
  make that real rather than just claimed in copy:
  - **`mock-new-releases.ts`** generates **150** items (not 100) —
    deliberately larger than Trending's fixed dataset, so the two
    visibly behave differently (more pages here) rather than looking
    like the same data reshuffled.
  - `totalPages` is derived from `sorted.length` with no cap anywhere in
    the pagination math — if the mock pool were 1,500 items instead of
    150, or a real `COUNT(*)` from a database, the exact same code would
    still work correctly.
- **Newest-first, explicitly sorted** — `sorted = [...items].sort((a,b)
  => b.createdAt - a.createdAt)` rather than relying on the mock data
  already being constructed in that order. This matters once it's a real
  query: `ORDER BY created_at DESC` is an explicit instruction, not an
  assumption that rows happen to arrive in the right order — the mock
  should behave the same way.
- **No filter chips or sort toggle here**, unlike Trending — wasn't
  asked for, and "newest first" is the entire premise of the page rather
  than one of several options.
- ~~`NewReleaseCard.tsx`~~ — originally its own component (see below for
  why); **later merged into the shared `MediaCard.tsx`** once Genre
  needed the identical navigation/badge behavior — see "Shared
  components" section.
- **`TitleGridSection.tsx`** gained an optional `seeMoreHref` prop — when
  provided, "See More" renders as a real `<Link>`; otherwise it stays the
  non-functional button it always was. The home page's `New Releases`
  section now passes `seeMoreHref="/new-releases"`; `Movies` and `Series`
  still don't, since neither has a full-listing page yet.

## Shared components: MediaCard, MediaGrid, Pagination

Trending, New Releases, and Genre all share the same shape (24-item
responsive grid, Previous/Next pagination) but genuinely different query
logic (ranked top-100 + filter + sort vs. open-ended newest-first vs.
genre-filtered). Rather than one generic component trying to express all
three pages' filter/sort logic through props — which tends to produce a
harder-to-read abstraction than three plain pages, for little actual
savings — only the parts that were **exactly** identical were extracted:

- **`MediaCard.tsx`** — replaces `TrendingCard.tsx` and
  `NewReleaseCard.tsx`, which were near-duplicates differing only in
  their corner badge (rank number vs. "NEW" pill vs. none). Now one
  component with an optional `badge` slot (`React.ReactNode`) — callers
  pass whatever badge markup fits, or nothing. `TrendingCard.tsx` and
  `NewReleaseCard.tsx` were deleted.
- **`MediaGrid.tsx`** — just the responsive grid wrapper (`grid-cols-3
  sm:grid-cols-4 lg:grid-cols-6` + gaps), which was identical across all
  three pages.
- **`Pagination.tsx`** — the Previous/Next block, which was copy-pasted
  three times with zero real variation. Takes `page`, `totalPages`, and a
  `makeHref(page)` function — each page still owns its own query-string
  logic (type/sort for Trending, genre for Genre, plain `?page=` for New
  Releases) and just hands `Pagination` a function to build the right
  URL for a given page number.
- **`is-new.ts`** (new, `src/lib/`) — the "is this within the NEW-badge
  period" check was inline in the old `NewReleaseCard`; pulled out since
  Genre also needed it once it started reusing `MediaCard`.
- **What stayed separate, deliberately:** the actual filter/sort/query
  logic in each page (type+sort for Trending, genre derivation for
  Genre, plain newest-first for New Releases) — that's real per-page
  business logic, not boilerplate, and forcing it into one shared
  "query" prop would trade three readable page files for one harder-to-
  follow generic one.

## Genre page (`(main)/genre/page.tsx`)

Same shape as New Releases (reuses its exact grid/pagination/card
approach), with genre filter chips added below the heading.

- **Reuses `newReleaseItems`** (from `mock-new-releases.ts`) rather than
  a separate dataset — genre browsing is just another filtered view over
  the same "all media" catalog, not a different one. Also means
  `MediaCard` (poster, NEW badge logic via `is-new.ts`, navigation) works
  here unmodified — no new card component needed.
- **Chips are derived from the data, not hardcoded** — `Array.from(new
  Set(newReleaseItems.map(item => item.genre))).sort()`. "Query all genre
  from database" means the chip list reflects whatever genres actually
  exist in the catalog; adding a new genre to the data automatically adds
  its chip, nothing to maintain by hand.
- **All (default) + one chip per genre**, single-select — clicking a
  genre filters to just that one and resets to page 1; there's no
  separate "clear" control since clicking "All" does that.
- **State lives in the URL** (`?genre=Drama&page=2`), same pattern as
  Trending/New Releases — `buildHref()` composes chip links, Previous,
  and Next together.
- **Same responsive grid as Trending/New Releases** — 24 total, 3×8
  (mobile) / 4×6 (tablet) / 6×4 (desktop), Previous/Next as plain text.
- **Empty state** — if a genre has zero matching titles, shows "No
  titles found for this genre yet." instead of a blank grid (not
  currently reachable with this mock data, since chips are generated
  from genres that are guaranteed to have at least one title, but handled
  regardless for when this becomes a real query where that's not
  guaranteed).
- NavMenu's "Genre" item already pointed to `/genre` from when the nav
  was first built — no change needed there.

## Country page (`(main)/country/page.tsx`)

Identical structure to Genre — same grid, pagination, chip pattern — just
filtering by `country` instead of `genre`.

- **`mock-new-releases.ts` gained a `country` field** (12 countries,
  cycled by index same as `genre`), since it didn't have one before —
  Genre's `genre` field already existed on this dataset, Country needed
  its own equivalent added first.
- Chips are derived from the data the same way Genre's are —
  `Array.from(new Set(items.map(i => i.country))).sort()` — "query the
  media country from database" means the chip list reflects whatever
  countries actually exist in the catalog, nothing hardcoded.
- Same `MediaCard`/`MediaGrid`/`Pagination` components, same NEW badge
  logic, same empty state, same URL-based state (`?country=Japan&page=2`)
  — genuinely the same page shape as Genre, only the filtered field
  changed.
- NavMenu's "Country" already pointed to `/country` from when the nav
  was first built — no change needed there.

## Year page (`(main)/year/page.tsx`)

Same structure as Genre/Country, filtering by `year` instead — but with
one real modeling fix needed first.

- **`year` was decoupled from `createdAt`.** It used to be derived
  directly from `createdAt.getFullYear()` — fine when nothing filtered by
  year, but since all 150 items are dated within the last ~150 days, that
  would've clustered nearly everything into one single year, making a
  year filter pointless. Real streaming catalogs filter by *release*
  year, independent of when a title was added — a film can be from 2019
  and get added to the catalog today. `year` now cycles across an
  11-year span (2016–2026) on its own. This also makes the year already
  shown on every card elsewhere (New Releases, Genre, Country) more
  realistic — a small positive side effect, not a behavior change to
  guard against.
- **Chips sorted newest-first, numerically** — `.sort((a,b) => b - a)`,
  not the alphabetical `.sort()` Genre/Country use, since lexicographic
  vs. numeric sort happen to agree for same-length years but shouldn't be
  relied on to.
- Otherwise identical to Genre/Country: same grid, pagination, NEW badge,
  empty state, URL-based state (`?year=2021&page=2`).
- NavMenu's "Year" already pointed to `/year` — no change needed.

## Language page (`(main)/language/page.tsx`)

Same structure again, filtering by a new `language` field.

- **`mock-new-releases.ts` gained a `language` field** (11 languages,
  cycled by index, same approach as `genre`/`country`) — didn't exist
  before, same situation `country` was in last round.
- Chips derived from the data (`Array.from(new Set(...))`), alphabetical,
  same as Genre/Country.
- Same grid, pagination, NEW badge, empty state, URL-based state
  (`?language=Korean&page=2`).
- NavMenu's "Language" already pointed to `/language` — no change needed.

## Admin Setting → Site tab: NEW badge controls

First real settings form fields in the admin panel — every other tab
(General, User, Ads, and the rest of Site) is still just a description of
what will eventually live there; this one has an actual toggle + dropdown
as a concrete example of what that looks like.

- **Toggle** — "Show NEW badge on New Releases page," a custom switch
  (no native `<input type="checkbox">` styling used — a `button
  role="switch" aria-checked` with a sliding dot, for full control over
  the brand-pink/off states)
- **Period dropdown** — Last 3 days / **Last 7 days (default)** / Last 14
  days / Last month, disabled when the toggle is off
- Both seed their initial value from `new-badge-config.ts`, so the admin
  UI's defaults match what the public page is actually doing
- **Explicitly not wired to persist** — both controls are local
  `useState` only. Toggling them here has no effect on the public New
  Releases page, since there's no settings storage yet for the two sides
  to share. A note directly under the controls says this, so it's not a
  silent gap.

## Trending page (`(main)/trending/page.tsx`)

Top 100 by view count, responsive grid + pagination, type filter chips,
and an ascending/descending sort toggle.

- **Uniform 24-item pages, every breakpoint** — 6 cols × 4 rows (desktop),
  4 × 6 (tablet), 3 × 8 (mobile). 24 divides evenly by all three column
  counts with no remainder, so — unlike the previous iteration, which had
  a different page size per breakpoint (30/24/21) and therefore had to
  become a client component with viewport detection just to get
  pagination boundaries right — page size here no longer depends on the
  viewport at all. That's what let this **revert to a Server Component**
  with plain URL-based pagination, restored to shareable/bookmarkable
  `?page=` links.
- **Filter and sort also live in the URL now** (`?type=movie&sort=asc`),
  not local state — once pagination was back to being server-driven,
  keeping filter/sort as separate client state would've meant two
  different sources of truth for what's essentially one "current view."
  A `buildHref()` helper composes the query string for chips, the sort
  toggle, and Previous/Next together, omitting params that are already
  at their default (e.g. `?type=all` is never actually written) to keep
  URLs tidy.
- **`[movie]` `[series]` filter chips**, top-left of the grid — toggle
  style: click one to filter to just that type (active chip turns solid
  brand-pink), click the already-active one to go back to showing both.
  No separate "All" chip — that state is just "neither chip active."
- **Views sort toggle**, top-right — flips between "High to Low"
  (`ArrowDown`, default) and "Low to High" (`ArrowUp`). Changes display
  order only; each card's rank badge always shows that title's true rank
  from the full 100, so ascending mode shows `#100` first rather than
  renumbering it to `#1`.
- Changing the filter or sort resets the page back to 1 in the generated
  link — otherwise switching context mid-pagination could land you on a
  now-out-of-range empty page.
- **Time-range label** — the old subtitle ("The top 100 titles right now,
  ranked by views from user watch history.") was removed and replaced
  with a small pill next to the heading reading **"This Week."** It's
  hardcoded for now; the real toggle (This Week / This Month) is planned
  for **Admin → Setting → Site**, not built yet — `SettingsTabs.tsx`'s
  Site tab description was updated to mention it, so the two stay in
  sync as a forward reference until that setting actually exists.
- ~~`TrendingCard.tsx`~~ — originally its own component: poster + rank
  badge (`#1`, `#2`, ...) top-left, a real `<Link>` (not a `<button>`
  like `PosterCard` elsewhere), since clicking here was explicitly meant
  to navigate. **Later merged into the shared `MediaCard.tsx`** — see
  "Shared components" section above.
- **Pagination** — still plain **Previous**/**Next** text, no
  arrow/chevron icons, `<Link>`-based again via `buildHref()`.
- **Entry points** — home page's Trending Now "See More" routes here, and
  NavMenu's "Trending" item already pointed to `/trending`. Unchanged.

### The routing gap this exposed, and how it was closed

Clicking a Trending card needs to open a movie *or* series detail page —
but only 4 movies have full detail records, and **there was no series
detail page at all**. Rather than let most of Trending's 100 mock items
404, three things were added:

- **`find-basic-title.ts`** (new) — searches every mock data pool
  (`movies`, `series`, `newReleases`, `trendingNow` from `mock-titles.ts`,
  plus `trendingItems`) for a given id and returns whatever basic info
  exists (title/year/genre/duration/poster), regardless of which pool it
  came from.
- **`BasicTitleFallback.tsx`** (new) — a lightweight detail view (poster +
  title/year/genre/duration + an explicit "full details haven't been
  imported yet" note) for when only basic info is available.
- **`/movie/[id]`** now checks the rich `movieDetails` map first; if the
  id isn't there, it falls back to `findBasicTitle()` instead of an
  immediate `notFound()` — only truly-unknown ids still 404.
- **`/series/[id]`** (new) — there's no rich series-detail dataset at all
  yet, so this route always renders the fallback view. A full series page
  (season/episode list, cast, etc.) is a separate, bigger piece of work
  for later — this only makes sure Trending's series cards land somewhere
  real in the meantime.

## Movie detail page (`(main)/movie/[id]/page.tsx`)

Public site, not admin — dynamic route, under the `(main)` group so it
gets the public `<Header/>` like `/home`, `/search`, `/user` do.

Layout, top to bottom. Poster column: **poster**, then **Watch Now +
Favorite**. Details column: **Title (year) ★rating** on one line — kept
at the smaller `text-xl sm:text-2xl` size from when it briefly lived
above the poster, rather than reverting to the original `text-3xl
sm:text-4xl` — then **tagline** (conditional), **synopsis**, meta list,
then tags.

**Clickable meta values** — Director, each Cast member, Country,
Language, and each Genre use a shared `MetaLink` button (hover turns
brand pink + underlines); Cast/Genre render through a `MetaLinkList`
helper so each name/genre in a comma-separated list is independently
clickable while the commas stay plain text. Tag chips are now `<button>`s
too (brightness lift on hover) instead of static `<span>`s. **None of
these are routed anywhere yet** — this is purely the UI groundwork for
the `media_people` (director/cast), `media_country`, `media_language`,
`media_genre`, and `media_tags` filtered-listing pages you're planning,
which we're explicitly not building yet.

- **`mock-movie-details.ts`** — added `rating` (0–5), optional `tagline`,
  and `runtimeMinutes` to `MovieDetail`. Only 4 movies have full detail
  records (`chosen-family`, `provincetown`, `wildflower`,
  `the-proposal-party`) — anything else calls Next's `notFound()`. Test
  at `http://localhost:3000/movie/chosen-family`.
- **Still not wired up:** the home page's poster cards don't link here
  (every card across every row shares one `PosterCard` component — wiring
  that touches something already approved everywhere it's used), and
  Watch Now still isn't routed (no `/watch` page exists).
- Naming note: this still uses the existing `Title`/`name` vocabulary
  from `mock-titles.ts`, not the `Media`/`media.title` terms established
  for the import pipeline — that rename is still pending, as discussed.
- **Column alignment:** rather than padding the poster/button column to
  match a taller details column (the first attempt — pinning the button
  row to the bottom with `mt-auto`), the details column itself was
  compacted instead: tighter margins between every block, `gap-y-2`
  instead of `gap-y-3` in the meta `dl`, `leading-snug` instead of
  `leading-relaxed`, and `ReadMoreText`'s clamp reduced from 4 lines to 3
  (its only consumer, so this was safe to change globally). This gets the
  two columns close for the current mock content, but worth being clear:
  exact-pixel matching across *arbitrary* content (very long cast lists,
  long synopses) isn't really achievable through spacing/type tweaks
  alone — that would need JS measuring actual rendered height and
  dynamically scaling text, which wasn't in scope here.

## Recommendation section

Below a full-width divider (`<hr>`), the movie page ends with a "You Might
Also Like" row.

- **`RecommendationSection.tsx`** — a single swipeable row across *every*
  breakpoint, not a grid. Unlike `TitleGridSection` (mobile/tablet/desktop
  each get a genuinely different layout mechanism), here all three
  breakpoints use the same underlying row — they only differ in how many
  of the 12 cards are visible at once (3 mobile / 4 tablet / 6 desktop,
  via `basis-1/3 sm:basis-1/4 lg:basis-1/6`), matching the same
  visible-count convention already established for Trending Now.
- Reuses **`SwipeableRow`** (previously only wired up for Trending Now's
  tablet range) across all three breakpoints this time — circular chevron
  buttons that appear/disappear based on scroll position, native touch
  swipe, and mouse click-drag all come along for free since that
  component already had them built in.
- **Deliberately smaller cards, narrower container:** `PosterCard` itself
  wasn't touched — it already just fills whatever width its parent gives
  it. What makes these cards smaller is a narrower `max-w-[1040px] mx-auto`
  container (vs. the `1440px` used by the home page's full-width rows),
  which works out to roughly the same ~150px card width already proven to
  read fine elsewhere (`ContentRow`'s fixed-width scrolling cards use the
  same size). Centering that narrower container is what keeps the row in
  the middle of the screen rather than spanning edge to edge — the intent
  being this section reads as secondary, not competing with the main
  poster/details content above it for attention.
- Still UI-only — `newReleases` (filtered to exclude the current title)
  remains the placeholder data source; the admin setting for "related vs.
  new-release fallback" mode is still just a comment in the code, not
  built.

### Follow-up fixes to `SwipeableRow`

Three issues reported after reviewing this in the browser — since this
environment can't run a live browser to visually confirm CSS bugs like
these, these are reasoned-through fixes; worth actually re-checking in
your browser rather than taking pixel-perfect correctness for granted:

- **See More removed** from the Recommendation header — it was carried
  over from `TitleGridSection`'s pattern by default; removed since this
  section doesn't want it.
- **Chevron hover state:** the previous hover (`hover:bg-bg-elevated`, a
  subtle dark-gray shift) had very low contrast against the dark
  backdrop-blurred background, which is almost certainly why it read as
  "disappearing" rather than as a hover state — a low-contrast state
  change and a genuinely invisible one look the same at a glance. Changed
  to `hover:bg-brand-pink hover:text-ink-onBrand hover:scale-110` — a
  bright color shift plus a size change, which can't be mistaken for
  "gone."
- **"Little card peeking" past the edge:** the outer wrapper around the
  scrollable row had no `overflow-hidden`, so anything that didn't land
  exactly on the intended boundary — sub-pixel snap-alignment rounding,
  the fade gradient not precisely matching a partial card's true edge —
  could visually leak past the row instead of being clipped. Added
  `overflow-hidden` to that wrapper, which guarantees nothing escapes the
  box regardless of the underlying scroll math. Also added explicit
  `z-10`/`z-20` (fade below, button above) so button stacking can't
  theoretically lose to a card's own `group-hover:z-10` escalation.

Since `SwipeableRow` is shared, all three fixes also apply to Trending
Now's tablet swipe row, not just Recommendation.

## Watch page (`(main)/watch/[id]/page.tsx`)

Where Watch Now on the movie page now actually routes to — `Link
href={\`/watch/${movie.id}\`}` replaced the plain non-routed button. Same
`movieDetails` mock data source, same 4 titles have full records.

Top to bottom:
- **Player** — placeholder frame, `aspect-video`, 2px `border-strong`
  stroke as requested, no real video source yet (just says "Video player
  placeholder")
- **Server tabs** (`ServerTabs.tsx`, new client component) — genuinely
  clickable/switchable (local `useState`, first tab active by default),
  matching how other UI-only interactive pieces in this app work
  (Sidebar collapse, FavoriteButton, ReadMoreText). The actual server
  list will come from however a title's video sources get configured on
  the admin edit page later — not built yet.
- **Mini poster + info row** — small poster thumbnail beside "Title
  (year) ★rating" on one line, tagline below (conditional, same as the
  movie page), tag chips below that
- **Full-width divider**
- **Full synopsis** — deliberately *not* using `ReadMoreText` here, since
  you asked for the complete description, not a clamped one
- **Meta list** — same Genre/Director/Cast/Country/Language/Release
  Date/Runtime fields and order as the movie page, same clickable
  treatment

**`MetaLink.tsx`** (new, shared) — `MetaLink` and `MetaLinkList` were
pulled out of the movie page into their own file, since the watch page
needed the identical clickable-value pattern. The movie page now imports
from here instead of defining them locally — no behavior change there,
just removed duplication now that a second page needs the same thing.
