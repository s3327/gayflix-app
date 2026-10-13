// A stand-in for TMDB and OMDb during the end-to-end tests: the server
// makes these requests itself, so the browser can't intercept them.
// playwright.config.ts starts it and points TMDB_API_BASE and
// OMDB_API_BASE here. Plain Node, no dependencies.
//
//   node e2e/source-stub.mjs <port>

import { createServer } from "node:http";

// The same keys as the test server's TMDB_API_KEY and OMDB_API_KEY in
// playwright.config.ts.
const TMDB_KEY = "e2e-tmdb-key";
const OMDB_KEY = "e2e-omdb-key";

/**
 * The titles each test imports, one per case, so tests running at the
 * same time never import the same title. `omdb` is IMDb's side: null for
 * a title OMDb is down for.
 */
const TITLES = [
  {
    // Everything matches: imported at once.
    kind: "movie",
    id: 990001,
    title: "E2E Harbor Lights",
    date: "2024-06-14",
    runtime: 98,
    imdb: "tt9900001",
    omdb: {},
  },
  {
    // Neither source has a runtime: the form opens with Runtime marked.
    kind: "movie",
    id: 990002,
    title: "E2E No Runtime",
    date: "2023-02-01",
    runtime: 0,
    imdb: "tt9900002",
    omdb: { Runtime: "N/A" },
  },
  {
    // IMDb's year is two years later: "Check the match".
    kind: "movie",
    id: 990003,
    title: "E2E Year Drift",
    date: "2020-05-05",
    runtime: 101,
    imdb: "tt9900003",
    omdb: { Year: "2022" },
  },
  {
    // TMDB says movie, IMDb says series: the card asks.
    kind: "movie",
    id: 990004,
    title: "E2E Two Faced",
    date: "2021-09-09",
    runtime: 45,
    imdb: "tt9900004",
    omdb: { Type: "series", Year: "2021–2023" },
  },
  {
    // TMDB lacks the runtime, synopsis and country: OMDb fills them.
    kind: "movie",
    id: 990005,
    title: "E2E Gap Filler",
    date: "2019-03-03",
    runtime: null,
    overview: "",
    countries: [],
    imdb: "tt9900005",
    omdb: { Runtime: "97 min", Plot: "Filled in from IMDb.", Country: "Ireland, United Kingdom" },
  },
  {
    // Found by its IMDb ID.
    kind: "tv",
    id: 990006,
    title: "E2E Find Me",
    date: "2018-01-01",
    imdb: "tt9900006",
    omdb: {},
    seasons: [
      {
        season_number: 1,
        name: "Season 1",
        episode_count: 10,
        air_date: "2018-01-01",
        poster_path: "/e2e-990006-s1.jpg",
        overview: "Season 1 of E2E Find Me",
      },
      {
        season_number: 2,
        name: "Season 2",
        episode_count: 8,
        air_date: "2019-01-01",
        poster_path: "/e2e-990006-s2.jpg",
        overview: "Season 2 of E2E Find Me",
      },
    ],
  },
  {
    // OMDb is down: imported, not checked against IMDb.
    kind: "movie",
    id: 990007,
    title: "E2E Offline Check",
    date: "2017-07-07",
    runtime: 88,
    imdb: "tt9900007",
    omdb: null,
  },
  {
    // Neither TMDB nor IMDb has a poster: imported with the No poster image.
    kind: "movie",
    id: 990008,
    title: "E2E No Poster",
    date: "2016-06-06",
    runtime: 92,
    poster: false,
    imdb: "tt9900008",
    omdb: {},
  },
  {
    // Standard TV show with 2 seasons for bulk import testing
    kind: "tv",
    id: 990009,
    title: "E2E Series Import",
    date: "2024-01-01",
    imdb: "tt9900009",
    omdb: { Type: "series", Year: "2024" },
    seasons: [
      {
        season_number: 1,
        name: "Season 1",
        episode_count: 10,
        air_date: "2024-01-01",
        poster_path: "/e2e-990009-s1.jpg",
        overview: "Season 1 of E2E Series Import",
      },
      {
        season_number: 2,
        name: "Season 2",
        episode_count: 8,
        air_date: "2024-06-01",
        poster_path: "/e2e-990009-s2.jpg",
        overview: "Season 2 of E2E Series Import",
      },
    ],
  },
  {
    // TV show with empty Season 1 (0 episodes) for edge case testing
    kind: "tv",
    id: 990010,
    title: "E2E Empty Season Show",
    date: "2024-02-01",
    imdb: "tt9900110",
    omdb: { Type: "series", Year: "2024" },
    seasons: [
      {
        season_number: 1,
        name: "Season 1",
        episode_count: 0,
        air_date: "2024-02-01",
        poster_path: "/e2e-990010-s1.jpg",
        overview: "Season 1 has zero episodes",
      },
      {
        season_number: 2,
        name: "Season 2",
        episode_count: 5,
        air_date: "2024-07-01",
        poster_path: "/e2e-990010-s2.jpg",
        overview: "Season 2 has 5 episodes",
      },
    ],
  },
  {
    // TV show with adversarial/special characters and missing still_path
    kind: "tv",
    id: 990011,
    title: "E2E Boundary Show",
    date: "2024-03-01",
    imdb: "tt9900111",
    omdb: { Type: "series", Year: "2024" },
    seasons: [
      {
        season_number: 1,
        name: "Season 1",
        episode_count: 3,
        air_date: "2024-03-01",
        poster_path: "/e2e-990011-s1.jpg",
        overview: "Season with edge case episodes",
      },
    ],
    episodesData: {
      1: [
        {
          id: 990011101,
          season_number: 1,
          episode_number: 1,
          name: "Pilot & Ep 1 <Special>",
          overview: "Contains special characters: & < > \" '",
          runtime: 55,
          air_date: "2024-03-01",
          still_path: "/mock-still-s1e1.jpg",
          vote_average: 8.5,
          vote_count: 10,
        },
        {
          id: 990011102,
          season_number: 1,
          episode_number: 2,
          name: "Episode Without Still",
          overview: "Episode has null still_path",
          runtime: 42,
          air_date: "2024-03-08",
          still_path: null,
          vote_average: 7.2,
          vote_count: 5,
        },
        {
          id: 990011103,
          season_number: 1,
          episode_number: 3,
          name: "A".repeat(80),
          overview: "Very long title episode",
          runtime: 60,
          air_date: "2024-03-15",
          still_path: "/mock-still-s1e3.jpg",
          vote_average: 9.0,
          vote_count: 20,
        },
      ],
    },
  },
  {
    // TV show that triggers 503 on season endpoint
    kind: "tv",
    id: 990099,
    title: "E2E Down TV Show",
    date: "2024-04-01",
    imdb: "tt9900099",
    omdb: { Type: "series", Year: "2024" },
    errorOnSeason: true,
  },
];

