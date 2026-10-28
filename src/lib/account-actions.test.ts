import { beforeEach, describe, expect, it, vi } from "vitest";
import { disableTwoFactorAction } from "@/lib/account-actions";

const mockGetSession = vi.fn();
vi.mock("@/lib/session", () => ({
  getSession: () => mockGetSession(),
}));

const mockRevalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("next/server", () => ({
  connection: vi.fn(async () => {}),
}));

const mockVerifyPassword = vi.fn();
vi.mock("better-auth/crypto", () => ({
  verifyPassword: (...args: unknown[]) => mockVerifyPassword(...args),
}));

const mockAccountFindFirst = vi.fn();
const mockUserUpdate = vi.fn();
const mockTwoFactorDeleteMany = vi.fn();
const mockSessionDeleteMany = vi.fn();
const mockTransaction = vi.fn(async (ops: unknown[]) => ops);

vi.mock("@/lib/db", () => ({
  db: {
    account: { findFirst: (...args: unknown[]) => mockAccountFindFirst(...args) },
    user: { update: (...args: unknown[]) => mockUserUpdate(...args) },
    twoFactor: { deleteMany: (...args: unknown[]) => mockTwoFactorDeleteMany(...args) },
    session: { deleteMany: (...args: unknown[]) => mockSessionDeleteMany(...args) },
    $transaction: (ops: unknown[]) => mockTransaction(ops),
  },
}));

const mockListSessions = vi.fn();
const mockRevokeSession = vi.fn();
const mockRevokeOtherSessions = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      listSessions: (...args: unknown[]) => mockListSessions(...args),
      revokeSession: (...args: unknown[]) => mockRevokeSession(...args),
      revokeOtherSessions: (...args: unknown[]) => mockRevokeOtherSessions(...args),
    },
  },
}));

describe("disableTwoFactorAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ADMIN_REQUIRE_2FA;
    mockGetSession.mockResolvedValue({
      user: { id: "user_1", role: "user", twoFactorEnabled: true },
      session: { id: "session_1" },
    });
    mockAccountFindFirst.mockResolvedValue({ password: "hashed_password" });
    mockVerifyPassword.mockResolvedValue(true);
  });

  it("returns an error if the user is not signed in", async () => {
    mockGetSession.mockResolvedValue(null);
    const result = await disableTwoFactorAction("my_password");
    expect(result.error).toMatch(/log out and log in again/i);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("returns an error if the password is empty or not a string", async () => {
    const result = await disableTwoFactorAction("");
    expect(result.error).toMatch(/enter your password/i);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("returns an error if staff account attempts to turn off 2FA when ADMIN_REQUIRE_2FA is true", async () => {
    process.env.ADMIN_REQUIRE_2FA = "true";
    mockGetSession.mockResolvedValue({
      user: { id: "admin_1", role: "admin", twoFactorEnabled: true },
      session: { id: "session_1" },
    });

    const result = await disableTwoFactorAction("my_password");
    expect(result.error).toMatch(/staff accounts keep two-factor on/i);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("allows staff to turn off 2FA when ADMIN_REQUIRE_2FA is not set", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "admin_1", role: "admin", twoFactorEnabled: true },
      session: { id: "session_1" },
    });

    const result = await disableTwoFactorAction("my_password");
    expect(result.success).toBe(true);
    expect(mockTransaction).toHaveBeenCalled();
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "admin_1" },
      data: { twoFactorEnabled: false },
    });
    expect(mockTwoFactorDeleteMany).toHaveBeenCalledWith({
      where: { userId: "admin_1" },
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/account/setting");
  });

  it("returns an error if account has no password set (OAuth only)", async () => {
    mockAccountFindFirst.mockResolvedValue(null);
    const result = await disableTwoFactorAction("my_password");
    expect(result.error).toMatch(/no password/i);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("returns an error if password verification fails", async () => {
    mockVerifyPassword.mockResolvedValue(false);
    const result = await disableTwoFactorAction("wrong_password");
    expect(result.error).toMatch(/that password isn't right/i);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("successfully turns off 2FA for members when password is valid", async () => {
    const result = await disableTwoFactorAction("correct_password");
    expect(result.success).toBe(true);
    expect(mockTransaction).toHaveBeenCalled();
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { twoFactorEnabled: false },
    });
    expect(mockTwoFactorDeleteMany).toHaveBeenCalledWith({
      where: { userId: "user_1" },
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/account/setting");
  });
});
