export const EMBED_BASE_ORIGIN = "https://gayflix.my.id";

function extractCleanTmdbId(tmdbId?: string | number | null): string | null {
  if (tmdbId === null || tmdbId === undefined) return null;
  const raw = String(tmdbId).trim();
  const match = raw.match(/\d+/);
  return match ? match[0] : null;
}

function extractCleanImdbId(imdbId?: string | null): string | null {
  if (!imdbId) return null;
  const raw = imdbId.trim();
  return raw.length > 0 ? raw : null;
}

export interface EmbedIdentifiers {
  imdbId?: string | null;
  tmdbId?: string | number | null;
}

export interface EpisodeEmbedIdentifiers extends EmbedIdentifiers {
  seasonNumber: number;
  episodeNumber: number;
}

/**
 * Builds the default embed URL for a movie.
 * Prioritizes IMDb ID (e.g. tt27987047). Falls back to TMDB ID.
 */
export function buildDefaultMovieEmbedUrl(identifiers: EmbedIdentifiers): string | null {
  const imdbId = extractCleanImdbId(identifiers.imdbId);
  if (imdbId) {
    return `${EMBED_BASE_ORIGIN}/embed/movie/${imdbId}`;
  }

  const tmdbId = extractCleanTmdbId(identifiers.tmdbId);
  if (tmdbId) {
    return `${EMBED_BASE_ORIGIN}/embed/movie/${tmdbId}`;
  }

  return null;
}

/**
 * Builds the default embed URL for a TV episode.
 * Prioritizes IMDb ID (e.g. tt27987047). Falls back to TMDB ID.
 * Format: https://gayflix.my.id/embed/tv/{id}/{season}/{episode}
 */
export function buildDefaultEpisodeEmbedUrl(identifiers: EpisodeEmbedIdentifiers): string | null {
  const imdbId = extractCleanImdbId(identifiers.imdbId);
  const season = Math.max(0, identifiers.seasonNumber);
  const episode = Math.max(0, identifiers.episodeNumber);

  if (imdbId) {
    return `${EMBED_BASE_ORIGIN}/embed/tv/${imdbId}/${season}/${episode}`;
  }

  const tmdbId = extractCleanTmdbId(identifiers.tmdbId);
  if (tmdbId) {
    return `${EMBED_BASE_ORIGIN}/embed/tv/${tmdbId}/${season}/${episode}`;
  }

  return null;
}

/**
 * Builds query-string based embed URL:
 * Movie: https://gayflix.my.id/embed/movie?imdb=tt1300854 or ?tmdb=...
 * TV: https://gayflix.my.id/embed/tv?imdb=tt0944947&season=1&episode=1 or ?tmdb=...
 */
export function buildEmbedQueryUrl(
  type: "movie" | "tv",
  identifiers: {
    imdbId?: string | null;
    tmdbId?: string | number | null;
    season?: number;
    episode?: number;
  }
): string | null {
  const imdbId = extractCleanImdbId(identifiers.imdbId);
  const tmdbId = extractCleanTmdbId(identifiers.tmdbId);

  if (type === "movie") {
    if (imdbId) {
      return `${EMBED_BASE_ORIGIN}/embed/movie?imdb=${encodeURIComponent(imdbId)}`;
    }
    if (tmdbId) {
      return `${EMBED_BASE_ORIGIN}/embed/movie?tmdb=${encodeURIComponent(tmdbId)}`;
    }
    return null;
  }

  const season = identifiers.season ?? 1;
  const episode = identifiers.episode ?? 1;

  if (imdbId) {
    return `${EMBED_BASE_ORIGIN}/embed/tv?imdb=${encodeURIComponent(imdbId)}&season=${season}&episode=${episode}`;
  }
  if (tmdbId) {
    return `${EMBED_BASE_ORIGIN}/embed/tv?tmdb=${encodeURIComponent(tmdbId)}&season=${season}&episode=${episode}`;
  }

  return null;
}

/**
 * Generates an iframe markup string for a movie embed URL.
 * e.g. <iframe src="https://gayflix.my.id/embed/movie/..." width="100%" height="560" frameborder="0" allowfullscreen></iframe>
 */
export function buildDefaultMovieIframeHtml(url: string): string {
  return `<iframe src="${url}" width="100%" height="560" frameborder="0" allowfullscreen></iframe>`;
}
