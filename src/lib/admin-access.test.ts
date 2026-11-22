import { describe, expect, it } from "vitest";
import { ADMIN_SESSION_MAX_AGE_MS, adminAccess, adminSignInAt } from "@/lib/admin-access";
import type { AppSession } from "@/lib/session";

const now = Date.parse("2026-10-10T12:00:00Z");
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function session(overrides: Partial<Omit<AppSession, "user">> & { role?: string } = {}): AppSession {
  const { role = "admin", ...rest } = overrides;
  return {
    user: { id: "11111111-1111-1111-1111-111111111111", email: "staff@gayflix.test", role, name: null },
    sessionId: "22222222-2222-2222-2222-222222222222",
    aal: "aal1",
    totpVerifiedAt: null,
    createdAt: now,
    hasVerifiedTotp: false,
    ...rest,
  };
}

/** An admin who signed in with password, then TOTP `ago` milliseconds ago. */
function twoFactorAdmin(ago: number, role = "admin") {
  return session({
    role,
    aal: "aal2",
    hasVerifiedTotp: true,
    createdAt: now - ago - MINUTE,
    totpVerifiedAt: now - ago,
  });
}

describe("adminAccess", () => {
  it("lets in an admin whose two-factor was 11h59m ago", () => {
    expect(adminAccess(twoFactorAdmin(11 * HOUR + 59 * MINUTE), now)).toBe("ok");
  });

  it("asks an admin whose two-factor was 12h01m ago to sign in again", () => {
    expect(adminAccess(twoFactorAdmin(12 * HOUR + MINUTE), now)).toBe("sign-in");
  });

  it("asks a staff member with two-factor whose session is only aal1 to sign in", () => {
    for (const role of ["admin", "moderator", "owner"]) {
      expect(adminAccess(session({ role, aal: "aal1", hasVerifiedTotp: true }), now)).toBe(
        "sign-in"
      );
    }
  });

  it("asks for a sign-in when an aal2 session has no TOTP time", () => {
    expect(
      adminAccess(session({ aal: "aal2", hasVerifiedTotp: true, totpVerifiedAt: null }), now)
    ).toBe("sign-in");
  });

  it("keeps out guests and non-staff roles", () => {
    expect(adminAccess(null, now)).toBe("not-admin");
    expect(adminAccess(twoFactorAdmin(MINUTE, "user"), now)).toBe("not-admin");
    expect(adminAccess(session({ role: "user" }), now)).toBe("not-admin");
  });

  it("lets in a password-only admin when two-factor is optional, for 12 hours", () => {
    const passwordOnly = (ago: number) => session({ createdAt: now - ago });
    expect(adminAccess(passwordOnly(11 * HOUR + 59 * MINUTE), now)).toBe("ok");
    expect(adminAccess(passwordOnly(ADMIN_SESSION_MAX_AGE_MS + 1), now)).toBe("sign-in");
  });

  it("sends staff without a verified TOTP factor to set it up when ADMIN_REQUIRE_2FA is on", () => {
    for (const value of ["true", "1"]) {
      expect(adminAccess(session(), now, { ADMIN_REQUIRE_2FA: value })).toBe("setup-2fa");
    }
    expect(adminAccess(twoFactorAdmin(MINUTE), now, { ADMIN_REQUIRE_2FA: "true" })).toBe("ok");
  });
});

describe("adminSignInAt", () => {
  it("is the TOTP time for an aal2 session, and the session start otherwise", () => {
    const admin = twoFactorAdmin(HOUR);
    expect(adminSignInAt(admin)).toBe(admin.totpVerifiedAt);
    const passwordOnly = session({ createdAt: now - HOUR });
    expect(adminSignInAt(passwordOnly)).toBe(now - HOUR);
  });
});
