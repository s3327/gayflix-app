import { type Media, poster, backdrop } from "@/lib/media";

// Placeholder catalog — swap for real DB records once Prisma/Neon is wired up.
// Names are fictional, just enough variety to prove the grid/row layout.
// Hand-authored (unlike mock-trending/mock-media's generated catalogs), so
// every item is listed explicitly with an explicit `type` rather than
// derived — these feed the home page's curated rows, not a filterable
// full-catalog listing, so there's no need to infer type from duration.
//
// Also no draft/published status, unlike mock-media.ts — every item here
// was deliberately hand-placed into a curated row (an editorial pick),
// so there's no runtime path for an unintended draft to leak in the way
// there is with mediaItems' 150 programmatically generated items.

export const featuredTitle: Media = {
  id: "chosen-family",
  title: "Chosen Family",
  year: 2025,
  duration: "1h 52m",
  type: "movie",
  genre: "Drama",
  synopsis:
    "Three friends turned family navigate love, loss, and reinvention over one unforgettable summer in Provincetown.",
  gradient: "from-brand-pink via-brand-orange to-pride-purple",
  posterUrl: poster("chosen-family"),
  backdropUrl: backdrop("chosen-family"),
};

export const trendingNow: Media[] = [
  { id: "out-and-about", title: "Out & About", year: 2024, duration: "48m", type: "movie", genre: "Comedy", synopsis: "", gradient: "from-pride-yellow to-pride-red", posterUrl: poster("out-and-about") },
  { id: "pride-weekend", title: "Pride Weekend", year: 2023, duration: "1h 41m", type: "movie", genre: "Romance", synopsis: "", gradient: "from-pride-purple to-brand-pink", posterUrl: poster("pride-weekend") },
  { id: "two-grooms", title: "Two Grooms", year: 2025, duration: "1h 38m", type: "movie", genre: "Romance", synopsis: "", gradient: "from-pride-blue to-pride-green", posterUrl: poster("two-grooms") },
  { id: "her-name-was-june", title: "Her Name Was June", year: 2022, duration: "2h 05m", type: "movie", genre: "Drama", synopsis: "", gradient: "from-brand-orange to-pride-red", posterUrl: poster("her-name-was-june") },
  { id: "boys-of-summer", title: "Boys of Summer", year: 2024, duration: "1h 29m", type: "movie", genre: "Coming of Age", synopsis: "", gradient: "from-pride-green to-pride-blue", posterUrl: poster("boys-of-summer") },
  { id: "the-set-up", title: "The Set Up", year: 2025, duration: "45m", type: "movie", genre: "Comedy", synopsis: "", gradient: "from-brand-pink to-pride-yellow", posterUrl: poster("the-set-up") },
];

export const newReleases: Media[] = [
  { id: "second-chances", title: "Second Chances", year: 2026, duration: "1h 33m", type: "movie", genre: "Drama", synopsis: "", gradient: "from-pride-blue to-pride-purple", posterUrl: poster("second-chances") },
  { id: "loud-and-proud", title: "Loud and Proud", year: 2026, duration: "52m", type: "movie", genre: "Documentary", synopsis: "", gradient: "from-pride-red to-brand-orange", posterUrl: poster("loud-and-proud") },
  { id: "the-roommate", title: "The Roommate", year: 2025, duration: "1h 46m", type: "movie", genre: "Romance", synopsis: "", gradient: "from-brand-pink to-pride-purple", posterUrl: poster("the-roommate") },
  { id: "after-hours", title: "After Hours", year: 2026, duration: "39m", type: "movie", genre: "Comedy", synopsis: "", gradient: "from-pride-yellow to-pride-green", posterUrl: poster("after-hours") },
  { id: "coming-home", title: "Coming Home", year: 2025, duration: "1h 58m", type: "movie", genre: "Drama", synopsis: "", gradient: "from-pride-green to-brand-pink", posterUrl: poster("coming-home") },
  { id: "first-dance", title: "First Dance", year: 2026, duration: "1h 22m", type: "movie", genre: "Romance", synopsis: "", gradient: "from-pride-purple to-pride-blue", posterUrl: poster("first-dance") },
  { id: "runway-hearts", title: "Runway Hearts", year: 2026, duration: "1h 15m", type: "movie", genre: "Comedy", synopsis: "", gradient: "from-brand-orange to-pride-yellow", posterUrl: poster("runway-hearts") },
  { id: "the-last-letter", title: "The Last Letter", year: 2025, duration: "2h 01m", type: "movie", genre: "Drama", synopsis: "", gradient: "from-pride-purple to-brand-pink", posterUrl: poster("the-last-letter") },
  { id: "spring-fling", title: "Spring Fling", year: 2026, duration: "1h 28m", type: "movie", genre: "Romance", synopsis: "", gradient: "from-pride-green to-pride-yellow", posterUrl: poster("spring-fling") },
  { id: "closing-time", title: "Closing Time", year: 2025, duration: "1h 44m", type: "movie", genre: "Drama", synopsis: "", gradient: "from-brand-pink to-pride-blue", posterUrl: poster("closing-time") },
  { id: "all-in", title: "All In", year: 2026, duration: "47m", type: "movie", genre: "Documentary", synopsis: "", gradient: "from-pride-blue to-brand-orange", posterUrl: poster("all-in") },
  { id: "the-double-take", title: "The Double Take", year: 2025, duration: "1h 36m", type: "movie", genre: "Comedy", synopsis: "", gradient: "from-pride-yellow to-pride-purple", posterUrl: poster("the-double-take") },
];

