export type ContinueWatchingItem = {
  id: string;
  name: string;
  episodeLabel?: string;
  progressPercent: number; // 0–100
  remaining: string;
  gradient: string;
  /** Landscape thumbnail, 16:9 — Picsum, seeded by id (deterministic). */
  imageUrl: string;
};

// Deterministic placeholder photo (Picsum) — swap for a real backdrop
// still/thumbnail once real content exists.
const backdrop = (seed: string) =>
  `https://picsum.photos/seed/${seed}-backdrop/800/450`;

// Placeholder history — swap for a real query (user's watch history,
// most-recently-watched first) once accounts + a database exist.
export const continueWatching: ContinueWatchingItem[] = [
  { id: "chosen-family", name: "Chosen Family", progressPercent: 68, remaining: "34m left", gradient: "from-brand-pink to-pride-purple", imageUrl: backdrop("chosen-family") },
  { id: "pride-weekend", name: "Pride Weekend", progressPercent: 22, remaining: "1h 18m left", gradient: "from-pride-purple to-brand-pink", imageUrl: backdrop("pride-weekend") },
  { id: "two-grooms", name: "Two Grooms", progressPercent: 91, remaining: "9m left", gradient: "from-pride-blue to-pride-green", imageUrl: backdrop("two-grooms") },
  { id: "her-name-was-june", name: "Her Name Was June", progressPercent: 45, remaining: "1h 08m left", gradient: "from-brand-orange to-pride-red", imageUrl: backdrop("her-name-was-june") },
  { id: "boys-of-summer", name: "Boys of Summer", progressPercent: 12, remaining: "1h 16m left", gradient: "from-pride-green to-pride-blue", imageUrl: backdrop("boys-of-summer") },
  { id: "the-set-up", name: "The Set Up", episodeLabel: "S1 · E4", progressPercent: 77, remaining: "10m left", gradient: "from-brand-pink to-pride-yellow", imageUrl: backdrop("the-set-up") },
  { id: "second-chances", name: "Second Chances", progressPercent: 5, remaining: "1h 29m left", gradient: "from-pride-blue to-pride-purple", imageUrl: backdrop("second-chances") },
  { id: "the-roommate", name: "The Roommate", progressPercent: 58, remaining: "44m left", gradient: "from-brand-pink to-pride-purple", imageUrl: backdrop("the-roommate") },
  { id: "coming-home", name: "Coming Home", episodeLabel: "S2 · E1", progressPercent: 33, remaining: "1h 21m left", gradient: "from-pride-green to-brand-pink", imageUrl: backdrop("coming-home") },
];
