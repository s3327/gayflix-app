import { describe, expect, it, vi } from "vitest";
import { banDuration, maskEmail, moveAccounts, profileRole } from "./move-accounts-core.mjs";

const NOW = Date.parse("2026-11-21T00:00:00Z");

type Row = Record<string, unknown>;

/** A stand-in for the pg client: "user", account_move and profile in memory. */
function fakeDb(users: Row[], { moved = [] as Row[], hasMoveTable = true, hasProfile = true } = {}) {
  const state = { moveTable: hasMoveTable, accountMove: [...moved], profileRoles: new Map<string, string>() };
  const query = vi.fn(async (text: string, params: unknown[] = []) => {
    if (text.includes("to_regclass('public.account_move')")) return { rows: [{ t: state.moveTable ? "x" : null }] };
    if (text.includes("to_regclass('public.profile')")) return { rows: [{ t: hasProfile ? "x" : null }] };
    if (text.includes("CREATE TABLE IF NOT EXISTS public.account_move")) {
      state.moveTable = true;
      return { rows: [] };
    }
    if (text.includes('FROM public."user"')) return { rows: users };
    if (text.includes("SELECT old_id FROM public.account_move WHERE new_id")) {
      return { rows: state.accountMove.filter((row) => row.new_id === params[0]) };
    }
    if (text.includes("SELECT old_id FROM public.account_move")) {
      if (!state.moveTable) throw new Error("relation account_move does not exist");
      return { rows: state.accountMove };
    }
    if (text.includes("INSERT INTO public.account_move")) {
      const [old_id, new_id, role, banReason] = params;
      state.accountMove.push({ old_id, new_id, role, banReason });
      return { rows: [] };
    }
    if (text.includes("UPDATE public.profile")) {
      state.profileRoles.set(params[1] as string, params[0] as string);
      return { rows: [] };
    }
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text)) return { rows: [] };
    throw new Error(`unexpected query: ${text}`);
  });
  return { db: { query }, state };
}

function fakeAdmin(existing: Row[] = []) {
  let next = 1;
  const users = [...existing];
  return {
    users,
    createUser: vi.fn(async (attributes: Row) => {
      if (users.some((user) => user.email === attributes.email)) {
        return { data: { user: null }, error: { code: "email_exists", status: 422, message: "already registered" } };
      }
      const user = { id: `00000000-0000-4000-8000-00000000000${next++}`, ...attributes };
      users.push(user);
      return { data: { user }, error: null };
    }),
    listUsers: vi.fn(async () => ({ data: { users }, error: null })),
  };
}

const owner = {
  id: "betterAuthOwner1",
  name: "Owner",
  email: "owner@gayflix.example",
  emailVerified: true,
  role: "owner",
  banned: false,
  banReason: null,
  banExpires: null,
};
const member = { ...owner, id: "betterAuthMember1", name: "Member", email: "member@gayflix.example", role: "user" };

describe("maskEmail", () => {
  it("keeps the first letters and the top-level domain only", () => {
    expect(maskEmail("someone@example.com")).toBe("s***@e***.com");
    expect(maskEmail("a@b")).toBe("a***@b***");
  });
});

describe("profileRole", () => {
  it("keeps staff roles and makes everything else a member", () => {
    expect(profileRole("owner")).toBe("owner");
    expect(profileRole("user,Admin")).toBe("admin");
    expect(profileRole("moderator,editor")).toBe("editor");
    expect(profileRole("user")).toBe("user");
    expect(profileRole(null)).toBe("user");
    expect(profileRole("superuser")).toBe("user");
  });
});

describe("banDuration", () => {
  it("carries a ban over for the time it has left", () => {
    expect(banDuration({ banned: false }, NOW)).toBeUndefined();
    expect(banDuration({ banned: true, banExpires: null }, NOW)).toBe("876000h");
    expect(banDuration({ banned: true, banExpires: new Date(NOW + 90 * 60_000) }, NOW)).toBe("2h");
    expect(banDuration({ banned: true, banExpires: new Date(NOW - 1000) }, NOW)).toBeUndefined();
  });
});

