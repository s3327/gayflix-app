import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import { deleteAllAccountSessions } from "@/lib/auth-profile";
import { database } from "@/lib/database";
import type { DB } from "@/lib/db-types";
import {
  changeRole,
  countAccounts,
  findAccountByEmail,
  readUserTarget,
  searchUsers,
  setBanReason,
} from "@/lib/user-admin-store";
import { withRollback } from "@/test/database";

/**
 * An account written straight into Supabase Auth's tables; the insert
 * into auth.users creates its profile (role 'user'), then it gets `role`.
 */
async function account(
  executor: Kysely<DB>,
  { email, role = "user", name = null, confirmed = true }: { email: string; role?: string; name?: string | null; confirmed?: boolean }
) {
  const id = randomUUID();
  await sql`
    INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at, created_at)
    VALUES (${id}::uuid, ${email}, ${JSON.stringify(name ? { name } : {})}::jsonb,
            ${confirmed ? new Date() : null}::timestamptz, now())
  `.execute(executor);
  await sql`UPDATE public.profile SET role = ${role} WHERE id = ${id}::uuid`.execute(executor);
  return id;
}

async function roleOf(executor: Kysely<DB>, id: string) {
  const row = await executor.selectFrom("profile").select("role").where("id", "=", id).executeTakeFirstOrThrow();
  return row.role;
}

describe("searchUsers", () => {
  it("matches email or name, with % _ and \\ matching themselves", async () => {
    await withRollback(async (trx) => {
      const tag = randomUUID().slice(0, 8);
      const underscore = await account(trx, { email: `a_b.${tag}@probe.test` });
      await account(trx, { email: `axb.${tag}@probe.test` });
      const percent = await account(trx, { email: `p.${tag}@probe.test`, name: `100% ${tag}` });
      await account(trx, { email: `q.${tag}@probe.test`, name: `1000 ${tag}` });
      const backslash = await account(trx, { email: `s.${tag}@probe.test`, name: `back\\slash ${tag}` });

      const ids = async (search: string) =>
        (await searchUsers({ search, filter: "all", limit: 10 }, trx)).items.map((user) => user.id);
      expect(await ids(`a_b.${tag}`)).toEqual([underscore]);
      expect(await ids(`100% ${tag}`)).toEqual([percent]);
      expect(await ids(`k\\s`)).toEqual([backslash]);
      expect(await ids(`A_B.${tag.toUpperCase()}`)).toEqual([underscore]);
    });
  });

  it("filters, counts, caps and reads each account", async () => {
    await withRollback(async (trx) => {
      const tag = randomUUID().slice(0, 8);
      const admin = await account(trx, { email: `admin.${tag}@probe.test`, role: "admin", name: "Ada" });
      const unconfirmed = await account(trx, { email: `new.${tag}@probe.test`, confirmed: false });
      const banned = await account(trx, { email: `banned.${tag}@probe.test` });
      await sql`UPDATE auth.users SET banned_until = now() + interval '7 days' WHERE id = ${banned}::uuid`.execute(trx);
      const search = tag;

      const page = await searchUsers({ search, filter: "all", limit: 2 }, trx);
      expect(page.total).toBe(3);
      expect(page.items).toHaveLength(2);
      expect((await searchUsers({ search, filter: "admins", limit: 10 }, trx)).items.map((u) => u.id)).toEqual([admin]);
      expect((await searchUsers({ search, filter: "banned", limit: 10 }, trx)).items.map((u) => u.id)).toEqual([banned]);
      expect((await searchUsers({ search, filter: "unconfirmed", limit: 10 }, trx)).items.map((u) => u.id)).toEqual([
        unconfirmed,
      ]);

      expect(await readUserTarget(admin, trx)).toMatchObject({
        id: admin,
        email: `admin.${tag}@probe.test`,
        name: "Ada",
        role: "admin",
        emailVerified: true,
        banned: false,
        banReason: null,
      });
      const bannedUser = await readUserTarget(banned, trx);
      expect(bannedUser?.banned).toBe(true);
      expect(bannedUser?.banExpires).toBeInstanceOf(Date);
      expect((await readUserTarget(unconfirmed, trx))?.emailVerified).toBe(false);
      expect(await readUserTarget(randomUUID(), trx)).toBeNull();
      expect(await findAccountByEmail(`ADMIN.${tag}@probe.test`, trx)).toBe(admin);
    });
  });

  it("keeps a ban reason on the profile", async () => {
    await withRollback(async (trx) => {
      const id = await account(trx, { email: `r.${randomUUID()}@probe.test` });
      await setBanReason(id, "Spam", trx);
      expect((await readUserTarget(id, trx))?.banReason).toBe("Spam");
      await setBanReason(id, null, trx);
      expect((await readUserTarget(id, trx))?.banReason).toBeNull();
    });
  });

  it("counts accounts, and those that joined since a date", async () => {
    await withRollback(async (trx) => {
      const before = await countAccounts(undefined, trx);
      await account(trx, { email: `c.${randomUUID()}@probe.test` });
      expect(await countAccounts(undefined, trx)).toBe(before + 1);
      expect(await countAccounts(new Date(Date.now() + 60_000), trx)).toBe(0);
    });
  });
});

