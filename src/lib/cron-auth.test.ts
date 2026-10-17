import { describe, expect, it } from "vitest";
import { isAuthorizedCron } from "./cron-auth";

describe("cron-auth", () => {
  const SECRET = "secret-token-xyz-123";

  it("authorizes valid Bearer token", () => {
    expect(isAuthorizedCron(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("rejects invalid Bearer token", () => {
    expect(isAuthorizedCron("Bearer wrong-token", SECRET)).toBe(false);
    expect(isAuthorizedCron("Bearer secret-token-xyz-124", SECRET)).toBe(false);
  });

  it("rejects missing, empty, or mismatched schemes", () => {
    expect(isAuthorizedCron(null, SECRET)).toBe(false);
    expect(isAuthorizedCron(undefined, SECRET)).toBe(false);
    expect(isAuthorizedCron("", SECRET)).toBe(false);
    expect(isAuthorizedCron(`Basic ${SECRET}`, SECRET)).toBe(false);
    expect(isAuthorizedCron(SECRET, SECRET)).toBe(false);
    expect(isAuthorizedCron(`Bearer ${SECRET}`, "")).toBe(false);
    expect(isAuthorizedCron(`Bearer ${SECRET}`, undefined)).toBe(false);
  });
});
