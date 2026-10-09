import { newBadgeConfig } from "@/lib/new-badge-config";

/** Whether a title's createdAt falls within the configured NEW-badge period. */
export function isRecentlyAdded(createdAt: string | undefined): boolean {
  if (!createdAt || !newBadgeConfig.enabled) return false;
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const periodMs = newBadgeConfig.periodDays * 24 * 60 * 60 * 1000;
  return ageMs <= periodMs;
}
