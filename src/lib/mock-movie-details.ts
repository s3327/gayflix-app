export type MovieDetail = {
  id: string;
  title: string;
  year: number;
  /** 0–5 scale. */
  rating: number;
  /** Not every title has one. */
  tagline?: string;
  synopsis: string;
  genre: string[];
  director: string;
  cast: string[];
  country: string;
  language: string;
  releaseDate: string;
  runtimeMinutes: number;
  tags: string[];
  /** Placeholder poster — same gradient-block approach used site-wide. */
  gradient: string;
};

// Placeholder — swap for a real query once the database/import pipeline
// exists. Only a handful of movies have full detail records for now;
// everything else 404s (see the notFound() call in the page).
export const movieDetails: Record<string, MovieDetail> = {
  "chosen-family": {
    id: "chosen-family",
    title: "Chosen Family",
    year: 2025,
    rating: 4.8,
    tagline: "Family isn't always who you're born with.",
    synopsis:
      "Three friends turned family navigate love, loss, and reinvention over one unforgettable summer in Provincetown. When Mia's engagement falls apart days before the wedding, she flees to the one place that's always felt like home — only to find her found family scattered, older, and quietly falling apart in their own ways. What starts as a summer of healing becomes a reckoning with who they were, who they've become, and whether chosen family can survive the same growing pains as any other kind.",
    genre: ["Drama"],
    director: "Alex Rivera",
    cast: ["Jordan Lee", "Sam Park", "Riley Chen", "Dana Ruiz"],
    country: "United States",
    language: "English",
    releaseDate: "June 20, 2025",
    runtimeMinutes: 112,
    tags: ["LGBTQ+", "Found Family", "Coming of Age", "Summer"],
    gradient: "from-brand-pink via-brand-orange to-pride-purple",
  },
  provincetown: {
    id: "provincetown",
    title: "Provincetown",
    year: 2024,
    rating: 4.3,
    tagline: "The spotlight doesn't stay on anyone forever.",
    synopsis:
      "A washed-up cabaret singer returns to the town that made her famous, only to find the drag scene she once ruled has moved on without her. Forced to mentor the very performer who's replaced her, she has to decide whether to fight for relevance or finally pass the crown — and figure out who she is when the spotlight isn't on her anymore.",
    genre: ["Drama", "Comedy"],
    director: "Priya Nathan",
    cast: ["Marcus Bell", "Theo Diaz", "Ines Okafor"],
    country: "United States",
    language: "English",
    releaseDate: "March 14, 2024",
    runtimeMinutes: 98,
    tags: ["Drag", "Mentorship", "LGBTQ+"],
    gradient: "from-brand-pink to-pride-blue",
  },
  wildflower: {
    id: "wildflower",
    title: "Wildflower",
    year: 2023,
    rating: 4.6,
    // No tagline — demonstrates the conditional rendering.
    synopsis:
      "Two women meet on a cross-country road trip neither of them planned — one running from a marriage she can't go back to, the other running toward a life she's never let herself want. Told over the course of ten days and a thousand miles, Wildflower is a slow-burn romance about the difference between running away and finally moving forward, and what it costs to choose yourself in your forties instead of your twenties.",
    genre: ["Drama", "Romance"],
    director: "Alex Rivera",
    cast: ["Nadia Torres", "Claire Whitfield"],
    country: "United States",
    language: "English",
    releaseDate: "September 8, 2023",
    runtimeMinutes: 121,
    tags: ["Road Trip", "Slow Burn", "LGBTQ+"],
    gradient: "from-pride-green to-pride-purple",
  },
  "the-proposal-party": {
    id: "the-proposal-party",
    title: "The Proposal Party",
    year: 2025,
    rating: 4.1,
    tagline: "Fake it till you feel it.",
    synopsis:
      "When two best friends fake an engagement to help one of them qualify for a family inheritance, the plan works a little too well — the fake fiancé's meddling, over-the-top family throws them an engagement party neither of them is prepared for, and neither is prepared for the very real feelings that start showing up between the lies.",
    genre: ["Comedy", "Romance"],
    director: "Devon Okafor",
    cast: ["Marcus Bell", "Theo Diaz"],
    country: "United States",
    language: "English",
    releaseDate: "February 1, 2025",
    runtimeMinutes: 89,
    tags: ["Fake Dating", "Family", "LGBTQ+"],
    gradient: "from-brand-orange to-pride-red",
  },
};
