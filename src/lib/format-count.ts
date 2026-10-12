const full = new Intl.NumberFormat("en-US");
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/**
 * A count for a dashboard tile: in full up to 9,999, then shortened
 * (12.9K, 1.2M) so it still fits a tile on a phone.
 */
export function formatCount(count: number): string {
  return Math.abs(count) < 10_000 ? full.format(count) : compact.format(count);
}
