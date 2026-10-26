/*
 * What members may post to the community (A9): nicknames, reviews and
 * reports on them. Shared by the server functions
 * (src/lib/community-actions.ts) and the forms, which show the same
 * limits.
 */

export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 24;
export const REVIEW_MAX = 500;

/** Posting limits per member, over the last 24 hours. */
export const REVIEWS_PER_DAY = 20;
export const REPORTS_PER_DAY = 20;

/** Names that would pass a member off as the site or its staff. */
const RESERVED = ["admin", "administrator", "gayflix", "moderator", "mod", "staff", "support", "official"];

/** Letters (any language), digits, spaces, dots, dashes and underscores. */
const NICKNAME = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u;

/**
 * The nickname as it will be shown (spaces trimmed and collapsed), or
 * why it can't be used.
 */
export function checkNickname(value: unknown): { nickname: string } | { error: string } {
  if (typeof value !== "string") return { error: "Choose a nickname." };
  const nickname = value.normalize("NFC").trim().replace(/\s+/g, " ");
  if (nickname.length < NICKNAME_MIN || nickname.length > NICKNAME_MAX) {
    return { error: `Use ${NICKNAME_MIN} to ${NICKNAME_MAX} characters.` };
  }
  if (!NICKNAME.test(nickname)) {
    return { error: "Use letters, numbers, spaces, dots, dashes or underscores, starting with a letter or number." };
  }
  if (RESERVED.includes(nicknameKey(nickname).replace(/[ ._-]/g, ""))) {
    return { error: "That nickname is reserved. Choose another." };
  }
  return { nickname };
}

/** What makes two nicknames the same: case doesn't count. */
export function nicknameKey(nickname: string): string {
  return nickname.toLowerCase();
}

/**
 * A review as it will be saved: control characters removed, at most two
 * line breaks in a row, spaces trimmed. Null if it's empty or too long.
 */
export function cleanReviewBody(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const body = value
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (body.length === 0 || body.length > REVIEW_MAX) return null;
  return body;
}

/** Why a member reports a review or a list. */
export const REPORT_REASONS = {
  spoilers: "Spoilers",
  hateful: "Hateful or harassing",
  spam: "Spam or advertising",
  sexual: "Sexual or graphic content",
  other: "Something else",
} as const;

export type ReportReason = keyof typeof REPORT_REASONS;

export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === "string" && Object.hasOwn(REPORT_REASONS, value);
}