/** "E2E Many" finds 50 movies: two pages of the Import page. */
const MANY = Array.from({ length: 50 }, (_, n) => ({
  kind: "movie",
  id: 991000 + n,
  title: `E2E Many ${n + 1}`,
  date: "2010-01-01",
}));

function searchResult(entry) {
  const movie = entry.kind === "movie";
  return {
    id: entry.id,
    [movie ? "title" : "name"]: entry.title,
    [movie ? "release_date" : "first_air_date"]: entry.date,
    poster_path: entry.poster === false ? null : `/e2e-${entry.id}.jpg`,
  };
}

function details(entry) {
  const movie = entry.kind === "movie";
  const defaultSeasons = [
    {
      id: entry.id * 10 + 1,
      season_number: 1,
      name: "Season 1",
      episode_count: 10,
      air_date: entry.date ?? "2020-01-01",
      poster_path: `/e2e-${entry.id}-s1.jpg`,
      overview: `Season 1 of ${entry.title}`,
    },
    {
      id: entry.id * 10 + 2,
      season_number: 2,
      name: "Season 2",
      episode_count: 8,
      air_date: "2021-01-01",
      poster_path: `/e2e-${entry.id}-s2.jpg`,
      overview: `Season 2 of ${entry.title}`,
    },
  ];
  const seasons = entry.seasons ?? (movie ? undefined : defaultSeasons);
  const totalEpisodes = seasons ? seasons.reduce((sum, s) => sum + (s.episode_count ?? 0), 0) : undefined;

  return {
    ...searchResult(entry),
    [movie ? "original_title" : "original_name"]: entry.title,
    ...(movie
      ? { runtime: entry.runtime }
      : {
          episode_run_time: [30],
          created_by: [{ name: "Sam Rivera" }],
          number_of_seasons: seasons ? seasons.length : 0,
          number_of_episodes: totalEpisodes,
          seasons,
        }),
    genres: [{ id: 18, name: "Drama" }],
    origin_country: entry.countries ?? ["CA"],
    original_language: "en",
    overview: entry.overview ?? `${entry.title}, as TMDB tells it.`,
    tagline: "",
    vote_average: 7.4,
    vote_count: 120,
    backdrop_path: `/e2e-${entry.id}-backdrop.jpg`,
    credits: {
      cast: [{ name: "Ana Ruiz" }, { name: "Lee Park" }],
      crew: movie ? [{ job: "Director", name: "Jo Tran" }] : [],
    },
    keywords: movie ? { keywords: [{ name: "lgbt" }] } : { results: [{ name: "lgbt" }] },
    external_ids: { imdb_id: entry.imdb },
  };
}

