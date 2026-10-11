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
  return {
    ...searchResult(entry),
    [movie ? "original_title" : "original_name"]: entry.title,
    ...(movie ? { runtime: entry.runtime } : { episode_run_time: [30], created_by: [{ name: "Sam Rivera" }] }),
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

const port = Number(process.argv[2]);
createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${port}`);
  if (url.pathname === "/health") return send(response, 200, { ok: true });
  if (url.pathname.startsWith("/tmdb/")) return tmdb(url, response);
  if (url.pathname.startsWith("/omdb/")) return omdb(url, response);
  send(response, 404, {});
}).listen(port, "127.0.0.1");
