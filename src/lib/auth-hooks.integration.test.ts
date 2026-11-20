import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sql } from "kysely";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { database } from "@/lib/database";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseConfig } from "@/lib/supabase/config";

/**
 * The profile trigger and the Auth hooks (supabase/migrations/
 * 20261122000000_supabase_auth.sql), exercised through the local stack's
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

  // Only Auth may call the hooks; nobody may call the trigger functions
  // directly (triggers fire without an EXECUTE check). `anon` covers PUBLIC.
  it("lets only Auth run the hooks, and nobody call the trigger functions", async () => {
    const hooks = ["public.custom_access_token_hook(jsonb)", "public.before_user_created_hook(jsonb)"];
    const { rows } = await sql<{ role: string; fn: string; allowed: boolean }>`
      SELECT r.role, f.fn, has_function_privilege(r.role, f.fn, 'EXECUTE') AS allowed
      FROM (VALUES ('anon'), ('authenticated'), ('service_role'), ('supabase_auth_admin')) AS r(role),
           (VALUES ('public.custom_access_token_hook(jsonb)'), ('public.before_user_created_hook(jsonb)'),
                   ('public.create_profile_for_new_user()'), ('public.forget_session_ip()')) AS f(fn)
    `.execute(database);
    expect(rows).toHaveLength(16);
    for (const row of rows) {
      const allowed = row.role === "supabase_auth_admin" && hooks.includes(row.fn);
      expect(row, `${row.role} on ${row.fn}`).toMatchObject({ allowed });
    }
  });
});
