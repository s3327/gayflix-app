import { describe, expect, it } from "vitest";
import { checkAdminAccess } from "@/lib/admin-auth";

const configured = {
  ADMIN_BASIC_AUTH_USER: "admin",
  ADMIN_BASIC_AUTH_PASSWORD: "s3cret:with-colon-ü",
};

function basic(user: string, password: string) {
  const bytes = new TextEncoder().encode(`${user}:${password}`);
  return `Basic ${btoa(String.fromCharCode(...bytes))}`;
}

describe("checkAdminAccess", () => {
  it("allows matching credentials, including UTF-8 and colons in the password", () => {
    expect(checkAdminAccess(basic("admin", "s3cret:with-colon-ü"), configured)).toBe("allowed");
  });

  it("rejects wrong, missing or malformed credentials", () => {
    expect(checkAdminAccess(basic("admin", "nope"), configured)).toBe("unauthorized");
    expect(checkAdminAccess(basic("root", "s3cret:with-colon-ü"), configured)).toBe("unauthorized");
    expect(checkAdminAccess(null, configured)).toBe("unauthorized");
    expect(checkAdminAccess("Bearer abc", configured)).toBe("unauthorized");
    expect(checkAdminAccess("Basic !!!", configured)).toBe("unauthorized");
    expect(checkAdminAccess(`Basic ${btoa("no-separator")}`, configured)).toBe("unauthorized");
  });

  it("is off when neither variable is set", () => {
    expect(checkAdminAccess(null, {})).toBe("allowed");
  });

  it("fails closed when only one variable is set", () => {
    expect(checkAdminAccess(null, { ADMIN_BASIC_AUTH_USER: "admin" })).toBe("disabled");
    expect(checkAdminAccess(null, { ADMIN_BASIC_AUTH_PASSWORD: "secret" })).toBe("disabled");
  });
});