function omdbAnswer(entry) {
  const year = entry.date.slice(0, 4);
  return {
    Title: entry.title,
    Year: year,
    Released: "N/A",
    Runtime: entry.runtime ? `${entry.runtime} min` : "N/A",
    Genre: "Drama",
    Director: "Jo Tran",
    Actors: "Ana Ruiz, Lee Park",
    Plot: "N/A",
    Language: "English",
    Country: "Canada",
    Poster: "N/A",
    imdbRating: "7.0",
    imdbVotes: "1,000",
    imdbID: entry.imdb,
    Type: entry.kind === "movie" ? "movie" : "series",
    Response: "True",
    ...entry.omdb,
  };
}

function send(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

// Minimal 1x1 JPEG image bytes
const DUMMY_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
  0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
  0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
  0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
  0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
  0x00, 0xbf, 0x80, 0xff, 0xd9,
]);

function tmdb(url, response) {
  if (url.searchParams.get("api_key") !== TMDB_KEY) {
    return send(response, 401, { status_code: 7, status_message: "Invalid API key" });
  }
  const path = url.pathname.replace(/^\/tmdb\/3/, "");
  let match;

  if ((match = /^\/search\/(movie|tv)$/.exec(path))) {
    const query = (url.searchParams.get("query") ?? "").toLowerCase();
    if (query === "e2e tmdb down") return send(response, 503, { status_message: "Down" });
    const page = Number(url.searchParams.get("page") ?? 1);
    const found = [...TITLES, ...MANY].filter(
      (entry) => entry.kind === match[1] && entry.title.toLowerCase().includes(query)
    );
    return send(response, 200, {
      page,
      results: found.slice((page - 1) * 20, page * 20).map(searchResult),
      total_pages: Math.ceil(found.length / 20),
      total_results: found.length,
    });
  }

  if ((match = /^\/find\/(tt\d+)$/.exec(path))) {
    const found = TITLES.filter((entry) => entry.imdb === match[1]);
    return send(response, 200, {
      movie_results: found.filter((entry) => entry.kind === "movie").map(searchResult),
      tv_results: found.filter((entry) => entry.kind === "tv").map(searchResult),
    });
  }

  // Season details endpoint: /tv/{id}/season/{season_number}
  if ((match = /^\/tv\/(\d+)\/season\/(\d+)$/.exec(path))) {
    const tvId = Number(match[1]);
    const seasonNumber = Number(match[2]);
    const entry = TITLES.find((title) => title.kind === "tv" && title.id === tvId);
    if (!entry) return send(response, 404, { status_code: 34, status_message: "TV show not found" });
    if (entry.errorOnSeason) return send(response, 503, { status_message: "TMDB Season Down" });

    const seasons = entry.seasons ?? [
      {
        season_number: 1,
        name: "Season 1",
        episode_count: 10,
        air_date: entry.date ?? "2020-01-01",
        poster_path: `/e2e-${tvId}-s1.jpg`,
        overview: `Season 1 of ${entry.title}`,
      },
      {
        season_number: 2,
        name: "Season 2",
        episode_count: 8,
        air_date: "2021-01-01",
        poster_path: `/e2e-${tvId}-s2.jpg`,
        overview: `Season 2 of ${entry.title}`,
      },
    ];

    const season = seasons.find((s) => s.season_number === seasonNumber);
    if (!season) return send(response, 404, { status_code: 34, status_message: "Season not found" });

    const customEpisodes = entry.episodesData?.[seasonNumber];
    const episodeCount = season.episode_count ?? 10;
    const episodes =
      customEpisodes ??
      Array.from({ length: episodeCount }, (_, i) => {
        const epNum = i + 1;
        return {
          id: tvId * 1000 + seasonNumber * 100 + epNum,
          season_number: seasonNumber,
          episode_number: epNum,
          name: `Episode ${epNum}`,
          overview: `Overview for Season ${seasonNumber} Episode ${epNum}.`,
          runtime: 45,
          air_date: `2024-0${Math.min(seasonNumber, 9)}-${String(Math.min(epNum, 28)).padStart(2, "0")}`,
          still_path: `/mock-still-s${seasonNumber}e${epNum}.jpg`,
          vote_average: 8.0,
          vote_count: 30,
        };
      });

    return send(response, 200, {
      _id: `mock-season-${tvId}-${seasonNumber}`,
      id: tvId * 100 + seasonNumber,
      season_number: seasonNumber,
      name: season.name ?? `Season ${seasonNumber}`,
      overview: season.overview ?? `Season ${seasonNumber} overview`,
      air_date: season.air_date ?? "2024-01-01",
      poster_path: season.poster_path ?? `/e2e-${tvId}-s${seasonNumber}.jpg`,
      episodes,
    });
  }

  // Movie or TV details endpoint: /movie/{id} or /tv/{id}
  if ((match = /^\/(movie|tv)\/(\d+)$/.exec(path))) {
    const entry = TITLES.find((title) => title.kind === match[1] && title.id === Number(match[2]));
    return entry ? send(response, 200, details(entry)) : send(response, 404, { status_code: 34 });
  }

  send(response, 404, { status_code: 34 });
}

