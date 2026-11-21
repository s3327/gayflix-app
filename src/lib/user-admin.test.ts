import { describe, expect, it } from "vitest";
import {
  BAN_REASON_MAX,
  banDuration,
  banFromBannedUntil,
  isBanned,
  isUserId,
  parseBanForm,
  userActionProblem,
  userFilterParam,
  type UserTarget,
} from "@/lib/user-admin";

const NOW = Date.parse("2026-10-11T12:00:00Z");
const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const user: UserTarget = {
  id: "11111111-1111-4111-8111-111111111111",
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
  it("takes Supabase Auth's UUIDs and nothing else", () => {
    expect(isUserId(user.id)).toBe(true);
    expect(isUserId("A1111111-1111-4111-8111-11111111111F")).toBe(true);
    for (const bad of [
      undefined,
      42,
      "",
      "short",
      "UserUserUserUserUserUserUserUs01",
      "11111111-1111-4111-8111-11111111111",
      "11111111-1111-4111-8111-111111111111 ",
      "11111111111141118111111111111111",
      "g1111111-1111-4111-8111-111111111111",
    ]) {
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

describe("banFromBannedUntil", () => {
  it("reads Supabase Auth's banned_until", () => {
    expect(banFromBannedUntil(null, NOW)).toEqual({ banned: false, banExpires: null });
    // A ban that has passed is no ban.
    expect(banFromBannedUntil(new Date(NOW - 1000), NOW)).toEqual({ banned: false, banExpires: null });
    const tomorrow = new Date(NOW + 24 * 60 * 60 * 1000);
    expect(banFromBannedUntil(tomorrow, NOW)).toEqual({ banned: true, banExpires: tomorrow });
    // "Until unbanned" is a 100-year ban; it has no end date to show.
    const forever = new Date(NOW + 876000 * 60 * 60 * 1000);
    expect(banFromBannedUntil(forever, NOW)).toEqual({ banned: true, banExpires: null });
  });
});

describe("banDuration", () => {
  it("turns the form's length into Supabase Auth's ban_duration", () => {
    expect(banDuration(undefined)).toBe("876000h");
    expect(banDuration(24 * 60 * 60)).toBe("86400s");
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
