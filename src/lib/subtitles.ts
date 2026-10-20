/*
 * Subtitles for a movie or an episode: which files the admin panel takes
 * and how they're stored. An admin uploads a SubRip (.srt) or WebVTT
 * (.vtt) file per language (src/lib/admin-subtitle-actions.ts); it's
 * kept as WebVTT in the database and served from this site
 * (src/app/subtitles/[id]/route.ts), so the player can load it whatever
 * host the video comes from. No database access here.
 */

/** 500 KB: a film's subtitles are usually 30 to 150 KB. */
export const MAX_SUBTITLE_BYTES = 500 * 1024;
/** A movie or an episode has at most this many (one per language). */
export const MAX_SUBTITLES = 20;

export const SUBTITLE_SIZE_PROBLEM = "That file is over 500 KB. Is it a subtitle file?";
export const SUBTITLE_TYPE_PROBLEM =
  "That isn't a subtitle file we can read. Upload a SubRip (.srt) or WebVTT (.vtt) file.";

/** What the player gets for each language: its <track>. */
export type SubtitleTrack = { id: string; language: string; label: string };

/** Prisma's cuid(), a subtitle's id. */
export const SUBTITLE_ID = /^[a-z0-9]{20,40}$/;

/** Where the player loads a subtitle file from. */
export function subtitleUrl(id: string): string {
  return `/subtitles/${id}`;
}

/** For the file picker's `accept`. */
export const SUBTITLE_ACCEPT = ".srt,.vtt,text/vtt,application/x-subrip";

/** The languages offered, as BCP 47 codes (the <track>'s srclang). */
export const SUBTITLE_LANGUAGES = [
  "ar", "cs", "da", "de", "el", "en", "es", "es-419", "fi", "fil", "fr", "he", "hi", "hu",
  "id", "it", "ja", "ko", "ms", "nb", "nl", "pl", "pt", "pt-BR", "ro", "ru", "sv", "th",
  "tr", "uk", "vi", "zh-Hans", "zh-Hant",
] as const;

export type SubtitleLanguage = (typeof SUBTITLE_LANGUAGES)[number];

export function isSubtitleLanguage(value: unknown): value is SubtitleLanguage {
  return (SUBTITLE_LANGUAGES as readonly unknown[]).includes(value);
}

const names = new Intl.DisplayNames(["en"], { type: "language" });

/** "pt-BR" → "Brazilian Portuguese": the player's subtitle menu shows it. */
export function languageName(code: string): string {
  return names.of(code) ?? code;
}

/**
 * A subtitle file's text: UTF-8, or else Windows-1252, which older
 * SubRip files often are. Null for a binary file.
 */
export function decodeSubtitleFile(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** A cue's timing line: "00:00:01,000 --> 00:00:04,250" (SubRip) or with dots (WebVTT). */
const TIMING = /^\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})/;

/**
 * The file as WebVTT, or null when it has no cues. WebVTT is kept as it
 * is; SubRip is converted cue by cue, leaving out its numbers, anything
 * after the times (its screen positions) and cues with no text.
 */
export function toWebVtt(input: string): string | null {
  const text = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n");

  if (/^WEBVTT(?:[ \t][^\n]*)?(?:\n|$)/.test(text)) {
    if (!text.split("\n").some((line) => TIMING.test(line))) return null;
    return text.endsWith("\n") ? text : `${text}\n`;
  }

  const cues: string[] = [];
  for (const block of text.split(/\n(?:[ \t]*\n)+/)) {
    const lines = block.split("\n");
    const at = lines.findIndex((line) => TIMING.test(line));
    // A cue's number may come before its times, nothing else.
    if (at < 0 || at > 1) continue;
    const [, start, end] = TIMING.exec(lines[at])!;
    const cueText = lines
      .slice(at + 1)
      .map((line) => line.trimEnd())
      .filter((line) => line.trim() !== "")
      // "-->" would read as a new cue's times.
      .map((line) => line.replaceAll("-->", "->"));
    if (cueText.length === 0) continue;
    cues.push(`${start.replace(",", ".")} --> ${end.replace(",", ".")}\n${cueText.join("\n")}`);
  }
  if (cues.length === 0) return null;
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}
