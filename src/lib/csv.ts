/**
 * Escapes a cell value for CSV output, guarding against CSV formula injection (CSV Injection / DDE attacks).
 * If a cell string starts with `=`, `+`, `-`, `@`, `\t`, or `\r`, it is prepended with a single quote `'`.
 */
export function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (val instanceof Date) return val.toISOString();
  if (Array.isArray(val)) {
    return escapeCsv(val.join(", "));
  }

  let str = String(val);

  // CSV Formula Injection mitigation:
  // If the cell begins with =, +, -, @, tab, or carriage return, prepend a single quote (')
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/** Formats an array of column values into a comma-separated CSV row. */
export function toCsvRow(cols: unknown[]): string {
  return cols.map(escapeCsv).join(",");
}
