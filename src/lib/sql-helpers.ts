/**
 * Postgres returns count(*) as a bigint, which node-postgres hands over as
 * a string. This turns it into a plain number.
 */
export function countOf(row: { count: string | number | bigint }): number {
  return Number(row.count);
}
