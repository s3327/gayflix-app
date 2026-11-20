import { sql, type Transaction } from "kysely";
import { describe, expect, it } from "vitest";
import { hasPasswordSignIn, profileRole, readAuthProfile } from "@/lib/auth-profile";
import type { DB } from "@/lib/db-types";
import { withRollback } from "@/test/database";

const USER = "a1111111-1111-4111-8111-111111111111";
const SESSION = "b2222222-2222-4222-8222-222222222222";
const OTHER_SESSION = "c3333333-3333-4333-8333-333333333333";

/**
 * An account with a live session, a profile and a verified TOTP factor,
 * written straight into Supabase Auth's tables (rolled back afterwards).
 * The insert into auth.users creates the profile (role 'user').
 */
async function seed(trx: Transaction<DB>, role = "admin") {
  await sql`INSERT INTO auth.users (id, email) VALUES (${USER}::uuid, 'probe@gayflix.test')`.execute(trx);
  await sql`UPDATE public.profile SET role = ${role} WHERE id = ${USER}::uuid`.execute(trx);
  await sql`INSERT INTO auth.sessions (id, user_id) VALUES (${SESSION}::uuid, ${USER}::uuid)`.execute(trx);
  await sql`
    INSERT INTO auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
    VALUES (gen_random_uuid(), ${USER}::uuid, 'totp', 'verified', now(), now())
  `.execute(trx);
}

describe("readAuthProfile", () => {
  it("reads the role and two-factor of a live session", async () => {
    await withRollback(async (trx) => {
      await seed(trx);
      expect(await readAuthProfile(USER, SESSION, trx)).toEqual({ role: "admin", hasVerifiedTotp: true });
    });
  });

  it("follows a role change at once", async () => {
    await withRollback(async (trx) => {
      await seed(trx);
      await sql`UPDATE public.profile SET role = 'user' WHERE id = ${USER}::uuid`.execute(trx);
      expect((await readAuthProfile(USER, SESSION, trx))?.role).toBe("user");
    });
  });

  it("is null once the session is revoked (its row deleted)", async () => {
    await withRollback(async (trx) => {
      await seed(trx);
      await sql`DELETE FROM auth.sessions WHERE id = ${SESSION}::uuid`.execute(trx);
      expect(await readAuthProfile(USER, SESSION, trx)).toBeNull();
    });
  });

  it("is null for a session past its not_after", async () => {
    await withRollback(async (trx) => {
      await seed(trx);
      await sql`UPDATE auth.sessions SET not_after = now() - interval '1 minute' WHERE id = ${SESSION}::uuid`.execute(trx);
      expect(await readAuthProfile(USER, SESSION, trx)).toBeNull();
    });
  });

  it("is null for another user's session id", async () => {
    await withRollback(async (trx) => {
      await seed(trx);
      await sql`INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'other@gayflix.test')`.execute(trx);
      await sql`
        INSERT INTO auth.sessions (id, user_id)
        SELECT ${OTHER_SESSION}::uuid, id FROM auth.users WHERE email = 'other@gayflix.test'
      `.execute(trx);
      expect(await readAuthProfile(USER, OTHER_SESSION, trx)).toBeNull();
    });
  });

  it("is null for a banned account, and back once the ban has passed", async () => {
    await withRollback(async (trx) => {
      await seed(trx);
      await sql`UPDATE auth.users SET banned_until = now() + interval '1 day' WHERE id = ${USER}::uuid`.execute(trx);
      expect(await readAuthProfile(USER, SESSION, trx)).toBeNull();
      await sql`UPDATE auth.users SET banned_until = now() - interval '1 day' WHERE id = ${USER}::uuid`.execute(trx);
      expect(await readAuthProfile(USER, SESSION, trx)).not.toBeNull();
    });
  });

  it("says when there's no verified TOTP factor", async () => {
    await withRollback(async (trx) => {
      await seed(trx);
      await sql`UPDATE auth.mfa_factors SET status = 'unverified' WHERE user_id = ${USER}::uuid`.execute(trx);
      expect((await readAuthProfile(USER, SESSION, trx))?.hasVerifiedTotp).toBe(false);
    });
  });
});

describe("profileRole", () => {
  it("is the profile's role, or null without a profile", async () => {
    await withRollback(async (trx) => {
      await seed(trx, "moderator");
      expect(await profileRole(USER, trx)).toBe("moderator");
      expect(await profileRole(OTHER_SESSION, trx)).toBeNull();
      expect(await profileRole("not-a-uuid", trx)).toBeNull();
    });
  });
});

describe("hasPasswordSignIn", () => {
  it("is true only with an email identity (a Google-only account has none)", async () => {
    await withRollback(async (trx) => {
      await seed(trx);
      const identity = (provider: string) => sql`
        INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
        VALUES (${USER}, ${USER}::uuid, '{}'::jsonb, ${provider}, now(), now())
      `;
      await identity("google").execute(trx);
      expect(await hasPasswordSignIn(USER, trx)).toBe(false);
      await identity("email").execute(trx);
      expect(await hasPasswordSignIn(USER, trx)).toBe(true);
    });
  });
});
