import { describe, expect, it } from "vitest";
import { postgresConfig } from "@/lib/database-config.mjs";

const POOLER =
  "postgresql://postgres.abcdefghijklmnop:secret@aws-1-us-east-1.pooler.supabase.com:6543/postgres";
const CA = "-----BEGIN CERTIFICATE-----\\nabc\\n-----END CERTIFICATE-----";
const CA_PEM = "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----";

describe("postgresConfig", () => {
  it("leaves a local database alone", () => {
    const url = "postgresql://gayflix:gayflix@localhost:5432/gayflix";
    expect(postgresConfig(url, undefined, {})).toEqual({ connectionString: url });
  });

  it("passes no connection string through", () => {
    expect(postgresConfig(undefined, undefined, {})).toEqual({ connectionString: undefined });
  });

  it("verifies a Supabase connection against DATABASE_CA_CERT", () => {
    expect(postgresConfig(POOLER, CA, {})).toEqual({
      connectionString: POOLER,
      ssl: { ca: CA_PEM, rejectUnauthorized: true },
    });
  });

  it("refuses a Supabase connection without a certificate", () => {
    expect(() => postgresConfig(POOLER, undefined, {})).toThrow(/DATABASE_CA_CERT is required/);
    expect(() => postgresConfig(POOLER, "   \n", {})).toThrow(/DATABASE_CA_CERT is required/);
  });

  it("connects unverified only with DATABASE_TLS_INSECURE=1, off Vercel", () => {
    expect(postgresConfig(POOLER, undefined, { DATABASE_TLS_INSECURE: "1" })).toEqual({
      connectionString: POOLER,
      ssl: { rejectUnauthorized: false },
    });
    for (const VERCEL_ENV of ["production", "preview", "development"]) {
      expect(() =>
        postgresConfig(POOLER, undefined, { DATABASE_TLS_INSECURE: "1", VERCEL_ENV })
      ).toThrow(/DATABASE_CA_CERT is required/);
    }
  });

  it("drops sslmode and pgbouncer from the URL, which would override the TLS settings", () => {
    const config = postgresConfig(`${POOLER}?sslmode=require&pgbouncer=true&application_name=gayflix`, CA, {});
    expect(config.connectionString).toBe(`${POOLER}?application_name=gayflix`);
    expect(config.ssl?.rejectUnauthorized).toBe(true);
  });

  it("treats the direct db.<ref>.supabase.co host as Supabase too", () => {
    const direct = "postgresql://postgres:secret@db.abcdefghijklmnop.supabase.co:5432/postgres";
    expect(() => postgresConfig(direct, undefined, {})).toThrow(/DATABASE_CA_CERT is required/);
  });
});