describe("moveAccounts", () => {
  it("creates an Auth account per user and records it with the role", async () => {
    const { db, state } = fakeDb([owner, { ...member, emailVerified: false }]);
    const admin = fakeAdmin();
    const result = await moveAccounts({ db, admin, log: () => {}, now: NOW });

    expect(result).toEqual({ moved: 2, skipped: 0, adopted: 0, planned: 0 });
    expect(admin.createUser).toHaveBeenCalledWith({
      email: "owner@gayflix.example",
      email_confirm: true,
      user_metadata: { name: "Owner" },
    });
    expect(admin.createUser.mock.calls[1][0]).toMatchObject({ email_confirm: false });
    expect(state.accountMove).toEqual([
      { old_id: owner.id, new_id: admin.users[0].id, role: "owner", banReason: null },
      { old_id: member.id, new_id: admin.users[1].id, role: "user", banReason: null },
    ]);
    expect(state.profileRoles.get(admin.users[0].id as string)).toBe("owner");
  });

  it("skips accounts already moved, so it can run again", async () => {
    const { db } = fakeDb([owner, member], {
      moved: [{ old_id: owner.id, new_id: "00000000-0000-4000-8000-0000000000aa" }],
    });
    const admin = fakeAdmin();
    const result = await moveAccounts({ db, admin, log: () => {}, now: NOW });

    expect(result).toMatchObject({ moved: 1, skipped: 1 });
    expect(admin.createUser).toHaveBeenCalledTimes(1);
    expect(admin.createUser.mock.calls[0][0]).toMatchObject({ email: member.email });
  });

  it("records an Auth account left by a run that stopped before recording it", async () => {
    const leftover = { id: "00000000-0000-4000-8000-0000000000bb", email: owner.email };
    const { db, state } = fakeDb([owner]);
    const result = await moveAccounts({ db, admin: fakeAdmin([leftover]), log: () => {}, now: NOW });

    expect(result).toMatchObject({ moved: 1, adopted: 1 });
    expect(state.accountMove).toEqual([{ old_id: owner.id, new_id: leftover.id, role: "owner", banReason: null }]);
  });

  it("refuses an Auth account already recorded for another user", async () => {
    const taken = { id: "00000000-0000-4000-8000-0000000000cc", email: owner.email };
    const { db } = fakeDb([owner], { moved: [{ old_id: "someoneElse", new_id: taken.id }] });

    await expect(moveAccounts({ db, admin: fakeAdmin([taken]), log: () => {}, now: NOW })).rejects.toThrow(
      /already recorded for another account/
    );
  });

  it("stops on any other Auth error, without the full email in the message", async () => {
    const { db } = fakeDb([owner]);
    const admin = fakeAdmin();
    admin.createUser.mockResolvedValueOnce({
      data: { user: null },
      error: { code: "unexpected_failure", status: 500, message: "boom" },
    });

    await expect(moveAccounts({ db, admin, log: () => {}, now: NOW })).rejects.toThrow(
      "Creating the account for o***@g***.example failed: boom"
    );
  });

  it("carries a ban and its reason over", async () => {
    const banned = { ...member, banned: true, banReason: "Spam", banExpires: null };
    const { db, state } = fakeDb([banned]);
    const admin = fakeAdmin();
    await moveAccounts({ db, admin, log: () => {}, now: NOW });

    expect(admin.createUser.mock.calls[0][0]).toMatchObject({ ban_duration: "876000h" });
    expect(state.accountMove[0]).toMatchObject({ banReason: "Spam" });
  });

  it("only prints the plan on a dry run, with emails masked", async () => {
    const { db, state } = fakeDb([owner, member], { hasMoveTable: false, hasProfile: false });
    const admin = fakeAdmin();
    const lines: string[] = [];
    const result = await moveAccounts({ db, admin, dryRun: true, log: (line) => lines.push(line), now: NOW });

    expect(result).toEqual({ moved: 0, skipped: 0, adopted: 0, planned: 2 });
    expect(admin.createUser).not.toHaveBeenCalled();
    expect(state.moveTable).toBe(false);
    expect(lines).toEqual(["would move o***@g***.example (role owner)", "would move m***@g***.example (role user)"]);
    expect(lines.join("\n")).not.toContain("@gayflix.example");
  });

  it("leaves profile to the migration when the table doesn't exist yet", async () => {
    const { db, state } = fakeDb([owner], { hasProfile: false, hasMoveTable: false });
    await moveAccounts({ db, admin: fakeAdmin(), log: () => {}, now: NOW });

    expect(state.moveTable).toBe(true);
    expect(state.profileRoles.size).toBe(0);
    expect(state.accountMove).toHaveLength(1);
  });
});
