import type { Episode } from "@/lib/media";

export type SeriesDetail = {
  id: string;
  title: string;
  /** First-aired year. */
  year: number;
  /** 0–5 scale. */
  rating: number;
  /** Not every title has one. */
  tagline?: string;
  synopsis: string;
  genre: string[];
  /** Series equivalent of MovieDetail's "director" credit. */
  creator: string;
  cast: string[];
  country: string;
  language: string;
  /** Premiere date of season 1. */
  releaseDate: string;
  tags: string[];
  /** Placeholder poster — same gradient-block approach used site-wide. */
  gradient: string;
  /** Flat, not grouped by season — each Episode already carries its own
   *  seasonNumber (see media.ts), so SeasonTabs groups these at render
   *  time rather than this data duplicating that structure. */
  episodes: Episode[];
};

function episode(
  seriesId: string,
  seasonNumber: number,
  episodeNumber: number,
  title: string,
  duration: string,
  airDate: string
): Episode {
  return {
    id: `${seriesId}-season-${seasonNumber}-episode-${episodeNumber}`,
    title,
    seasonNumber,
    episodeNumber,
    duration,
    airDate,
  };
}

// Placeholder — swap for a real query once the database/import pipeline
// exists. Only 2 series have full detail records for now (mirroring
// mock-movie-details.ts's 4-of-many approach); everything else falls
// back to BasicTitleFallback (see the notFound()/fallback check in the
// page itself).
export const seriesDetails: Record<string, SeriesDetail> = {
  "the-brownstone": {
    id: "the-brownstone",
    title: "The Brownstone",
    year: 2023,
    rating: 4.7,
    tagline: "Four floors. One family that isn't related by blood.",
    synopsis:
      "Five queer New Yorkers share a rent-controlled brownstone that's rapidly becoming the last one on the block, and over three seasons they build the kind of family none of them were handed at birth. Careers rise and stall, relationships form and collapse, and the building itself keeps threatening to be sold out from under them — but every season ends the same way: around the same kitchen table, further apart in life and closer to each other than they started.",
    genre: ["Drama"],
    creator: "Priya Nathan",
    cast: ["Jordan Lee", "Marcus Bell", "Ines Okafor", "Theo Diaz", "Dana Ruiz"],
    country: "United States",
    language: "English",
    releaseDate: "April 11, 2023",
    tags: ["Found Family", "Ensemble", "LGBTQ+", "New York"],
    gradient: "from-pride-blue to-pride-purple",
    episodes: [
      episode("the-brownstone", 1, 1, "Move-In Day", "42 min", "April 11, 2023"),
      episode("the-brownstone", 1, 2, "The Landlord Problem", "38 min", "April 18, 2023"),
      episode("the-brownstone", 1, 3, "Rent Control", "45 min", "April 25, 2023"),
      episode("the-brownstone", 1, 4, "Whose Turn Is It", "40 min", "May 2, 2023"),
      episode("the-brownstone", 1, 5, "The Roof Party", "47 min", "May 9, 2023"),
      episode("the-brownstone", 1, 6, "Season Finale: Foundations", "51 min", "May 16, 2023"),
      episode("the-brownstone", 2, 1, "One Year Later", "43 min", "March 12, 2024"),
      episode("the-brownstone", 2, 2, "New Locks", "39 min", "March 19, 2024"),
      episode("the-brownstone", 2, 3, "The Sublet", "41 min", "March 26, 2024"),
      episode("the-brownstone", 2, 4, "家 (Home)", "44 min", "April 2, 2024"),
      episode("the-brownstone", 2, 5, "The Offer", "46 min", "April 9, 2024"),
      episode("the-brownstone", 2, 6, "Season Finale: What We Owe", "52 min", "April 16, 2024"),
      episode("the-brownstone", 3, 1, "For Sale", "44 min", "August 6, 2025"),
      episode("the-brownstone", 3, 2, "Counter Offer", "40 min", "August 13, 2025"),
      episode("the-brownstone", 3, 3, "The Inspection", "42 min", "August 20, 2025"),
      episode("the-brownstone", 3, 4, "Everyone's Name on the Lease", "45 min", "August 27, 2025"),
      episode("the-brownstone", 3, 5, "Closing Costs", "48 min", "September 3, 2025"),
      episode("the-brownstone", 3, 6, "Series Finale: The Brownstone", "58 min", "September 10, 2025"),
    ],
  },
  "friend-of-dorothy": {
    id: "friend-of-dorothy",
    title: "Friend of Dorothy",
    year: 2024,
    rating: 4.4,
    tagline: "Every generation needs a bar to call home.",
    synopsis:
      "The last lesbian bar in a shrinking downtown scene becomes an unlikely home base for a group of regulars spanning three generations — a Gen Z bartender figuring out who she is, a Gen X owner trying to keep the lights on, and a Boomer regular who's been on the same stool since 1994. Funny, messy, and unashamedly niche, Friend of Dorothy is about what it means to hold onto a space that was never supposed to still exist.",
    genre: ["Comedy"],
    creator: "Devon Okafor",
    cast: ["Riley Chen", "Claire Whitfield", "Nadia Torres", "Sam Park"],
    country: "United States",
    language: "English",
    releaseDate: "July 9, 2024",
    tags: ["Bar", "Multigenerational", "LGBTQ+", "Comedy"],
    gradient: "from-pride-yellow to-pride-red",
    episodes: [
      episode("friend-of-dorothy", 1, 1, "Last Call", "31 min", "July 9, 2024"),
      episode("friend-of-dorothy", 1, 2, "The Health Inspector", "28 min", "July 16, 2024"),
      episode("friend-of-dorothy", 1, 3, "Trivia Night", "30 min", "July 23, 2024"),
      episode("friend-of-dorothy", 1, 4, "The Ex Behind the Bar", "33 min", "July 30, 2024"),
      episode("friend-of-dorothy", 1, 5, "Karaoke Wars", "29 min", "August 6, 2024"),
      episode("friend-of-dorothy", 1, 6, "The Lease Renewal", "27 min", "August 13, 2024"),
      episode("friend-of-dorothy", 1, 7, "Pride Weekend", "34 min", "August 20, 2024"),
      episode("friend-of-dorothy", 1, 8, "Season Finale: Last Round", "36 min", "August 27, 2024"),
      episode("friend-of-dorothy", 2, 1, "Grand Reopening", "32 min", "June 3, 2025"),
      episode("friend-of-dorothy", 2, 2, "The New Regular", "29 min", "June 10, 2025"),
      episode("friend-of-dorothy", 2, 3, "Drag Brunch", "31 min", "June 17, 2025"),
      episode("friend-of-dorothy", 2, 4, "The Investor", "35 min", "June 24, 2025"),
      episode("friend-of-dorothy", 2, 5, "Old Flames", "30 min", "July 1, 2025"),
      episode("friend-of-dorothy", 2, 6, "Series Finale: Closing Time", "40 min", "July 8, 2025"),
    ],
  },
};

/** Looks up a single episode by id across every series in seriesDetails —
 *  used by /episode/[id], separately from the seriesDetails record lookup
 *  since an episode id doesn't tell you which series it belongs to on
 *  its own. */
export function findEpisode(
  episodeId: string
): { episode: Episode; series: SeriesDetail } | undefined {
  for (const series of Object.values(seriesDetails)) {
    const found = series.episodes.find((ep) => ep.id === episodeId);
    if (found) return { episode: found, series };
  }
  return undefined;
}
