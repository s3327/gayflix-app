export type MediaType = "movie" | "series";
export type MediaStatus = "draft" | "published";

export type LibraryItem = {
  id: string;
  title: string;
  year: number;
  type: MediaType;
  status: MediaStatus;
  /** ISO date — list views sort newest first by this field. */
  createdAt: string;
  /** Series only. */
  seasons?: number;
  episodes?: number;
};

// Placeholder — swap for a real query (`ORDER BY created_at DESC`) once
// the database exists.
export const libraryItems: LibraryItem[] = [
  { id: "the-quiet-part", title: "The Quiet Part", year: 2026, type: "movie", status: "draft", createdAt: "2026-08-29" },
  { id: "confetti", title: "Confetti", year: 2025, type: "movie", status: "published", createdAt: "2026-08-27" },
  { id: "chosen-family-reunion", title: "Chosen Family: Reunion", year: 2026, type: "series", status: "draft", createdAt: "2026-08-26", seasons: 1, episodes: 8 },
  { id: "double-booked", title: "Double Booked", year: 2025, type: "movie", status: "published", createdAt: "2026-08-24" },
  { id: "one-more-summer", title: "One More Summer", year: 2024, type: "movie", status: "published", createdAt: "2026-08-22" },
  { id: "the-new-normal", title: "The New Normal", year: 2025, type: "series", status: "published", createdAt: "2026-08-20", seasons: 3, episodes: 24 },
  { id: "harbor-lights", title: "Harbor Lights", year: 2026, type: "movie", status: "draft", createdAt: "2026-08-18" },
  { id: "midnight-vows", title: "Midnight Vows", year: 2024, type: "movie", status: "published", createdAt: "2026-08-15" },
  { id: "the-proposal-party", title: "The Proposal Party", year: 2025, type: "movie", status: "published", createdAt: "2026-08-12" },
  { id: "cabin-fever", title: "Cabin Fever", year: 2026, type: "movie", status: "draft", createdAt: "2026-08-10" },
  { id: "the-set-list", title: "The Set List", year: 2026, type: "series", status: "draft", createdAt: "2026-08-08", seasons: 2, episodes: 12 },
  { id: "wildflower", title: "Wildflower", year: 2023, type: "movie", status: "published", createdAt: "2026-08-05" },
  { id: "the-best-man", title: "The Best Man", year: 2025, type: "movie", status: "published", createdAt: "2026-08-02" },
  { id: "provincetown", title: "Provincetown", year: 2024, type: "movie", status: "published", createdAt: "2026-07-29" },
  { id: "the-long-way-home", title: "The Long Way Home", year: 2023, type: "movie", status: "published", createdAt: "2026-07-24" },
  { id: "the-brownstone", title: "The Brownstone", year: 2025, type: "series", status: "published", createdAt: "2026-08-25", seasons: 3, episodes: 24 },
  { id: "friend-of-dorothy", title: "Friend of Dorothy", year: 2024, type: "series", status: "published", createdAt: "2026-08-21", seasons: 2, episodes: 16 },
  { id: "campus-life", title: "Campus Life", year: 2026, type: "series", status: "draft", createdAt: "2026-08-19", seasons: 1, episodes: 8 },
  { id: "the-drag-house", title: "The Drag House", year: 2025, type: "series", status: "published", createdAt: "2026-08-16", seasons: 4, episodes: 40 },
  { id: "found-family", title: "Found Family", year: 2023, type: "series", status: "published", createdAt: "2026-08-13", seasons: 2, episodes: 16 },
  { id: "office-hours", title: "Office Hours", year: 2026, type: "series", status: "draft", createdAt: "2026-08-11", seasons: 1, episodes: 6 },
  { id: "the-lake-house-crew", title: "The Lake House Crew", year: 2024, type: "series", status: "published", createdAt: "2026-08-07", seasons: 3, episodes: 24 },
  { id: "small-town-out", title: "Small Town, Out", year: 2025, type: "series", status: "published", createdAt: "2026-08-04", seasons: 1, episodes: 8 },
  { id: "after-the-vows", title: "After the Vows", year: 2023, type: "series", status: "published", createdAt: "2026-08-01", seasons: 2, episodes: 16 },
];
