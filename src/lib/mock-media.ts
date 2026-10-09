import { type Media, poster, slugify } from "@/lib/media";

const ADJECTIVES = [
  "Midnight", "Paper", "Amber", "Distant", "Ordinary", "Loud", "Salt",
  "Painted", "Borrowed", "Northern", "Second", "Unspoken", "Blue",
  "Winding", "Modern", "Loose", "Nameless", "Open", "Stray", "Late",
];

const NOUNS = [
  "Signal", "Windows", "Company", "Roads", "Address", "Static", "Currents",
  "Doors", "Time", "Habits", "Verses", "Wonder", "Hour", "Ceiling",
  "Weather", "Ends", "Strangers", "Water", "Corners", "Motion",
];

const GENRES = [
  "Drama", "Comedy", "Romance", "Documentary", "Coming of Age", "Reality", "Musical",
];

const COUNTRIES = [
  "United States", "United Kingdom", "Canada", "Australia", "Brazil",
  "Mexico", "France", "Germany", "Spain", "South Korea", "Japan",
  "South Africa",
];

const LANGUAGES = [
  "English", "Spanish", "French", "Portuguese", "German", "Korean",
  "Japanese", "Italian", "Thai", "Tagalog", "Hindi",
];

const RELEASE_YEAR_SPAN = 11; // 2016–2026

function generateMediaItems(count: number): Media[] {
  const items: Media[] = [];
  const today = new Date();
  const currentYear = today.getFullYear();

  outer: for (const adj of ADJECTIVES) {
    for (const noun of NOUNS) {
      if (items.length >= count) break outer;

      const index = items.length; // 0 = newest (by createdAt)
      const title = `${adj} ${noun}`;
      const id = slugify(title);
      const isSeries = index % 4 === 0; // roughly 1 in 4 are series

      const createdAt = new Date(today);
      createdAt.setDate(today.getDate() - index); // one item "added" per day, going backward

      // Deliberately NOT derived from index/createdAt — if it were, "sort
      // by recently edited" would just reproduce "sort by recently
      // added" and there'd be no way to prove an old title bubbling back
      // to the top after being edited. This scrambles which items count
      // as "recently edited" independently of how old they are, via a
      // simple multiplicative hash rather than Math.random() (stays
      // deterministic across reloads/builds, like the rest of this file).
      const editScramble = (index * 37 + 11) % 200;
      const updatedAt = new Date(today);
      updatedAt.setDate(today.getDate() - editScramble);

      // Roughly 1 in 6 titles are still drafts — present in the catalog
      // (so admin's library list has something to show) but excluded
      // from public listings that filter on status, like /movie.
      const status: Media["status"] = index % 6 === 5 ? "draft" : "published";

      // Release year is independent of createdAt — a title can have been
      // made in 2019 but added to the catalog today. Deriving it from
      // createdAt instead (like an earlier version of this file did)
      // would cluster nearly every item into the same 1–2 years, since
      // createdAt only spans the last ~150 days — useless for a year
      // filter. This cycles across an 11-year span for real variety.
      const year = currentYear - (index % RELEASE_YEAR_SPAN);

      items.push({
        id,
        title,
        year,
        duration: isSeries
          ? `${1 + (index % 3)} Season${1 + (index % 3) === 1 ? "" : "s"}`
          : `1h ${15 + (index % 45)}m`,
        type: isSeries ? "series" : "movie",
        genre: GENRES[index % GENRES.length],
        country: COUNTRIES[index % COUNTRIES.length],
        language: LANGUAGES[index % LANGUAGES.length],
        posterUrl: poster(id),
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
        status,
      });
    }
  }

  return items;
}

// Placeholder — swap for a real query (`SELECT * FROM media`, no
// "new"/"trending" filter applied) once the database exists. This is the
// single shared catalog: New Releases sorts it newest-first with no cap;
// Genre/Country/Year/Language filter it by their respective field. 150
// items on purpose — larger than Trending's fixed 100, to actually
// demonstrate this list isn't capped the way Trending's "top 100" is.
export const mediaItems: Media[] = generateMediaItems(150);

// Public-facing listings and detail pages should read from this, not
// mediaItems directly — drafts exist in the catalog (so admin's Library
// page has something to manage) but shouldn't be visible or reachable
// anywhere a visitor can browse or search. See findBasicTitle.ts and
// every listing page under (main) for where this is actually enforced.
export const publishedMediaItems: Media[] = mediaItems.filter(
  (item) => item.status === "published"
);
