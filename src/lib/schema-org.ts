import type { Episode, MediaDetail } from "@/lib/media";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/page-metadata";
import { titleHref } from "@/lib/title-href";

/** Formats minutes or duration string (e.g. 95, "1h 35m", "42 min") to ISO 8601 duration (e.g. PT1H35M). */
export function formatDurationToIso(duration?: string | number): string | undefined {
  if (typeof duration === "number") {
    if (duration <= 0) return "PT0M";
    const h = Math.floor(duration / 60);
    const m = duration % 60;
    return h > 0 ? (m > 0 ? `PT${h}H${m}M` : `PT${h}H`) : `PT${m}M`;
  }
  if (!duration) return undefined;
  const matchHours = duration.match(/(\d+)\s*h/i);
  const matchMins = duration.match(/(\d+)\s*m/i);
  const hours = matchHours ? parseInt(matchHours[1], 10) : 0;
  const mins = matchMins ? parseInt(matchMins[1], 10) : 0;
  if (!hours && !mins) return undefined;
  return hours > 0 ? (mins > 0 ? `PT${hours}H${mins}M` : `PT${hours}H`) : `PT${mins}M`;
}

/** Schema.org WebSite with SearchAction for the homepage. */
export function buildWebsiteJsonLd(siteUrl: string) {
  const origin = siteUrl.replace(/\/+$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: origin,
    description: SITE_DESCRIPTION,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${origin}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/** Schema.org Movie markup for a movie page. */
export function buildMovieJsonLd(movie: MediaDetail, siteUrl: string) {
  const origin = siteUrl.replace(/\/+$/, "");
  const image = movie.backdropUrl || movie.posterUrl || undefined;
  const duration = formatDurationToIso(movie.runtimeMinutes ?? movie.duration);

  return {
    "@context": "https://schema.org",
    "@type": "Movie",
    name: movie.title,
    url: `${origin}${titleHref(movie)}`,
    description: movie.synopsis || movie.tagline || undefined,
    image,
    datePublished: movie.year ? String(movie.year) : undefined,
    duration,
    genre: movie.genres && movie.genres.length > 0 ? movie.genres : undefined,
    contentRating: movie.maturityRating || undefined,
    director: movie.director ? [{ "@type": "Person", name: movie.director }] : undefined,
    actor: movie.cast && movie.cast.length > 0
      ? movie.cast.map((name) => ({ "@type": "Person", name }))
      : undefined,
    countryOfOrigin: movie.country ? { "@type": "Country", name: movie.country } : undefined,
  };
}

/** Schema.org TVSeries markup for a series page. */
export function buildSeriesJsonLd(series: MediaDetail, siteUrl: string) {
  const origin = siteUrl.replace(/\/+$/, "");
  const image = series.backdropUrl || series.posterUrl || undefined;
  const seasonCount = series.episodes?.length
    ? new Set(series.episodes.map((ep) => ep.seasonNumber)).size
    : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "TVSeries",
    name: series.title,
    url: `${origin}${titleHref(series)}`,
    description: series.synopsis || series.tagline || undefined,
    image,
    startDate: series.year ? String(series.year) : undefined,
    numberOfSeasons: seasonCount,
    genre: series.genres && series.genres.length > 0 ? series.genres : undefined,
    contentRating: series.maturityRating || undefined,
    creator: series.creator ? [{ "@type": "Person", name: series.creator }] : undefined,
    actor: series.cast && series.cast.length > 0
      ? series.cast.map((name) => ({ "@type": "Person", name }))
      : undefined,
    countryOfOrigin: series.country ? { "@type": "Country", name: series.country } : undefined,
  };
}

/** Schema.org TVEpisode markup for an episode page. */
export function buildEpisodeJsonLd(episode: Episode, series: MediaDetail, siteUrl: string) {
  const origin = siteUrl.replace(/\/+$/, "");
  const image = episode.stillUrl || series.backdropUrl || series.posterUrl || undefined;

  return {
    "@context": "https://schema.org",
    "@type": "TVEpisode",
    name: episode.title,
    url: `${origin}/episode/${episode.id}`,
    episodeNumber: episode.episodeNumber,
    description: episode.synopsis || undefined,
    image,
    duration: formatDurationToIso(episode.duration),
    partOfSeason: {
      "@type": "TVSeason",
      seasonNumber: episode.seasonNumber,
    },
    partOfSeries: {
      "@type": "TVSeries",
      name: series.title,
      url: `${origin}${titleHref(series)}`,
    },
  };
}

/** Schema.org BreadcrumbList for navigational clarity in search results. */
export function buildBreadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/** Schema.org VideoObject markup for a movie, required for Google video search and badges. */
export function buildMovieVideoJsonLd(movie: MediaDetail, siteUrl: string) {
  const origin = siteUrl.replace(/\/+$/, "");
  const thumbnails = [movie.backdropUrl, movie.posterUrl].filter((u): u is string => Boolean(u));
  const uploadDate =
    movie.publishedAt || movie.createdAt || (movie.year ? `${movie.year}-01-01T00:00:00.000Z` : "2024-01-01T00:00:00.000Z");

  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: movie.title,
    description: movie.synopsis || movie.tagline || `Watch ${movie.title} (${movie.year}) on ${SITE_NAME}.`,
    thumbnailUrl: thumbnails.length > 0 ? thumbnails : [`${origin}/brand/gayflix-share.png`],
    uploadDate,
    duration: formatDurationToIso(movie.runtimeMinutes ?? movie.duration),
    embedUrl: `${origin}/watch/${movie.id}`,
    genre: movie.genres && movie.genres.length > 0 ? movie.genres : undefined,
    inLanguage: movie.language || undefined,
    director: movie.director ? [{ "@type": "Person", name: movie.director }] : undefined,
    actor: movie.cast && movie.cast.length > 0
      ? movie.cast.map((name) => ({ "@type": "Person", name }))
      : undefined,
  };
}

/** Schema.org VideoObject markup for a series episode. */
export function buildEpisodeVideoJsonLd(episode: Episode, series: MediaDetail, siteUrl: string) {
  const origin = siteUrl.replace(/\/+$/, "");
  const thumbnails = [episode.stillUrl, series.backdropUrl, series.posterUrl].filter((u): u is string => Boolean(u));
  const uploadDate =
    series.publishedAt || series.createdAt || (series.year ? `${series.year}-01-01T00:00:00.000Z` : "2024-01-01T00:00:00.000Z");

  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: `${series.title} S${episode.seasonNumber} E${episode.episodeNumber}: ${episode.title}`,
    description:
      episode.synopsis ||
      series.synopsis ||
      `Watch ${series.title} season ${episode.seasonNumber} episode ${episode.episodeNumber} on ${SITE_NAME}.`,
    thumbnailUrl: thumbnails.length > 0 ? thumbnails : [`${origin}/brand/gayflix-share.png`],
    uploadDate,
    duration: formatDurationToIso(episode.duration),
    embedUrl: `${origin}/episode/${episode.id}`,
    partOfSeries: {
      "@type": "TVSeries",
      name: series.title,
      url: `${origin}${titleHref(series)}`,
    },
    inLanguage: series.language || undefined,
  };
}
