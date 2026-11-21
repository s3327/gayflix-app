import { sql, type Transaction } from "kysely";
import { describe, expect, it } from "vitest";
import {
  accountCreatedAt,
  deleteAccountSession,
  hasPasswordSignIn,
  listAccountSessions,
  pendingEmailChange,
  profileRole,
  readAuthProfile,
  signInMethods,
} from "@/lib/auth-profile";
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

/** Another account with a live session (OTHER_SESSION). */
async function seedOtherAccount(trx: Transaction<DB>) {
  await sql`INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'other@gayflix.test')`.execute(trx);
  await sql`
    INSERT INTO auth.sessions (id, user_id, created_at, updated_at)
    SELECT ${OTHER_SESSION}::uuid, id, now(), now() FROM auth.users WHERE email = 'other@gayflix.test'
  `.execute(trx);
}

const sessionExists = async (trx: Transaction<DB>, id: string) =>
  (await sql<{ found: boolean }>`SELECT EXISTS (SELECT 1 FROM auth.sessions WHERE id = ${id}::uuid) AS found`.execute(trx))
    .rows[0].found;

describe("listAccountSessions", () => {
  it("lists the account's live sessions only, newest activity first, with their browsers", async () => {
    await withRollback(async (trx) => {
      await seed(trx);
      await seedOtherAccount(trx);
      await sql`
        UPDATE auth.sessions SET user_agent = 'Mozilla/5.0 (Windows NT 10.0) Chrome/141.0',
          created_at = now() - interval '2 days', updated_at = now() - interval '1 day'
        WHERE id = ${SESSION}::uuid
      `.execute(trx);
      const second = "d4444444-4444-4444-8444-444444444444";
      await sql`
        INSERT INTO auth.sessions (id, user_id, created_at, updated_at)
        VALUES (${second}::uuid, ${USER}::uuid, now() - interval '1 hour', now())
      `.execute(trx);
      // An ended session (past not_after) isn't listed.
      await sql`
        INSERT INTO auth.sessions (id, user_id, created_at, updated_at, not_after)
        VALUES (gen_random_uuid(), ${USER}::uuid, now(), now(), now() - interval '1 minute')
      `.execute(trx);

      const sessions = await listAccountSessions(USER, trx);
      expect(sessions.map((s) => s.id)).toEqual([second, SESSION]);
      expect(sessions[1].userAgent).toBe("Mozilla/5.0 (Windows NT 10.0) Chrome/141.0");
      expect(sessions[1].createdAt).toBeInstanceOf(Date);
      expect(+sessions[1].lastActiveAt).toBeGreaterThan(+sessions[1].createdAt);
      expect(await listAccountSessions("not-a-uuid", trx)).toEqual([]);
    });
  });
});

describe("deleteAccountSession", () => {
  it("deletes nothing given another user's session id", async () => {
    await withRollback(async (trx) => {
      await seed(trx);
      await seedOtherAccount(trx);
      expect(await deleteAccountSession(USER, OTHER_SESSION, trx)).toBe(0);
      expect(await sessionExists(trx, OTHER_SESSION)).toBe(true);
    });
  });

  it("deletes the account's own session, and its refresh tokens with it", async () => {
    await withRollback(async (trx) => {
      await seed(trx);
      await sql`
        INSERT INTO auth.refresh_tokens (token, user_id, session_id, revoked, created_at, updated_at)
        VALUES ('probe-refresh-token', ${USER}, ${SESSION}::uuid, false, now(), now())
      `.execute(trx);
      expect(await deleteAccountSession(USER, SESSION, trx)).toBe(1);
      expect(await sessionExists(trx, SESSION)).toBe(false);
      const { rows } = await sql<{ n: number }>`
        SELECT count(*)::int AS n FROM auth.refresh_tokens WHERE session_id = ${SESSION}::uuid
      `.execute(trx);
      expect(rows[0].n).toBe(0);
    });
  });

  it("deletes nothing given ids that aren't UUIDs", async () => {
    await withRollback(async (trx) => {
      await seed(trx);
      expect(await deleteAccountSession(USER, "' OR true --", trx)).toBe(0);
      expect(await deleteAccountSession("nope", SESSION, trx)).toBe(0);
      expect(await sessionExists(trx, SESSION)).toBe(true);
    });
  });
});

describe("signInMethods", () => {
  it("names the account's email and Google sign-ins", async () => {
    await withRollback(async (trx) => {
      await seed(trx);
      expect(await signInMethods(USER, trx)).toEqual([]);
      const identity = (provider: string) => sql`
        INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
        VALUES (${USER}, ${USER}::uuid, '{}'::jsonb, ${provider}, now(), now())
      `;
      await identity("google").execute(trx);
      expect(await signInMethods(USER, trx)).toEqual(["google"]);
      await identity("email").execute(trx);
      expect(await signInMethods(USER, trx)).toEqual(["email", "google"]);
    });
  });
});

describe("accountCreatedAt", () => {
  it("is when the account's profile was made, or null without one", async () => {
    await withRollback(async (trx) => {
      await seed(trx);
      expect(await accountCreatedAt(USER, trx)).toBeInstanceOf(Date);
      expect(await accountCreatedAt(OTHER_SESSION, trx)).toBeNull();
    });
  });
});

describe("pendingEmailChange", () => {
  it("says which address still owes its code, until both are in", async () => {
    await withRollback(async (trx) => {
      await seed(trx);
      expect(await pendingEmailChange(USER, trx)).toBeNull();
      await sql`
        UPDATE auth.users SET email_change = 'new@gayflix.test',
          email_change_token_current = 'hash-current', email_change_token_new = 'hash-new'
        WHERE id = ${USER}::uuid
      `.execute(trx);
      expect(await pendingEmailChange(USER, trx)).toEqual({
        newEmail: "new@gayflix.test",
        currentPending: true,
        newPending: true,
      });
      // Auth clears a token once its code is accepted.
      await sql`UPDATE auth.users SET email_change_token_new = '' WHERE id = ${USER}::uuid`.execute(trx);
      expect(await pendingEmailChange(USER, trx)).toMatchObject({ currentPending: true, newPending: false });
      await sql`UPDATE auth.users SET email_change_token_current = '' WHERE id = ${USER}::uuid`.execute(trx);
      expect(await pendingEmailChange(USER, trx)).toBeNull();
      expect(await pendingEmailChange("nope", trx)).toBeNull();
    });
  });
});
