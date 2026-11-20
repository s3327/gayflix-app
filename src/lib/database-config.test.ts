import { describe, expect, it } from "vitest";
import { postgresConfig } from "@/lib/database-config.mjs";

const POOLER =
  "postgresql://postgres.abcdefghijklmnop:secret@aws-1-us-east-1.pooler.supabase.com:6543/postgres";

describe("postgresConfig", () => {
  it("leaves a local database alone", () => {
    const url = "postgresql://gayflix:gayflix@localhost:5432/gayflix";
    expect(postgresConfig(url, undefined)).toEqual({ connectionString: url });
  });

  it("passes no connection string through", () => {
    expect(postgresConfig(undefined, undefined)).toEqual({ connectionString: undefined });
  });

  it("encrypts a Supabase connection, unverified without a CA", () => {
    expect(postgresConfig(POOLER, undefined)).toEqual({
      connectionString: POOLER,
      ssl: { rejectUnauthorized: false },
    });
  });

  it("verifies a Supabase connection against DATABASE_CA_CERT", () => {
    const config = postgresConfig(POOLER, "-----BEGIN CERTIFICATE-----\\nabc\\n-----END CERTIFICATE-----");
    expect(config.ssl).toEqual({
      ca: "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----",
      rejectUnauthorized: true,
    });
  });

  it("drops sslmode and pgbouncer from the URL, which would override the TLS settings", () => {
    const config = postgresConfig(`${POOLER}?sslmode=require&pgbouncer=true&application_name=gayflix`, "");
    expect(config.connectionString).toBe(`${POOLER}?application_name=gayflix`);
    expect(config.ssl).toEqual({ rejectUnauthorized: false });
  });

  it("treats the direct db.<ref>.supabase.co host as Supabase too", () => {
    const direct = "postgresql://postgres:secret@db.abcdefghijklmnop.supabase.co:5432/postgres";
    expect(postgresConfig(direct, undefined).ssl).toEqual({ rejectUnauthorized: false });
  });
});
