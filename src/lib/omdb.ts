import { getJson, SourceError } from "@/lib/source-request";

/*
 * OMDb (omdbapi.com), the Import page's second source: what IMDb says
 * about a title. Server code only: the requests carry OMDB_API_KEY, which
 * OMDb only takes in the address. A free key allows 1,000 requests a day.
 * OMDB_API_BASE points the requests somewhere else; only the end-to-end
 * tests set it.
 */

function apiKey() {
  return process.env.OMDB_API_KEY?.trim() ?? "";
}

export function omdbConfigured() {
  return apiKey() !== "";
}

/** OMDb's answer for a title, or null when it has none. */
async function omdbGet(params: Record<string, string>): Promise<unknown> {
  const key = apiKey();
  if (!key) throw new SourceError("OMDB_API_KEY isn't set.");
  const url = new URL(process.env.OMDB_API_BASE || "https://www.omdbapi.com/");
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  url.searchParams.set("apikey", key);

  // OMDb answers errors as JSON too, some with a 401: {"Response":"False","Error":"..."}.
  const { status, body } = await getJson(url, { source: "OMDb" });
  const response = (body as { Response?: unknown } | null)?.Response;
  if (response === "True") return body;
  if (response === "False") {
    const error = String((body as { Error?: unknown }).Error ?? "");
    if (/not found|incorrect imdb id/i.test(error)) return null;
    if (/limit/i.test(error)) throw new SourceError("OMDb's daily limit is used up.");
    if (/api key/i.test(error)) throw new SourceError("OMDb refused the key in OMDB_API_KEY.");
  }
  throw new SourceError(status === 429 ? "OMDb asked the site to slow down." : "OMDb didn't answer.");
}

/** What IMDb has under an id. */
export function getOmdbById(imdbId: string) {
  return omdbGet({ i: imdbId, plot: "full" });
}

/** IMDb's best match for a title released in `year` (any type). */
export function getOmdbByTitle(title: string, year: number | null) {
  return omdbGet({ t: title, ...(year !== null && { y: String(year) }), plot: "full" });
}
