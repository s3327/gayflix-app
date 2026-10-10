import { isMediaId } from "@/lib/library-types";

/*
 * Shared by the Report modal and the report server functions, so the
 * reasons and limits the modal shows are the ones the server enforces.
 */

export const REPORT_REASONS = [
  "Video won't play",
  "Wrong video for this title",
  "Poor video/audio quality",
  "Audio out of sync",
  "Subtitles missing or wrong",
  "Other",
] as const;

export const GUEST_REPORT_LIMIT = 1;
export const LOGGED_IN_REPORT_LIMIT = 5;
export const MAX_REPORT_DETAILS = 1000;

export type ReportAllowance = {
  limit: number;
  remaining: number;
  isLoggedIn: boolean;
};

export type ReportInput = {
  mediaId: string;
  reason: (typeof REPORT_REASONS)[number];
  details: string | null;
};

/** Checks a report sent from the browser; null if anything is off. */
export function parseReport(value: unknown): ReportInput | null {
  if (!value || typeof value !== "object") return null;
  const { mediaId, reason, details } = value as Record<string, unknown>;
  if (!isMediaId(mediaId)) return null;
  if (!REPORT_REASONS.includes(reason as ReportInput["reason"])) return null;
  if (details !== undefined && details !== null && typeof details !== "string") return null;
  const trimmed = details?.trim() ?? "";
  if (trimmed.length > MAX_REPORT_DETAILS) return null;
  return { mediaId, reason: reason as ReportInput["reason"], details: trimmed || null };
}

/** Limits reset at midnight UTC. */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
