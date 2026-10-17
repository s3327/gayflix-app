import { describe, expect, it } from "vitest";
import { escapeCsv, toCsvRow } from "./csv";

describe("csv utilities & formula injection prevention", () => {
  it("escapes null, undefined, dates, and arrays", () => {
    expect(escapeCsv(null)).toBe("");
    expect(escapeCsv(undefined)).toBe("");
    const d = new Date("2026-01-01T00:00:00.000Z");
    expect(escapeCsv(d)).toBe("2026-01-01T00:00:00.000Z");
    expect(escapeCsv(["action", "romance"])).toBe('"action, romance"');
  });

  it("quotes strings containing comma, quotes, or newlines", () => {
    expect(escapeCsv("hello, world")).toBe('"hello, world"');
    expect(escapeCsv('he said "hello"')).toBe('"he said ""hello"""');
    expect(escapeCsv("line1\nline2")).toBe('"line1\nline2"');
  });

  it("neutralizes formula injection characters (=, +, -, @, tab, cr)", () => {
    expect(escapeCsv("=SUM(A1:A10)")).toBe("'=SUM(A1:A10)");
    expect(escapeCsv("+12345")).toBe("'+12345");
    expect(escapeCsv("-500")).toBe("'-500");
    expect(escapeCsv("@malicious")).toBe("'@malicious");
    expect(escapeCsv("\tcmd")).toBe("'\tcmd");
    expect(escapeCsv("\rcmd")).toBe('"\'\rcmd"');
  });

  it("formats full CSV rows", () => {
    const row = toCsvRow(["123", "Pride & Prejudice", 2005, ["Romance", "Drama"]]);
    expect(row).toBe('123,Pride & Prejudice,2005,"Romance, Drama"');
  });
});
