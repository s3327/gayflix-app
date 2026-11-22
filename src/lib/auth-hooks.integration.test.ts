import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sql } from "kysely";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { database } from "@/lib/database";
import { withRollback } from "@/test/database";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseConfig } from "@/lib/supabase/config";
import { totp } from "@/test/totp";

/**
 * The profile trigger and the Auth hooks (supabase/migrations/
 * 20261122000000_supabase_auth.sql and 20261123000000_two_factor.sql), exercised through the local stack's
 * Auth API. Auth commits its own writes, so nothing here can roll back:
 * each test uses a throwaway email, and the users it creates are deleted
 * afterwards (their profiles go with them). Needs the Auth API's env as
 * well as TEST_DATABASE_URL (CI exports both from `supabase status`).
 */
const hasAuthApi = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY && process.env.SUPABASE_SECRET_KEY
);

const PASSWORD = "hook-test-password-1";
const CLOSED_MESSAGE = "Public registration is currently closed.";

function throwawayEmail() {
  return `auth-hooks-${randomUUID()}@gayflix.test`;
}

/** A client like the site's: publishable key, no stored session. */
function publicClient(): SupabaseClient {
  const { url, publishableKey } = supabaseConfig();
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function jwtClaims(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
}

describe.skipIf(!hasAuthApi)("Supabase Auth hooks", () => {
  const created: string[] = [];
  let registrationOpen: boolean | undefined;

  async function createConfirmedUser() {
    const email = throwawayEmail();
    const { data, error } = await supabaseAdmin().auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    created.push(data.user.id);
    return { id: data.user.id, email };
  }

  async function signIn(email: string) {
    const client = publicClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (error) throw error;
    return { client, session: data.session };
  }

  /** Turns on TOTP for the signed-in client's account; returns the factor and its key. */
  async function enrollTotp(client: SupabaseClient) {
    const { data, error } = await client.auth.mfa.enroll({ factorType: "totp", issuer: "Gayflix" });
    if (error) throw error;
    const verified = await client.auth.mfa.challengeAndVerify({ factorId: data.id, code: totp(data.totp.secret) });
    if (verified.error) throw verified.error;
    return { factorId: data.id, secret: data.totp.secret, session: verified.data };
  }

  async function setRegistrationOpen(open: boolean) {
    await sql`
      UPDATE public.site_setting SET "registrationOpen" = ${open} WHERE id = 'default'
    `.execute(database);
  }

  beforeAll(async () => {
    const { rows } = await sql<{ registrationOpen: boolean }>`
      SELECT "registrationOpen" FROM public.site_setting WHERE id = 'default'
    `.execute(database);
    registrationOpen = rows[0]?.registrationOpen;
  });

  afterEach(async () => {
    if (registrationOpen !== undefined) await setRegistrationOpen(registrationOpen);
    const admin = supabaseAdmin();
    for (const id of created.splice(0)) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw error;
    }
  });

  afterAll(async () => {
    // Belt and braces: anything a failed test left behind.
    await sql`DELETE FROM auth.users WHERE email LIKE 'auth-hooks-%@gayflix.test'`.execute(database);
  });

  it("gives a user created through the admin API a profile with role 'user'", async () => {
    const { id } = await createConfirmedUser();
    const { rows } = await sql<{ role: string }>`SELECT role FROM public.profile WHERE id = ${id}::uuid`.execute(
      database
    );
    expect(rows).toEqual([{ role: "user" }]);
  });

  it("puts the profile's role in the access token as user_role, and follows a change on refresh", async () => {
    const { id, email } = await createConfirmedUser();
    const { client, session } = await signIn(email);
    expect(jwtClaims(session.access_token).user_role).toBe("user");

    await sql`UPDATE public.profile SET role = 'admin' WHERE id = ${id}::uuid`.execute(database);
    const { data, error } = await client.auth.refreshSession({ refresh_token: session.refresh_token });
    if (error) throw error;
    expect(jwtClaims(data.session!.access_token).user_role).toBe("admin");
  });

  it("refuses sign-up with 403 while registration is closed", async () => {
    expect(registrationOpen).toBeDefined();
    await setRegistrationOpen(false);
    const { data, error } = await publicClient().auth.signUp({ email: throwawayEmail(), password: PASSWORD });
    if (data.user) created.push(data.user.id);
    expect(error?.status).toBe(403);
    expect(error?.message).toBe(CLOSED_MESSAGE);
  });

  it("keeps no IP address on the session (D3)", async () => {
    const { id, email } = await createConfirmedUser();
    const { client, session } = await signIn(email);
    await client.auth.refreshSession({ refresh_token: session.refresh_token });
    const { rows } = await sql<{ ip: string | null }>`
      SELECT ip::text AS ip FROM auth.sessions WHERE user_id = ${id}::uuid
    `.execute(database);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.ip === null)).toBe(true);
  });

  it("says in the token whether the account has two-factor (has_totp), keeping user_role", async () => {
    const { email } = await createConfirmedUser();
    const { client, session } = await signIn(email);
    expect(jwtClaims(session.access_token)).toMatchObject({ has_totp: false, user_role: "user", aal: "aal1" });

    await enrollTotp(client);
    const { data, error } = await client.auth.refreshSession();
    if (error) throw error;
    expect(jwtClaims(data.session!.access_token)).toMatchObject({ has_totp: true, user_role: "user", aal: "aal2" });

    // A new password-only sign-in is the pending (aal1) kind getSession refuses.
    const second = await signIn(email);
    expect(jwtClaims(second.session.access_token)).toMatchObject({ has_totp: true, aal: "aal1" });
  });

  it("drops has_totp once the factor is removed and the session refreshed", async () => {
    const { email } = await createConfirmedUser();
    const { client } = await signIn(email);
    const { factorId } = await enrollTotp(client);
    const { error } = await client.auth.mfa.unenroll({ factorId });
    if (error) throw error;
    const refreshed = await client.auth.refreshSession();
    if (refreshed.error) throw refreshed.error;
    expect(jwtClaims(refreshed.data.session!.access_token)).toMatchObject({ has_totp: false });
  });

  // Why resetPassword (src/lib/auth-actions.ts) sets the new password with
  // the admin API: the session the emailed recovery code makes is aal1,
  // and Auth won't change the password of an account with two-factor
  // from an aal1 session.
  it("refuses a recovery-code session's password change on an account with two-factor; the admin API sets it", async () => {
    const { id, email } = await createConfirmedUser();
    await enrollTotp((await signIn(email)).client);
    const { data: link, error: linkError } = await supabaseAdmin().auth.admin.generateLink({ type: "recovery", email });
    if (linkError) throw linkError;
    const client = publicClient();
    const verified = await client.auth.verifyOtp({ email, token: link.properties.email_otp, type: "recovery" });
    if (verified.error) throw verified.error;
    expect(verified.data.user?.id).toBe(id);
    expect(jwtClaims(verified.data.session!.access_token)).toMatchObject({ aal: "aal1", has_totp: true });

    const refused = await client.auth.updateUser({ password: "a-brand-new-password-2" });
    expect(refused.error?.code).toBe("insufficient_aal");

    const { error } = await supabaseAdmin().auth.admin.updateUserById(id, { password: "a-brand-new-password-2" });
    expect(error).toBeNull();
    const again = await publicClient().auth.signInWithPassword({ email, password: "a-brand-new-password-2" });
    expect(again.error).toBeNull();
  });

  // Auth checks a code's request against the challenge's stored address,
  // so a challenge keeps it only until it's verified (the migration says why).
  it("keeps no IP address on a verified two-factor challenge, or on audit entries (D3)", async () => {
    const { id, email } = await createConfirmedUser();
    const { client } = await signIn(email);
    const { factorId, secret } = await enrollTotp(client);
    const second = await signIn(email);
    const verified = await second.client.auth.mfa.challengeAndVerify({ factorId, code: totp(secret) });
    if (verified.error) throw verified.error;

    const challenges = await sql<{ ip: string; verified: boolean }>`
      SELECT host(ip_address) AS ip, verified_at IS NOT NULL AS verified
      FROM auth.mfa_challenges WHERE factor_id = ${factorId}::uuid
    `.execute(database);
    expect(challenges.rows).toHaveLength(2);
    expect(challenges.rows).toEqual([
      { ip: "0.0.0.0", verified: true },
      { ip: "0.0.0.0", verified: true },
    ]);

    // Whatever Auth writes to its audit log for this account (it may be
    // switched off) has no address either.
    const audit = await sql<{ ip: string }>`
      SELECT ip_address AS ip FROM auth.audit_log_entries
      WHERE payload->>'actor_id' = ${id} OR payload->'traits'->>'user_id' = ${id}
    `.execute(database);
    expect(audit.rows.every((row) => row.ip === "")).toBe(true);
    // And a row written straight to the table gets the placeholder too.
    await withRollback(async (trx) => {
      const { rows } = await sql<{ ip: string }>`
        INSERT INTO auth.audit_log_entries (id, payload, created_at, ip_address)
        VALUES (gen_random_uuid(), '{}'::json, now(), '203.0.113.7') RETURNING ip_address AS ip
      `.execute(trx);
      expect(rows).toEqual([{ ip: "" }]);
    });
  });

  // Only Auth may call the hooks; nobody may call the trigger functions
  // directly (triggers fire without an EXECUTE check). `anon` covers PUBLIC.
  it("lets only Auth run the hooks, and nobody call the trigger functions", async () => {
    const hooks = ["public.custom_access_token_hook(jsonb)", "public.before_user_created_hook(jsonb)"];
    const { rows } = await sql<{ role: string; fn: string; allowed: boolean }>`
      SELECT r.role, f.fn, has_function_privilege(r.role, f.fn, 'EXECUTE') AS allowed
      FROM (VALUES ('anon'), ('authenticated'), ('service_role'), ('supabase_auth_admin')) AS r(role),
           (VALUES ('public.custom_access_token_hook(jsonb)'), ('public.before_user_created_hook(jsonb)'),
                   ('public.create_profile_for_new_user()'), ('public.forget_session_ip()'),
                   ('public.forget_mfa_challenge_ip()'), ('public.forget_audit_log_ip()')) AS f(fn)
    `.execute(database);
    expect(rows).toHaveLength(24);
    for (const row of rows) {
      const allowed = row.role === "supabase_auth_admin" && hooks.includes(row.fn);
      expect(row, `${row.role} on ${row.fn}`).toMatchObject({ allowed });
    }
  });
});