describe("deleteAllAccountSessions", () => {
  it("deletes every session of that account only, and their refresh tokens", async () => {
    await withRollback(async (trx) => {
      const id = await account(trx, { email: `s.${randomUUID()}@probe.test` });
      const other = await account(trx, { email: `o.${randomUUID()}@probe.test` });
      for (const userId of [id, id, other]) {
        const sessionId = randomUUID();
        await sql`INSERT INTO auth.sessions (id, user_id) VALUES (${sessionId}::uuid, ${userId}::uuid)`.execute(trx);
        await sql`
          INSERT INTO auth.refresh_tokens (token, user_id, session_id, revoked)
          VALUES (${randomUUID()}, ${userId}, ${sessionId}::uuid, false)
        `.execute(trx);
      }
      expect(await deleteAllAccountSessions(id, trx)).toBe(2);
      const { rows } = await sql<{ sessions: string; tokens: string }>`
        SELECT (SELECT count(*) FROM auth.sessions WHERE user_id = ${id}::uuid) AS sessions,
               (SELECT count(*) FROM auth.refresh_tokens WHERE user_id = ${id}) AS tokens
      `.execute(trx);
      expect(rows[0]).toEqual({ sessions: "0", tokens: "0" });
      const { rows: others } = await sql<{ n: string }>`
        SELECT count(*) AS n FROM auth.sessions WHERE user_id = ${other}::uuid
      `.execute(trx);
      expect(others[0].n).toBe("1");
    });
  });
});

describe("changeRole", () => {
  it("changes a role by the rules, judged by the roles in the database", async () => {
    await withRollback(async (trx) => {
      const owner = await account(trx, { email: `owner.${randomUUID()}@probe.test`, role: "owner" });
      const admin = await account(trx, { email: `admin.${randomUUID()}@probe.test`, role: "admin" });
      const member = await account(trx, { email: `m.${randomUUID()}@probe.test` });
      const unconfirmed = await account(trx, { email: `u.${randomUUID()}@probe.test`, confirmed: false });

      expect(await changeRole({ actorId: admin, targetId: member, newRole: "editor" }, trx)).toEqual({
        ok: true,
        previousRole: "user",
      });
      expect(await roleOf(trx, member)).toBe("editor");
      expect(await changeRole({ actorId: admin, targetId: owner, newRole: "user" }, trx)).toEqual({
        ok: false,
        problem: "Only the Owner can change the Owner account.",
      });
      expect(await changeRole({ actorId: admin, targetId: admin, newRole: "user" }, trx)).toMatchObject({ ok: false });
      expect(await changeRole({ actorId: admin, targetId: unconfirmed, newRole: "moderator" }, trx)).toEqual({
        ok: false,
        problem: "This account hasn't confirmed its email yet, so it can't sign in.",
      });
      expect(
        await changeRole({ actorId: admin, targetId: member, newRole: "admin", action: "remove-admin" }, trx)
      ).toEqual({ ok: false, problem: "This account isn't an admin." });

      // A moderator (per the database, whatever their session says) can't.
      await sql`UPDATE public.profile SET role = 'moderator' WHERE id = ${admin}::uuid`.execute(trx);
      expect(await changeRole({ actorId: admin, targetId: member, newRole: "user" }, trx)).toEqual({
        ok: false,
        problem: "Only an Owner or an Admin can change roles.",
      });
      expect(await roleOf(trx, member)).toBe("editor");
    });
  });

  it("an admin demoted first can't then demote the one who did it", async () => {
    await withRollback(async (trx) => {
      const a = await account(trx, { email: `a.${randomUUID()}@probe.test`, role: "admin" });
      const b = await account(trx, { email: `b.${randomUUID()}@probe.test`, role: "admin" });
      expect(await changeRole({ actorId: a, targetId: b, newRole: "user", action: "remove-admin" }, trx)).toMatchObject({
        ok: true,
      });
      expect(await changeRole({ actorId: b, targetId: a, newRole: "user", action: "remove-admin" }, trx)).toEqual({
        ok: false,
        problem: "Only an Owner or an Admin can change roles.",
      });
      expect(await roleOf(trx, a)).toBe("admin");
    });
  });

  it("two admins demoting each other at once: exactly one wins, and an admin is left", async () => {
    // Real transactions on separate connections, so this commits; the
    // accounts are deleted afterwards.
    const tag = randomUUID();
    const a = await account(database, { email: `race-a.${tag}@probe.test`, role: "admin" });
    const b = await account(database, { email: `race-b.${tag}@probe.test`, role: "admin" });
    try {
      let results: Awaited<ReturnType<typeof changeRole>>[] = [];
      // Hold a's profile row so both changes start and wait on the lock,
      // then let them race for it.
      let race: Promise<typeof results> | undefined;
      await database.transaction().execute(async (hold) => {
        await sql`SELECT 1 FROM public.profile WHERE id = ${a}::uuid FOR UPDATE`.execute(hold);
        race = Promise.all([
          changeRole({ actorId: a, targetId: b, newRole: "user", action: "remove-admin" }),
          changeRole({ actorId: b, targetId: a, newRole: "user", action: "remove-admin" }),
        ]);
        await new Promise((resolve) => setTimeout(resolve, 500));
      });
      results = await race!;
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.find((result) => !result.ok)).toEqual({
        ok: false,
        problem: "Only an Owner or an Admin can change roles.",
      });
      const roles = [await roleOf(database, a), await roleOf(database, b)].sort();
      expect(roles).toEqual(["admin", "user"]);
    } finally {
      await sql`DELETE FROM auth.users WHERE id IN (${a}::uuid, ${b}::uuid)`.execute(database);
    }
  });
});
