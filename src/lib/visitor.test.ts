import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { keyedHash } from "@/lib/visitor";

const hmac = (secret: string, value: string) => createHmac("sha256", secret).update(value).digest("hex");

describe("keyedHash", () => {
  it("is keyed with HASH_SECRET", () => {
    expect(keyedHash("203.0.113.7", { HASH_SECRET: "new-secret", BETTER_AUTH_SECRET: "old-secret" })).toBe(
      hmac("new-secret", "203.0.113.7")
    );
  });

  it("falls back to BETTER_AUTH_SECRET while HASH_SECRET isn't set, so stored hashes keep matching", () => {
    expect(keyedHash("203.0.113.7", { BETTER_AUTH_SECRET: "old-secret" })).toBe(hmac("old-secret", "203.0.113.7"));
    expect(keyedHash("203.0.113.7", { HASH_SECRET: " ", BETTER_AUTH_SECRET: "old-secret" })).toBe(
      hmac("old-secret", "203.0.113.7")
    );
  });

  it("refuses to hash in production without a secret", () => {
    expect(() => keyedHash("203.0.113.7", { NODE_ENV: "production" })).toThrow("HASH_SECRET is not set");
  });

  it("uses a fixed key in development", () => {
    expect(keyedHash("x", { NODE_ENV: "development" })).toBe(hmac("dev-only-secret", "x"));
  });
});
