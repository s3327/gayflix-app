import type { MediaType } from "@/lib/media";

type Linkable = {
  id: string;
  type: MediaType;
  /** Set on History entries recorded from /episode/[id] — see FavoriteEntry. */
  kind?: "episode";
};

/**
 * Where a card for this entry should link. Episodes are recorded with
 * type "series" (they belong to one) but their id is the episode's own,
 * so they have to go back to /episode/[id], not /series/[id].
 */
export function titleHref(entry: Linkable): string {
  if (entry.kind === "episode") return `/episode/${entry.id}`;
  return entry.type === "movie" ? `/movie/${entry.id}` : `/series/${entry.id}`;
}
