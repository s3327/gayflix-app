import { sql } from "kysely";
import { afterEach, describe, expect, it, vi } from "vitest";
import { overLimit, resetLimit } from "@/lib/auth-rate-limit";
import { withRollback } from "@/test/database";

const LIMIT = { name: "test-limit", max: 3, windowSeconds: 900 };
const IP = "203.0.113.7";

afterEach(() => vi.unstubAllEnvs());

describe("auth attempt limits (auth_rate_limit)", () => {
  it("allows `max` attempts in a window, then refuses", async () => {
    await withRollback(async (trx) => {
      const results = [];
      for (let i = 0; i < 4; i++) results.push(await overLimit(LIMIT, [IP, "a@example.com"], trx));
      expect(results).toEqual([false, false, false, true]);
      // Another key has its own count.
      expect(await overLimit(LIMIT, [IP, "b@example.com"], trx)).toBe(false);
    });
  });

  it("starts a new window once the old one has ended", async () => {
    await withRollback(async (trx) => {
      for (let i = 0; i < 4; i++) await overLimit(LIMIT, [IP], trx);
      await sql`UPDATE public.auth_rate_limit SET "windowStart" = now() - interval '16 minutes'`.execute(trx);
      expect(await overLimit(LIMIT, [IP], trx)).toBe(false);
      const { rows } = await sql<{ count: number }>`SELECT count FROM public.auth_rate_limit`.execute(trx);
      expect(rows).toEqual([{ count: 1 }]);
    });
  });

  it("starts afresh after resetLimit", async () => {
    await withRollback(async (trx) => {
      for (let i = 0; i < 4; i++) await overLimit(LIMIT, ["signup", "a@example.com"], trx);
      await resetLimit(LIMIT, ["signup", "a@example.com"], trx);
      expect(await overLimit(LIMIT, ["signup", "a@example.com"], trx)).toBe(false);
    });
  });

  it("stores neither the IP address nor the email", async () => {
    await withRollback(async (trx) => {
      await overLimit(LIMIT, [IP, "a@example.com"], trx);
      const { rows } = await sql<{ key: string }>`SELECT key FROM public.auth_rate_limit`.execute(trx);
      expect(rows).toHaveLength(1);
      expect(rows[0].key).toMatch(/^test-limit:[0-9a-f]{64}$/);
      expect(rows[0].key).not.toContain(IP);
      expect(rows[0].key).not.toContain("example.com");
    });
  });

  it("is off with AUTH_RATE_LIMIT=off", async () => {
    vi.stubEnv("AUTH_RATE_LIMIT", "off");
    await withRollback(async (trx) => {
      for (let i = 0; i < 10; i++) expect(await overLimit(LIMIT, [IP], trx)).toBe(false);
      const { rows } = await sql`SELECT key FROM public.auth_rate_limit`.execute(trx);
      expect(rows).toEqual([]);
    });
  });
});
