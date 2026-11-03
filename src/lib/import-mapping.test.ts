import { describe, expect, it } from "vitest";
import {
  checkMatch,
  tmdbEpisodeSynopsis,
  fillGaps,
  findImdbId,
  formatTmdbRef,
  imdbFacts,
  isImdbId,
  matchNotices,
  omdbValues,
  parseTmdbRef,
  tmdbCard,
  tmdbFacts,
  tmdbImage,
  tmdbValues,
} from "@/lib/import-mapping";
import { emptyTitleValues, parseTitle } from "@/lib/title-form";

// Trimmed copies of real answers' shapes.
const TMDB_MOVIE = {
  id: 603,
  title: "The Matrix",
  original_title: "The Matrix",
  release_date: "1999-03-31",
  runtime: 136,
  genres: [
    { id: 28, name: "Action" },
    { id: 878, name: "Science Fiction" },
  ],
  origin_country: ["US"],
  production_countries: [{ iso_3166_1: "US", name: "United States of America" }],
  original_language: "en",
  spoken_languages: [{ english_name: "English", iso_639_1: "en", name: "English" }],
  overview: "Set in the 22nd century, The Matrix tells the story of a computer hacker.",
  tagline: "Welcome to the Real World.",
  vote_average: 8.217,
  vote_count: 26000,
  poster_path: "/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg",
  backdrop_path: "/ncEsesgOJDNrTUED89hYbA117wo.jpg",
  imdb_id: "tt0133093",
  credits: {
    cast: [
      { name: "Keanu Reeves", order: 0 },
      { name: "Laurence Fishburne", order: 1 },
      { name: "Carrie-Anne Moss", order: 2 },
    ],
    crew: [
      { job: "Director", name: "Lana Wachowski" },
      { job: "Director", name: "Lilly Wachowski" },
      { job: "Producer", name: "Joel Silver" },
    ],
  },
  keywords: { keywords: [{ name: "dystopia" }, { name: "artificial intelligence" }] },
  external_ids: { imdb_id: "tt0133093" },
};

const TMDB_SERIES = {
  id: 1399,
  name: "Pose",
  original_name: "Pose",
  first_air_date: "2018-06-03",
  episode_run_time: [60],
  genres: [{ id: 18, name: "Drama" }],
  origin_country: ["US"],
  original_language: "en",
  overview: "New York, 1987.",
  vote_average: 8.1,
  vote_count: 900,
  poster_path: "/pose.jpg",
  backdrop_path: null,
  created_by: [{ name: "Ryan Murphy" }, { name: "Brad Falchuk" }, { name: "Steven Canals" }],
  credits: { cast: [{ name: "Mj Rodriguez" }, { name: "Billy Porter" }], crew: [] },
  keywords: { results: [{ name: "lgbt" }, { name: "ballroom culture" }] },
  external_ids: { imdb_id: "tt7562112" },
};

const OMDB_MOVIE = {
  Title: "The Matrix",
  Year: "1999",
  Released: "31 Mar 1999",
  Runtime: "136 min",
  Genre: "Action, Sci-Fi",
  Director: "Lana Wachowski, Lilly Wachowski",
  Actors: "Keanu Reeves, Laurence Fishburne, Carrie-Anne Moss",
  Plot: "When a beautiful stranger leads computer hacker Neo to a forbidding underworld...",
  Language: "English",
  Country: "United States, Australia",
  Poster: "https://m.media-amazon.com/images/M/matrix._V1_SX300.jpg",
  imdbRating: "8.7",
  imdbVotes: "2,100,000",
  imdbID: "tt0133093",
  Type: "movie",
  Response: "True",
};

const HOSTS = ["image.tmdb.org", "m.media-amazon.com"];

describe("source ids", () => {
  it("reads and writes TMDB ids", () => {
    expect(parseTmdbRef("movie/603")).toEqual({ kind: "movie", id: 603 });
    expect(parseTmdbRef("tv/1399")).toEqual({ kind: "tv", id: 1399 });
    expect(formatTmdbRef({ kind: "tv", id: 1399 })).toBe("tv/1399");
    for (const bad of ["series/1", "movie/0", "movie/-1", "movie/1.5", "movie/603/", " movie/603", 603, null]) {
      expect(parseTmdbRef(bad)).toBeNull();
    }
  });

  it("finds an IMDb id in what an admin pasted", () => {
    expect(findImdbId("tt0133093")).toBe("tt0133093");
    expect(findImdbId(" TT0133093 ")).toBe("tt0133093");
    expect(findImdbId("https://www.imdb.com/title/tt7562112/?ref_=nv")).toBe("tt7562112");
    expect(findImdbId("tt123")).toBeNull();
    expect(findImdbId("att0133093")).toBeNull();
    expect(findImdbId("The Matrix")).toBeNull();
    expect(isImdbId("tt0133093")).toBe(true);
    expect(isImdbId("tt0133093 ")).toBe(false);
  });
});

