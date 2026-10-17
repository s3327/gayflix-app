import { describe, expect, it } from "vitest";
import {
  canManageCatalog,
  canManageJobs,
  canManageSettings,
  canManageUsers,
  canChangeRoles,
  isOwner,
  isStaffRole,
  roleBadgeClass,
  roleChangeProblem,
  roleLabel,
  staffTargetProblem,
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

describe("who may change whom", () => {
  it("lets only the Owner and Admins change roles", () => {
    expect(canChangeRoles("owner")).toBe(true);
    expect(canChangeRoles("admin")).toBe(true);
    for (const role of ["editor", "moderator", "user", null]) expect(canChangeRoles(role)).toBe(false);
  });

  it("keeps editors out of accounts and moderators away from staff", () => {
    expect(staffTargetProblem("editor", "user")).not.toBeNull();
    expect(staffTargetProblem("moderator", "user")).toBeNull();
    for (const target of ["moderator", "editor", "admin", "owner"]) {
      expect(staffTargetProblem("moderator", target)).not.toBeNull();
    }
  });

  it("protects the Owner account from everyone but the Owner", () => {
    expect(staffTargetProblem("admin", "owner")).toBe("Only the Owner can change the Owner account.");
    expect(staffTargetProblem("owner", "owner")).toBeNull();
    expect(staffTargetProblem("admin", "admin")).toBeNull();
  });

  it("lets only the Owner hand out the Owner role", () => {
    expect(roleChangeProblem("admin", "user", "admin")).toBeNull();
    expect(roleChangeProblem("admin", "user", "owner")).toBe("Only the Owner can make another Owner.");
    expect(roleChangeProblem("owner", "admin", "owner")).toBeNull();
    expect(roleChangeProblem("moderator", "user", "moderator")).not.toBeNull();
    expect(roleChangeProblem("editor", "user", "admin")).not.toBeNull();
  });
});
