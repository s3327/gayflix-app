/*
 * Requests to the title sources the Import page uses (src/lib/tmdb.ts and
 * src/lib/omdb.ts). Server code only: the requests carry the sites' keys.
 */

/** How long a source has to answer. */
const TIMEOUT_MS = 8000;
/** A 429 asking for a longer wait than this isn't retried. */
const MAX_RETRY_WAIT_MS = 5000;
/**
 * Answers are kept for an hour: titles rarely change in that time, and
 * OMDb counts every request against a daily limit. Only answers with a
 * 200 status are kept.
 */
const REVALIDATE_SECONDS = 3600;

/** A source that didn't answer, or refused. The message is for the admin. */
export class SourceError extends Error {}

/**
 * GETs a source's JSON. A 429 is retried once, after the wait the source
 * asks for. `body` is null when the answer isn't JSON.
 */
export async function getJson(
  url: URL,
  { source, headers }: { source: string; headers?: Record<string, string> }
): Promise<{ status: number; body: unknown }> {
  for (let attempt = 1; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: "application/json", ...headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        next: { revalidate: REVALIDATE_SECONDS },
      });
    } catch {
      throw new SourceError(`${source} didn't answer. Try again in a minute.`);
    }
    if (response.status === 429 && attempt === 1) {
      const wait = retryAfterMs(response.headers.get("retry-after"));
      if (wait <= MAX_RETRY_WAIT_MS) {
        await new Promise((resolve) => setTimeout(resolve, wait));
        continue;
      }
    }
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Not JSON: an error page, say.
    }
    return { status: response.status, body };
  }
}

/** A Retry-After header (seconds) in milliseconds; a second when it's missing. */
export function retryAfterMs(header: string | null): number {
  const seconds = Number(header);
  return header && Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 1000;
}