describe("tmdbImage", () => {
  it("only builds links from TMDB's own image paths", () => {
    expect(tmdbImage("/abc_1-2.jpg", "w780")).toBe("https://image.tmdb.org/t/p/w780/abc_1-2.jpg");
    for (const bad of [null, "", "abc.jpg", "/../x.jpg", "//evil.example/x.jpg", "/x.svg", "/x.jpg?y=1"]) {
      expect(tmdbImage(bad, "w780")).toBe("");
    }
  });
});

describe("tmdbCard", () => {
  it("makes a card from a search result", () => {
    expect(tmdbCard("movie", { id: 603, title: "The Matrix", release_date: "1999-03-31", poster_path: "/m.jpg" })).toEqual({
      tmdbId: "movie/603",
      type: "movie",
      title: "The Matrix",
      year: 1999,
      posterUrl: "https://image.tmdb.org/t/p/w342/m.jpg",
    });
    expect(tmdbCard("tv", { id: 1399, name: "Pose", first_air_date: "" })).toEqual({
      tmdbId: "tv/1399",
      type: "series",
      title: "Pose",
      year: null,
      posterUrl: "",
    });
  });

  it("skips results it can't use", () => {
    expect(tmdbCard("movie", { id: "603", title: "The Matrix" })).toBeNull();
    expect(tmdbCard("movie", { id: 603, name: "The Matrix" })).toBeNull();
    expect(tmdbCard("movie", null)).toBeNull();
  });
});

