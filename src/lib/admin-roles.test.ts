import { describe, expect, it } from "vitest";
import {
  canManageCatalog,
  canManageJobs,
  canManageSettings,
  canManageUsers,
  isOwner,
  isStaffRole,
  roleBadgeClass,
  roleLabel,
} from "./admin-roles";

describe("admin-roles RBAC", () => {
  it("identifies staff roles correctly", () => {
    expect(isStaffRole("owner")).toBe(true);
    expect(isStaffRole("admin")).toBe(true);
    expect(isStaffRole("editor")).toBe(true);
    expect(isStaffRole("moderator")).toBe(true);
    expect(isStaffRole("user")).toBe(false);
    expect(isStaffRole(null)).toBe(false);
    expect(isStaffRole(undefined)).toBe(false);
  });

  it("checks catalog management permission", () => {
    expect(canManageCatalog("owner")).toBe(true);
    expect(canManageCatalog("admin")).toBe(true);
    expect(canManageCatalog("editor")).toBe(true);
    expect(canManageCatalog("moderator")).toBe(false);
    expect(canManageCatalog("user")).toBe(false);
  });

  it("checks user management permission", () => {
    expect(canManageUsers("owner")).toBe(true);
    expect(canManageUsers("admin")).toBe(true);
    expect(canManageUsers("moderator")).toBe(true);
    expect(canManageUsers("editor")).toBe(false);
    expect(canManageUsers("user")).toBe(false);
  });

  it("checks settings management permission", () => {
    expect(canManageSettings("owner")).toBe(true);
    expect(canManageSettings("admin")).toBe(true);
    expect(canManageSettings("editor")).toBe(false);
    expect(canManageSettings("moderator")).toBe(false);
    expect(canManageSettings("user")).toBe(false);
  });

  it("checks jobs management permission", () => {
    expect(canManageJobs("owner")).toBe(true);
    expect(canManageJobs("admin")).toBe(true);
    expect(canManageJobs("editor")).toBe(false);
    expect(canManageJobs("moderator")).toBe(false);
  });

  it("identifies owner correctly", () => {
    expect(isOwner("owner")).toBe(true);
    expect(isOwner("admin")).toBe(false);
  });

  it("returns human-readable role labels and badge classes", () => {
    expect(roleLabel("owner")).toBe("Owner");
    expect(roleLabel("admin")).toBe("Admin");
    expect(roleLabel("editor")).toBe("Editor");
    expect(roleLabel("moderator")).toBe("Moderator");
    expect(roleLabel("user")).toBe("Member");

    expect(roleBadgeClass("owner")).toContain("text-ink-brand");
    expect(roleBadgeClass("admin")).toContain("text-purple-400");
    expect(roleBadgeClass("editor")).toContain("text-blue-400");
    expect(roleBadgeClass("moderator")).toContain("text-emerald-400");
  });
});