export const movies: Media[] = [
  { id: "provincetown", title: "Provincetown", year: 2024, duration: "1h 51m", type: "movie", genre: "Drama", synopsis: "", gradient: "from-brand-pink to-pride-blue", posterUrl: poster("provincetown") },
  { id: "the-best-man", title: "The Best Man", year: 2025, duration: "1h 40m", type: "movie", genre: "Comedy", synopsis: "", gradient: "from-pride-yellow to-brand-orange", posterUrl: poster("the-best-man") },
  { id: "wildflower", title: "Wildflower", year: 2023, duration: "2h 02m", type: "movie", genre: "Drama", synopsis: "", gradient: "from-pride-green to-pride-purple", posterUrl: poster("wildflower") },
  { id: "cabin-fever", title: "Cabin Fever", year: 2026, duration: "1h 34m", type: "movie", genre: "Romance", synopsis: "", gradient: "from-pride-blue to-brand-pink", posterUrl: poster("cabin-fever") },
  { id: "the-proposal-party", title: "The Proposal Party", year: 2025, duration: "1h 29m", type: "movie", genre: "Comedy", synopsis: "", gradient: "from-brand-orange to-pride-red", posterUrl: poster("the-proposal-party") },
  { id: "midnight-vows", title: "Midnight Vows", year: 2024, duration: "1h 47m", type: "movie", genre: "Romance", synopsis: "", gradient: "from-pride-purple to-brand-pink", posterUrl: poster("midnight-vows") },
  { id: "harbor-lights", title: "Harbor Lights", year: 2026, duration: "1h 55m", type: "movie", genre: "Drama", synopsis: "", gradient: "from-pride-blue to-pride-green", posterUrl: poster("harbor-lights") },
  { id: "the-long-way-home", title: "The Long Way Home", year: 2023, duration: "2h 10m", type: "movie", genre: "Drama", synopsis: "", gradient: "from-brand-pink to-pride-purple", posterUrl: poster("the-long-way-home") },
  { id: "double-booked", title: "Double Booked", year: 2025, duration: "1h 31m", type: "movie", genre: "Comedy", synopsis: "", gradient: "from-pride-yellow to-pride-green", posterUrl: poster("double-booked") },
  { id: "one-more-summer", title: "One More Summer", year: 2024, duration: "1h 49m", type: "movie", genre: "Romance", synopsis: "", gradient: "from-pride-green to-brand-orange", posterUrl: poster("one-more-summer") },
  { id: "the-quiet-part", title: "The Quiet Part", year: 2026, duration: "1h 58m", type: "movie", genre: "Drama", synopsis: "", gradient: "from-pride-purple to-pride-blue", posterUrl: poster("the-quiet-part") },
  { id: "confetti", title: "Confetti", year: 2025, duration: "1h 38m", type: "movie", genre: "Comedy", synopsis: "", gradient: "from-brand-orange to-brand-pink", posterUrl: poster("confetti") },
];

export const series: Media[] = [
  { id: "the-brownstone", title: "The Brownstone", year: 2025, duration: "3 Seasons", type: "series", genre: "Drama", synopsis: "", gradient: "from-pride-blue to-pride-purple", posterUrl: poster("the-brownstone") },
  { id: "friend-of-dorothy", title: "Friend of Dorothy", year: 2024, duration: "2 Seasons", type: "series", genre: "Comedy", synopsis: "", gradient: "from-pride-yellow to-pride-red", posterUrl: poster("friend-of-dorothy") },
  { id: "campus-life", title: "Campus Life", year: 2026, duration: "1 Season", type: "series", genre: "Coming of Age", synopsis: "", gradient: "from-pride-green to-brand-pink", posterUrl: poster("campus-life") },
  { id: "the-drag-house", title: "The Drag House", year: 2025, duration: "4 Seasons", type: "series", genre: "Reality", synopsis: "", gradient: "from-brand-orange to-pride-purple", posterUrl: poster("the-drag-house") },
  { id: "found-family", title: "Found Family", year: 2023, duration: "2 Seasons", type: "series", genre: "Drama", synopsis: "", gradient: "from-pride-purple to-pride-blue", posterUrl: poster("found-family") },
  { id: "office-hours", title: "Office Hours", year: 2026, duration: "1 Season", type: "series", genre: "Comedy", synopsis: "", gradient: "from-pride-yellow to-brand-orange", posterUrl: poster("office-hours") },
  { id: "the-lake-house-crew", title: "The Lake House Crew", year: 2024, duration: "3 Seasons", type: "series", genre: "Romance", synopsis: "", gradient: "from-brand-pink to-pride-green", posterUrl: poster("the-lake-house-crew") },
  { id: "small-town-out", title: "Small Town, Out", year: 2025, duration: "1 Season", type: "series", genre: "Drama", synopsis: "", gradient: "from-pride-blue to-pride-green", posterUrl: poster("small-town-out") },
  { id: "the-set-list", title: "The Set List", year: 2026, duration: "2 Seasons", type: "series", genre: "Musical", synopsis: "", gradient: "from-pride-purple to-brand-pink", posterUrl: poster("the-set-list") },
  { id: "after-the-vows", title: "After the Vows", year: 2023, duration: "2 Seasons", type: "series", genre: "Drama", synopsis: "", gradient: "from-brand-orange to-pride-yellow", posterUrl: poster("after-the-vows") },
  { id: "the-new-normal", title: "The New Normal", year: 2025, duration: "3 Seasons", type: "series", genre: "Comedy", synopsis: "", gradient: "from-pride-green to-pride-blue", posterUrl: poster("the-new-normal") },
  { id: "chosen-family-reunion", title: "Chosen Family: Reunion", year: 2026, duration: "1 Season", type: "series", genre: "Drama", synopsis: "", gradient: "from-pride-red to-brand-pink", posterUrl: poster("chosen-family-reunion") },
];
