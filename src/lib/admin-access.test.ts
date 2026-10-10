import { describe, expect, it } from "vitest";
import { ADMIN_SESSION_MAX_AGE_MS, adminAccess } from "@/lib/admin-access";

const now = Date.parse("2026-10-10T12:00:00Z");

function session(
  user: { role?: string | null; twoFactorEnabled?: boolean | null },
  verified: boolean,
  ageMs = 0
) {
  return {
    user: { id: "u1", ...user },
    session: { createdAt: new Date(now - ageMs), twoFactorVerified: verified },
  };
}

describe("adminAccess", () => {
  it("lets in an admin who passed two-factor recently", () => {
    expect(adminAccess(session({ role: "admin", twoFactorEnabled: true }, true), now)).toBe("ok");
  });

  it("keeps out guests and non-admins", () => {
    expect(adminAccess(null, now)).toBe("not-admin");
    expect(adminAccess(session({ role: "user", twoFactorEnabled: true }, true), now)).toBe(
      "not-admin"
    );
  });

  it("sends admins without two-factor to set it up", () => {
    expect(adminAccess(session({ role: "admin", twoFactorEnabled: false }, false), now)).toBe(
      "setup-2fa"
    );
  });

  it("asks for a fresh sign-in when the session skipped two-factor or is too old", () => {
    const admin = { role: "admin", twoFactorEnabled: true };
    expect(adminAccess(session(admin, false), now)).toBe("sign-in");
    expect(adminAccess(session(admin, true, ADMIN_SESSION_MAX_AGE_MS + 1), now)).toBe("sign-in");
    expect(adminAccess(session(admin, true, ADMIN_SESSION_MAX_AGE_MS - 1000), now)).toBe("ok");
  });
});