describe("tmdbValues", () => {
  it("fills the movie form from TMDB's details", () => {
    expect(tmdbValues("movie", TMDB_MOVIE, "movie")).toEqual({
      ...emptyTitleValues(),
      title: "The Matrix",
      year: "1999",
      releaseDate: "1999-03-31",
      runtime: "136",
      genres: "Action, Science Fiction",
      country: "United States",
      language: "English",
      credit: "Lana Wachowski, Lilly Wachowski",
      cast: "Keanu Reeves, Laurence Fishburne, Carrie-Anne Moss",
      tags: "dystopia, artificial intelligence",
      rating: "4.1",
      tagline: "Welcome to the Real World.",
      synopsis: "Set in the 22nd century, The Matrix tells the story of a computer hacker.",
      posterUrl: "https://image.tmdb.org/t/p/w780/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg",
      backdropUrl: "https://image.tmdb.org/t/p/w1280/ncEsesgOJDNrTUED89hYbA117wo.jpg",
      status: "draft",
      featured: "",
    });
  });

  it("categorizes movie as Short Film when runtime <= shortFilmCutoffMinutes", () => {
    const shortMovie = { ...TMDB_MOVIE, runtime: 25 };
    const values = tmdbValues("movie", shortMovie, "movie", { shortFilmCutoffMinutes: 30 });
    expect(values.category).toBe("Short Film");

    const exactMovie = { ...TMDB_MOVIE, runtime: 30 };
    const exactValues = tmdbValues("movie", exactMovie, "movie", { shortFilmCutoffMinutes: 30 });
    expect(exactValues.category).toBe("Short Film");
  });

  it("does not categorize movie as Short Film when runtime > shortFilmCutoffMinutes or zero", () => {
    const featureMovie = { ...TMDB_MOVIE, runtime: 31 };
    const featureValues = tmdbValues("movie", featureMovie, "movie", { shortFilmCutoffMinutes: 30 });
    expect(featureValues.category).toBe("");

    const zeroMovie = { ...TMDB_MOVIE, runtime: 0 };
    const zeroValues = tmdbValues("movie", zeroMovie, "movie", { shortFilmCutoffMinutes: 30 });
    expect(zeroValues.category).toBe("");
  });

  it("does not categorize TV series as Short Film even if episode runtime <= cutoff", () => {
    const shortSeries = { ...TMDB_SERIES, episode_run_time: [15] };
    const values = tmdbValues("tv", shortSeries, "series", { shortFilmCutoffMinutes: 30 });
    expect(values.category).toBe("");
  });

  it("fills the series form, with its creators and keywords", () => {
    const values = tmdbValues("tv", TMDB_SERIES, "series");
    expect(values).toMatchObject({
      title: "Pose",
      year: "2018",
      runtime: "",
      credit: "Ryan Murphy, Brad Falchuk, Steven Canals",
      tags: "lgbt, ballroom culture",
      backdropUrl: "",
    });
    expect(parseTitle("series", values, { hosts: HOSTS }).ok).toBe(true);
  });

  it("gives a series imported as a movie its episode length", () => {
    expect(tmdbValues("tv", TMDB_SERIES, "movie").runtime).toBe("60");
  });

  it("passes the title form's checks", () => {
    expect(parseTitle("movie", tmdbValues("movie", TMDB_MOVIE, "movie"), { hosts: HOSTS }).ok).toBe(true);
  });

  it("keeps lists and text inside the form's limits", () => {
    const values = tmdbValues(
      "movie",
      {
        ...TMDB_MOVIE,
        credits: {
          cast: [
            ...Array.from({ length: 12 }, (_, n) => ({ name: `Actor ${n + 1}` })),
            { name: "Robert Downey, Jr." },
          ],
          crew: [{ job: "Director", name: "x".repeat(121) }],
        },
        keywords: { keywords: [{ name: "y".repeat(41) }, { name: "Queer" }, { name: "queer" }] },
        overview: `${"word ".repeat(1200)}end`,
        tagline: "z".repeat(201),
        vote_count: 9,
      },
      "movie"
    );
    expect(values.cast.split(", ")).toHaveLength(10);
    expect(values.credit).toBe("");
    expect(values.tags).toBe("Queer");
    expect(values.synopsis.length).toBeLessThanOrEqual(5000);
    expect(values.synopsis.endsWith("word…")).toBe(true);
    expect(values.tagline).toBe("");
    expect(values.rating).toBe("");
    expect(
      tmdbValues("movie", { credits: { cast: [{ name: "Robert Downey, Jr." }] } }, "movie").cast
    ).toBe("Robert Downey Jr.");
  });

  it("copes with answers missing everything", () => {
    for (const odd of [null, "nope", { genres: "Drama", credits: [], release_date: "1999-02-30" }]) {
      expect(tmdbValues("movie", odd, "movie")).toEqual(emptyTitleValues());
    }
  });

  it("names countries and languages TMDB only gives as codes", () => {
    const values = tmdbValues(
      "movie",
      { origin_country: [], production_countries: [{ iso_3166_1: "BR" }], original_language: "pt" },
      "movie"
    );
    expect(values.country).toBe("Brazil");
    expect(values.language).toBe("Portuguese");
    expect(
      tmdbValues("movie", { original_language: "xx", spoken_languages: [{ english_name: "No Language" }] }, "movie")
        .language
    ).toBe("No Language");
  });
});

describe("tmdbFacts", () => {
  it("takes the IMDb id from external_ids, else the details", () => {
    expect(tmdbFacts("movie", TMDB_MOVIE)).toEqual({
      titles: ["The Matrix"],
      year: 1999,
      type: "movie",
      imdbId: "tt0133093",
    });
    expect(tmdbFacts("movie", { ...TMDB_MOVIE, external_ids: {} }).imdbId).toBe("tt0133093");
    expect(tmdbFacts("tv", { name: "Élite", original_name: "Élite", external_ids: { imdb_id: "" } })).toEqual({
      titles: ["Élite"],
      year: null,
      type: "series",
      imdbId: null,
    });
  });

  it("keeps the original title when it differs", () => {
    expect(tmdbFacts("movie", { title: "Amélie", original_title: "Le Fabuleux Destin d'Amélie Poulain" }).titles).toEqual([
      "Amélie",
      "Le Fabuleux Destin d'Amélie Poulain",
    ]);
  });
});

