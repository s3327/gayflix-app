/**
 * Stand-in for the admin "NEW badge" setting (Setting → Site tab).
 * There's no database/persistence yet, so this is a static value the
 * public New Releases page reads — the admin tab's toggle/dropdown
 * control their own local UI state and don't actually write back here.
 * Once real settings storage exists, this file goes away and both sides
 * read from the same source instead of just agreeing on defaults.
 */
export const newBadgeConfig = {
  enabled: true,
  periodDays: 7,
};
