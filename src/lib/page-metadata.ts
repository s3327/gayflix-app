import type { Metadata } from "next";
import type { Episode, MediaDetail } from "@/lib/media";
import { titleHref } from "@/lib/title-href";

/*
 * What the public pages put in <head>: the browser tab title, the
 * description search engines show, and the link preview (Open Graph and
 * X cards) that chat apps and social sites build when someone shares a
 * link.
 */

export const SITE_NAME = "Gayflix";
export const SITE_TITLE = "Gayflix — Love. Stories. Ours.";
export const SITE_DESCRIPTION = "LGBTQ+ stories, films, and series — picked by our community.";

/**
 * The link preview every page starts from. A page that sets its own
 * openGraph replaces this whole object rather than adding to it, so
 * title pages spread it into theirs.
 */
export const OPEN_GRAPH = {
  siteName: SITE_NAME,
  type: "website",
  locale: "en_US",
} as const satisfies Metadata["openGraph"];

/** Longest description kept whole; search results cut off around here. */
const DESCRIPTION_LENGTH = 160;

/** `text` cut at a word boundary to fit a description, with "…" when cut. */
export function shortDescription(text: string, max = DESCRIPTION_LENGTH): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.—-]+$/, "")}…`;
}

type PreviewKind = "video.movie" | "video.tv_show" | "video.episode";

/**
 * Head tags for a page about one title: `name` in the tab, the title's
 * synopsis (or tagline) as the description, and its backdrop, or else
 * its poster, as the preview image. A backdrop is wide, so it gets X's
 * large card; a poster is tall and would be cropped there, so it gets
 * the small one.
 */
function previewMetadata({
  name,
  path,
  kind,
  title,
}: {
  name: string;
  path: string;
  kind: PreviewKind;
  title: MediaDetail;
}): Metadata {
  const description = shortDescription(
    title.synopsis || title.tagline || `Watch ${title.title} (${title.year}) on ${SITE_NAME}.`
  );
  const image = title.backdropUrl ?? (title.posterUrl || undefined);
  const images = image ? [{ url: image, alt: title.title }] : undefined;

  return {
    title: name,
    description,
    alternates: { canonical: path },
    openGraph: { ...OPEN_GRAPH, type: kind, title: name, description, url: path, images },
    twitter: {
      card: title.backdropUrl ? "summary_large_image" : "summary",
      title: name,
      description,
      images,
    },
  };
}

/** /movie/[id] and /series/[id]: "Chosen Family (2025)". */
export function titleMetadata(title: MediaDetail): Metadata {
  return previewMetadata({
    name: `${title.title} (${title.year})`,
    path: titleHref(title),
    kind: title.type === "movie" ? "video.movie" : "video.tv_show",
    title,
  });
}

/** /watch/[id]: "Watch Chosen Family (2025)". */
export function watchMetadata(movie: MediaDetail): Metadata {
  return previewMetadata({
    name: `Watch ${movie.title} (${movie.year})`,
    path: `/watch/${movie.id}`,
    kind: "video.movie",
    title: movie,
  });
}

/**
 * /episode/[id]: "The Brownstone S1 E1: Move-In Day". Episodes have no
 * synopsis or images of their own, so the preview uses the series'.
 */
export function episodeMetadata(episode: Episode, series: MediaDetail): Metadata {
  return previewMetadata({
    name: `${series.title} S${episode.seasonNumber} E${episode.episodeNumber}: ${episode.title}`,
    path: `/episode/${episode.id}`,
    kind: "video.episode",
    title: series,
  });
}
