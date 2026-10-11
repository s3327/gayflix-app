import { describe, expect, it } from "vitest";
import {
  BAN_REASON_MAX,
  isBanned,
  isUserId,
  parseBanForm,
  userActionProblem,
  userFilterParam,
  type UserTarget,
} from "@/lib/user-admin";

const NOW = Date.parse("2026-10-11T12:00:00Z");
const ME = "AdminAdminAdminAdminAdminAdmin01";

const user: UserTarget = {
  id: "UserUserUserUserUserUserUserUs01",
  role: "user",
  emailVerified: true,
  banned: false,
  banExpires: null,
};
const admin: UserTarget = { ...user, role: "admin" };
const banned: UserTarget = { ...user, banned: true };

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("isUserId", () => {
  it("takes Better Auth's ids and nothing else", () => {
    expect(isUserId(user.id)).toBe(true);
    for (const bad of [undefined, 42, "", "short", "has space in it 0123456789", "a/b".repeat(10), "x".repeat(65)]) {
      expect(isUserId(bad)).toBe(false);
    }
  });
});

describe("userFilterParam", () => {
  it("falls back to everyone", () => {
    expect(userFilterParam("admins")).toBe("admins");
    expect(userFilterParam("banned")).toBe("banned");
    expect(userFilterParam("unconfirmed")).toBe("unconfirmed");
    expect(userFilterParam("nobody")).toBe("all");
    expect(userFilterParam(undefined)).toBe("all");
  });
});

describe("isBanned", () => {
  it("counts a ban until it ends", () => {
    expect(isBanned(banned, NOW)).toBe(true);
    expect(isBanned({ banned: true, banExpires: new Date(NOW + 1000) }, NOW)).toBe(true);
    expect(isBanned({ banned: true, banExpires: new Date(NOW - 1000) }, NOW)).toBe(false);
    expect(isBanned({ banned: null, banExpires: null }, NOW)).toBe(false);
    expect(isBanned(user, NOW)).toBe(false);
  });
});

describe("userActionProblem", () => {
  it("never lets an admin change their own account", () => {
    for (const action of ["make-admin", "remove-admin", "ban", "unban", "sign-out"] as const) {
      expect(userActionProblem(action, ME, { ...admin, id: ME }, NOW)).toMatch(/your own account/);
    }
  });

  it("makes admins only of confirmed, unbanned regular accounts", () => {
    expect(userActionProblem("make-admin", ME, user, NOW)).toBeNull();
    expect(userActionProblem("make-admin", ME, admin, NOW)).toMatch(/already an admin/);
    expect(userActionProblem("make-admin", ME, { ...user, emailVerified: false }, NOW)).toMatch(/confirmed its email/);
    expect(userActionProblem("make-admin", ME, banned, NOW)).toMatch(/Unban/);
    // A ban that has ended doesn't count.
    expect(
      userActionProblem("make-admin", ME, { ...banned, banExpires: new Date(NOW - 1000) }, NOW)
    ).toBeNull();
  });

  it("removes admin access only from admins", () => {
    expect(userActionProblem("remove-admin", ME, admin, NOW)).toBeNull();
    expect(userActionProblem("remove-admin", ME, user, NOW)).toMatch(/isn't an admin/);
  });

  it("bans regular accounts only, and unbans banned ones", () => {
    expect(userActionProblem("ban", ME, user, NOW)).toBeNull();
    expect(userActionProblem("ban", ME, admin, NOW)).toMatch(/Remove this account's admin access/);
    expect(userActionProblem("unban", ME, banned, NOW)).toBeNull();
    expect(userActionProblem("unban", ME, user, NOW)).toMatch(/isn't banned/);
  });

  it("signs anyone else out", () => {
    expect(userActionProblem("sign-out", ME, user, NOW)).toBeNull();
    expect(userActionProblem("sign-out", ME, admin, NOW)).toBeNull();
  });
});

describe("parseBanForm", () => {
  it("reads the reason and length", () => {
    expect(parseBanForm(form({ reason: "  Spam  ", length: "7d" }))).toEqual({
      reason: "Spam",
      seconds: 7 * 24 * 60 * 60,
    });
    expect(parseBanForm(form({ reason: "", length: "forever" }))).toEqual({ reason: "", seconds: undefined });
    expect(parseBanForm(form({ length: "1d" }))).toEqual({ reason: "", seconds: 24 * 60 * 60 });
  });

  it("refuses what the form can't send", () => {
    expect(parseBanForm(form({ reason: "Spam", length: "1y" }))).toBeNull();
    expect(parseBanForm(form({ reason: "Spam" }))).toBeNull();
    expect(parseBanForm(form({ reason: "x".repeat(BAN_REASON_MAX + 1), length: "1d" }))).toBeNull();
  });
});
