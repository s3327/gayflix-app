import { isMediaId } from "@/lib/library-types";
import { slugify } from "@/lib/title-form";

/*
 * The admin Collections form's fields (src/lib/admin-collection-actions.ts):
 * what each may hold, and when a collection is showing.
 */

export const COLLECTION_TITLE_MAX = 80;
export const COLLECTION_DESCRIPTION_MAX = 600;
/** Generous, so one collection can't fill a page forever. */
export const MAX_COLLECTION_ITEMS = 200;

export const COLLECTION_FIELDS = ["id", "title", "description", "startsAt", "endsAt"] as const;

export type CollectionData = {
  title: string;
  description: string;
  published: boolean;
  onHome: boolean;
  /** UTC days, or null for no limit. */
  startsAt: Date | null;
  endsAt: Date | null;
};

type Parsed<T> = { ok: true; data: T } | { ok: false; errors: Record<string, string> };

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-06-01" as that UTC day, or null if it isn't a real date. */
function parseDay(value: string): Date | null {
  const match = DAY.exec(value);
  if (!match) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

/** The fields every save has. Checkboxes count as on when present. */
export function parseCollection(values: Record<string, string>, form: { has(name: string): boolean }): Parsed<CollectionData> {
  const errors: Record<string, string> = {};
  const title = (values.title ?? "").trim().replace(/\s+/g, " ");
  if (!title) errors.title = "Give the collection a title.";
  else if (title.length > COLLECTION_TITLE_MAX) errors.title = `Keep it to ${COLLECTION_TITLE_MAX} characters.`;

  const description = (values.description ?? "").trim();
  if (description.length > COLLECTION_DESCRIPTION_MAX) {
    errors.description = `Keep it to ${COLLECTION_DESCRIPTION_MAX} characters.`;
  }

  const startsText = (values.startsAt ?? "").trim();
  const endsText = (values.endsAt ?? "").trim();
  const startsAt = startsText ? parseDay(startsText) : null;
  const endsAt = endsText ? parseDay(endsText) : null;
  if (startsText && !startsAt) errors.startsAt = "Use a date like 2026-06-01.";
  if (endsText && !endsAt) errors.endsAt = "Use a date like 2026-06-30.";
  if (startsAt && endsAt && endsAt < startsAt) errors.endsAt = "End on or after the first day.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: {
      title,
      description,
      published: form.has("published"),
      onHome: form.has("onHome"),
      startsAt,
      endsAt,
    },
  };
}

/**
 * A new collection's address: the one typed, or one made from its title.
 * Null when neither gives a usable one.
 */
export function collectionSlug(typed: string, title: string): string | null {
  const slug = slugify(typed.trim() || title);
  return slug && isMediaId(slug) ? slug : null;
}

/** Whether a published collection is showing on `day`: within its dates, if it has any. */
export function isShowing(
  collection: { published: boolean; startsAt: Date | null; endsAt: Date | null },
  day = new Date()
): boolean {
  if (!collection.published) return false;
  const today = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  if (collection.startsAt && today < collection.startsAt) return false;
  if (collection.endsAt && today > collection.endsAt) return false;
  return true;
}

/** "2026-06-01" for a date field, or "". */
export function dayValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}