function omdb(url, response) {
  if (url.searchParams.get("apikey") !== OMDB_KEY) {
    return send(response, 401, { Response: "False", Error: "Invalid API key!" });
  }
  const id = url.searchParams.get("i");
  const title = url.searchParams.get("t");
  const entry = TITLES.find((candidate) => (id ? candidate.imdb === id : candidate.title === title));
  if (entry && entry.omdb === null) return send(response, 500, { Response: "False", Error: "Down" });
  if (!entry) return send(response, 200, { Response: "False", Error: "Movie not found!" });
  send(response, 200, omdbAnswer(entry));
}

const port = Number(process.argv[2]) || 3101;
createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${port}`);
  if (url.pathname === "/health") return send(response, 200, { ok: true });

  // Serve mock images (thumbnails, posters, stills)
  if (
    url.pathname.startsWith("/t/p/") ||
    url.pathname.includes("mock-still") ||
    /\.(jpe?g|png|webp)$/i.test(url.pathname)
  ) {
    response.writeHead(200, {
      "Content-Type": "image/jpeg",
      "Content-Length": DUMMY_JPEG.length,
      "Access-Control-Allow-Origin": "*",
    });
    return response.end(DUMMY_JPEG);
  }

  if (url.pathname.startsWith("/tmdb/")) return tmdb(url, response);
  if (url.pathname.startsWith("/omdb/")) return omdb(url, response);
  send(response, 404, {});
}).listen(port, "127.0.0.1");
