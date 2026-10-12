import { describe, expect, it } from "vitest";
import { accountDeletionProblem, type DeletionRequest } from "@/lib/account-deletion";

const member: DeletionRequest = {
  role: "user",
  impersonating: false,
  hasPassword: true,
  passwordGiven: true,
};

describe("accountDeletionProblem", () => {
  it("lets a member delete their account with their password", () => {
    expect(accountDeletionProblem(member)).toBeNull();
  });

  it("asks a member with a password for it", () => {
    expect(accountDeletionProblem({ ...member, passwordGiven: false })).toBe(
      "Enter your password to delete your account."
    );
  });

  it("lets a Google-only member delete without a password", () => {
    expect(accountDeletionProblem({ ...member, hasPassword: false, passwordGiven: false })).toBeNull();
  });

  it("refuses admin accounts, even with the password", () => {
    expect(accountDeletionProblem({ ...member, role: "admin" })).toMatch(/^Admin accounts can't be deleted/);
  });

  it("refuses while an admin is signed in as the member", () => {
    expect(accountDeletionProblem({ ...member, impersonating: true })).toMatch(/while an admin is signed in as it/);
  });
});
