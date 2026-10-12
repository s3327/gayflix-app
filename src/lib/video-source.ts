import { videoHostAllowed } from "@/lib/video-hosts";

/*
 * A movie's or an episode's video sources (the VideoSource table): the
 * checks on what an admin types, shared by the server functions in
 * src/lib/admin-video-actions.ts. No database access here.
 */

export const VIDEO_KINDS = ["embed", "hls", "file"] as const;
export type VideoSourceKind = (typeof VIDEO_KINDS)[number];

/** What the watch pages get for each source, in tab order. */
export type VideoSourceEntry = { id: string; label: string; kind: VideoSourceKind; url: string };

/** How the admin panel names each kind. */
export const KIND_NAMES: Record<VideoSourceKind, string> = {
  embed: "Embed",
  hls: "HLS stream",
  file: "Video file",
};

export const VIDEO_SOURCE_FIELDS = ["label", "kind", "url"] as const;
export type VideoSourceValues = Record<(typeof VIDEO_SOURCE_FIELDS)[number], string>;

/** A movie or an episode has at most this many sources (server tabs). */
export const MAX_VIDEO_SOURCES = 10;
export const MAX_LABEL_LENGTH = 40;
const MAX_URL_LENGTH = 2000;
/** Embed code is longer than its link. */
const MAX_INPUT_LENGTH = 4000;

export type ParsedVideoSource =
  | { ok: true; data: { label: string; kind: VideoSourceKind; url: string } }
  | { ok: false; errors: Partial<Record<keyof VideoSourceValues, string>> };

/**
 * Checks the Video section's form. The link field takes a link or a
 * provider's <iframe> embed code, whose src is kept. The type field is
 * "auto" (worked out from the link), or one of VIDEO_KINDS.
 */
export function parseVideoSource(values: VideoSourceValues, hosts: string[]): ParsedVideoSource {
  const errors: Partial<Record<keyof VideoSourceValues, string>> = {};

  const label = values.label.trim();
  if (!label) errors.label = "Give it a name, like Server 1.";
  else if (label.length > MAX_LABEL_LENGTH) errors.label = `Use ${MAX_LABEL_LENGTH} characters or fewer.`;

  const kindChoice = values.kind;
  if (kindChoice !== "auto" && !isVideoKind(kindChoice)) errors.kind = "Choose a type.";

  const input = values.url.trim();
  const isCode = input.startsWith("<");
  const link = isCode ? embedSrc(input) : input;
  let url: URL | null = null;
  if (!input) errors.url = "Paste the video's link or its embed code.";
  else if (input.length > MAX_INPUT_LENGTH) errors.url = "That's too long for a link or embed code.";
  else if (link === null) {
    errors.url = "That code has no <iframe> link in it. Paste the link, or the provider's <iframe> code.";
  } else {
    const problem = videoUrlProblem(link, hosts);
    if (problem) errors.url = problem;
    else url = new URL(link);
  }

  let kind: VideoSourceKind = "embed";
  if (url && !errors.kind) {
    kind = kindChoice === "auto" ? (isCode ? "embed" : detectKind(url)) : (kindChoice as VideoSourceKind);
    if (isCode && kind !== "embed") {
      errors.url = "That's embed code. Choose Embed, or paste the video file's own link.";
    }
  }

  if (Object.keys(errors).length > 0 || !url) return { ok: false, errors };
  return { ok: true, data: { label, kind, url: url.href } };
}

export function isVideoKind(value: unknown): value is VideoSourceKind {
  return (VIDEO_KINDS as readonly unknown[]).includes(value);
}

/** What's wrong with a video link, or null when it can be saved. */
export function videoUrlProblem(value: string, hosts: string[]): string | null {
  if (value.length > MAX_URL_LENGTH) return "That link is too long.";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "Enter a full link, starting with https://.";
  }
  if (url.protocol !== "https:") return "Use a link that starts with https://.";
  if (url.port) return "Use a link without a port number.";
  if (!videoHostAllowed(url.hostname, hosts)) {
    return hosts.length === 0
      ? "No video hosts are allowed yet. Add this one to VIDEO_HOSTS first."
      : `Videos can only come from ${hosts.join(", ")}. Other hosts need adding to VIDEO_HOSTS first.`;
  }
  return null;
}

/**
 * The type a link most likely is: an .m3u8 playlist is an HLS stream,
 * an .mp4, .m4v or .webm file plays as it is, and anything else is taken
 * to be a player page to embed.
 */
export function detectKind(url: URL): VideoSourceKind {
  const path = url.pathname.toLowerCase();
  if (path.endsWith(".m3u8")) return "hls";
  if (/\.(mp4|m4v|webm)$/.test(path)) return "file";
  return "embed";
}

/** The src of the first <iframe> in a provider's embed code, or null. */
export function embedSrc(code: string): string | null {
  const match = /<iframe\b[^>]*?\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(code);
  const src = match?.[1] ?? match?.[2] ?? match?.[3];
  if (!src) return null;
  const link = src.trim().replace(/&(amp|#38|#x26);/gi, "&");
  // Embed code often leaves the scheme out: "//player.example.com/…".
  return link.startsWith("//") ? `https:${link}` : link;
}