describe("omdbValues", () => {
  it("fills the movie form from OMDb's answer", () => {
    expect(omdbValues(OMDB_MOVIE, "movie")).toEqual({
      ...emptyTitleValues(),
      title: "The Matrix",
      year: "1999",
      releaseDate: "1999-03-31",
      runtime: "136",
      genres: "Action, Sci-Fi",
      country: "United States",
      language: "English",
      credit: "Lana Wachowski, Lilly Wachowski",
      cast: "Keanu Reeves, Laurence Fishburne, Carrie-Anne Moss",
      rating: "4.4",
      synopsis: "When a beautiful stranger leads computer hacker Neo to a forbidding underworld...",
      posterUrl: "https://m.media-amazon.com/images/M/matrix._V1_SX300.jpg",
    });
  });

  it("treats N/A as empty, and reads a series' year range", () => {
    const values = omdbValues(
      { ...OMDB_MOVIE, Year: "2018–2021", Released: "N/A", Runtime: "N/A", Poster: "N/A", imdbVotes: "N/A" },
      "series"
    );
    expect(values).toMatchObject({ year: "2018", releaseDate: "", runtime: "", posterUrl: "", rating: "", credit: "" });
  });
});

describe("fillGaps", () => {
  it("fills only what TMDB left empty, never the status or featured", () => {
    const tmdb = { ...tmdbValues("movie", { ...TMDB_MOVIE, runtime: 0, overview: "" }, "movie") };
    const omdb = { ...omdbValues(OMDB_MOVIE, "movie"), status: "published", featured: "on" };
    const { values, filled } = fillGaps(tmdb, omdb);
    expect(filled).toEqual(["runtime", "synopsis"]);
    expect(values.runtime).toBe("136");
    expect(values.genres).toBe("Action, Science Fiction");
    expect(values.posterUrl).toBe(tmdb.posterUrl);
    expect(values.status).toBe("draft");
    expect(values.featured).toBe("");
  });
});

describe("the IMDb check", () => {
  const tmdb = tmdbFacts("movie", TMDB_MOVIE);

  it("matches titles without case, accents or punctuation, and years one apart", () => {
    const imdb = imdbFacts({ ...OMDB_MOVIE, Title: "the matrix!", Year: "2000" })!;
    expect(checkMatch(tmdb, imdb)).toEqual({ sameTitle: true, sameYear: true, sameType: true });
    expect(matchNotices(tmdb, imdb, checkMatch(tmdb, imdb))).toEqual([]);
  });

  it("matches the original title", () => {
    const amelie = tmdbFacts("movie", { title: "Amélie", original_title: "Le Fabuleux Destin d'Amélie Poulain" });
    const imdb = imdbFacts({ ...OMDB_MOVIE, Title: "Le fabuleux destin d'Amelie Poulain", Year: "N/A" })!;
    expect(checkMatch(amelie, imdb).sameTitle).toBe(true);
  });

  it("flags another title, a year two apart, and another type", () => {
    const imdb = imdbFacts({ ...OMDB_MOVIE, Title: "The Matrix Reloaded", Year: "2001", Type: "series" })!;
    const check = checkMatch(tmdb, imdb);
    expect(check).toEqual({ sameTitle: false, sameYear: false, sameType: false });
    expect(matchNotices(tmdb, imdb, check)).toEqual([
      "Check the match: TMDB has “The Matrix” (1999) and IMDb has “The Matrix Reloaded” (2001).",
      "TMDB lists it as a movie and IMDb as a series.",
    ]);
  });

  it("reads OMDb's facts, and nothing from an answer that isn't a title", () => {
    expect(imdbFacts(OMDB_MOVIE)).toEqual({ imdbId: "tt0133093", title: "The Matrix", year: 1999, type: "movie" });
    expect(imdbFacts({ ...OMDB_MOVIE, Type: "episode" })?.type).toBeNull();
    expect(imdbFacts({ Response: "False", Error: "Movie not found!" })).toBeNull();
    expect(imdbFacts({ ...OMDB_MOVIE, imdbID: "nm0000206" })).toBeNull();
  });
});

describe("tmdbEpisodeSynopsis", () => {
  it("keeps an episode's overview, tidied", () => {
    expect(tmdbEpisodeSynopsis("  Rent  goes up.\n\nEveryone panics. ")).toBe("Rent goes up. Everyone panics.");
  });

  it("is empty without one", () => {
    expect(tmdbEpisodeSynopsis(undefined)).toBe("");
    expect(tmdbEpisodeSynopsis(42)).toBe("");
  });

  it("is cut at a word to fit the episode form's 1000 characters", () => {
    const synopsis = tmdbEpisodeSynopsis("word ".repeat(400));
    expect(synopsis.length).toBeLessThanOrEqual(1000);
    expect(synopsis.endsWith("word…")).toBe(true);
  });
});
