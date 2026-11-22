import { beforeEach, describe, expect, it, vi } from "vitest";
import { FORBIDDEN_CATALOG, FORBIDDEN_USERS } from "@/lib/admin-guard";
import {
  createTitle,
  updateTitle,
  setTitleStatus,
  trashTitle,
  restoreTitle,
  deleteTitle,
  quickUpdateTitle,
} from "@/lib/admin-catalog-actions";
import {
  importTitle,
  importMultipleTitles,
  refreshTitleFromTmdb,
  fixTitleMatch,
} from "@/lib/admin-import-actions";
import { addVideoSource, updateVideoSource } from "@/lib/admin-video-actions";
import { uploadTitleImage } from "@/lib/admin-image-actions";
import { performUndo } from "@/lib/admin-undo-actions";
import { resolveReport, resolveAllForMedia, reopenReport } from "@/lib/admin-report-actions";
import {
  banUser,
  makeAdmin,
  removeAdmin,
  resetUserTwoFactor,
  setUserRole,
  signOutEverywhere,
  unbanUser,
  updateUserDetails,
} from "@/lib/admin-user-actions";

let currentRole = "moderator";
const ACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TARGET_ID = "11111111-1111-4111-8111-111111111111";

vi.mock("@/lib/session", () => ({
  requireAdmin: vi.fn(async () => ({
    user: { id: ACTOR_ID, email: "staff@gayflix.test", role: currentRole },
  })),
}));

// The account being changed, as src/lib/user-admin-store.ts reads it.
const store = {
  readUserTarget: vi.fn(),
  changeRole: vi.fn(),
  setBanReason: vi.fn(),
  findAccountByEmail: vi.fn(),
};
vi.mock("@/lib/user-admin-store", () => ({
  readUserTarget: (...args: unknown[]) => store.readUserTarget(...args),
  changeRole: (...args: unknown[]) => store.changeRole(...args),
  setBanReason: (...args: unknown[]) => store.setBanReason(...args),
  findAccountByEmail: (...args: unknown[]) => store.findAccountByEmail(...args),
}));

const mockDeleteSessions = vi.fn();
vi.mock("@/lib/auth-profile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth-profile")>()),
  deleteAllAccountSessions: (...args: unknown[]) => mockDeleteSessions(...args),
}));

const admin = {
  updateUserById: vi.fn(),
  mfa: { listFactors: vi.fn(), deleteFactor: vi.fn() },
};
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({ auth: { admin } }),
}));

const mockLogActivity = vi.fn();
vi.mock("@/lib/activity-logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/activity-logger")>()),
  logActivity: (...args: unknown[]) => mockLogActivity(...args),
}));

const mockSetAdminFlash = vi.fn();
vi.mock("@/lib/admin-flash", () => ({
  setAdminFlash: (...args: unknown[]) => mockSetAdminFlash(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

describe("RBAC Server Actions Authorization Refusal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Moderator role attempting catalog actions (forbidden)", () => {
    beforeEach(() => {
      currentRole = "moderator";
    });

    it("refuses createTitle for moderator", async () => {
      const form = new FormData();
      form.append("title", "Test Movie");
      const res = await createTitle("movie", {}, form);
      expect(res.message).toBe(FORBIDDEN_CATALOG);
    });

    it("refuses updateTitle for moderator", async () => {
      const form = new FormData();
      form.append("title", "Updated Movie");
      const res = await updateTitle("test-id", {}, form);
      expect(res.message).toBe(FORBIDDEN_CATALOG);
    });

    it("refuses setTitleStatus for moderator with admin flash", async () => {
      await setTitleStatus("test-id", "published");
      expect(mockSetAdminFlash).toHaveBeenCalledWith({ message: FORBIDDEN_CATALOG });
    });

    it("refuses trashTitle for moderator with admin flash", async () => {
      await trashTitle("test-id");
      expect(mockSetAdminFlash).toHaveBeenCalledWith({ message: FORBIDDEN_CATALOG });
    });

    it("refuses restoreTitle for moderator with admin flash", async () => {
      await restoreTitle("test-id");
      expect(mockSetAdminFlash).toHaveBeenCalledWith({ message: FORBIDDEN_CATALOG });
    });

    it("refuses deleteTitle for moderator with admin flash", async () => {
      await deleteTitle("test-id");
      expect(mockSetAdminFlash).toHaveBeenCalledWith({ message: FORBIDDEN_CATALOG });
    });

    it("refuses quickUpdateTitle for moderator", async () => {
      const res = await quickUpdateTitle({
        id: "test-id",
        title: "Quick Test",
        year: 2024,
        status: "draft",
      });
      expect(res.ok).toBe(false);
      expect(res.message).toBe(FORBIDDEN_CATALOG);
    });

    it("refuses importTitle for moderator", async () => {
      const form = new FormData();
      const res = await importTitle("movie-12345", {}, form);
      expect(res.message).toBe(FORBIDDEN_CATALOG);
    });

    it("refuses importMultipleTitles for moderator", async () => {
      const res = await importMultipleTitles(["movie-12345"]);
      expect(res.ok).toBe(false);
      expect(res.errors).toContain(FORBIDDEN_CATALOG);
    });

    it("refuses refreshTitleFromTmdb for moderator", async () => {
      const res = await refreshTitleFromTmdb({ id: "test-id", overwriteUnlocked: false });
      expect(res.ok).toBe(false);
      expect(res.message).toBe(FORBIDDEN_CATALOG);
    });

    it("refuses fixTitleMatch for moderator", async () => {
      const res = await fixTitleMatch({ id: "test-id", tmdbId: "movie-999" });
      expect(res.ok).toBe(false);
      expect(res.message).toBe(FORBIDDEN_CATALOG);
    });

    it("refuses addVideoSource for moderator", async () => {
      const form = new FormData();
      const res = await addVideoSource("movie", "test-id", {}, form);
      expect(res.message).toBe(FORBIDDEN_CATALOG);
    });

    it("refuses updateVideoSource for moderator", async () => {
      const form = new FormData();
      const res = await updateVideoSource("clxxxxxxxxxxxxxxxxxxxx", {}, form);
      expect(res.message).toBe(FORBIDDEN_CATALOG);
    });

    it("refuses uploadTitleImage for moderator", async () => {
      const form = new FormData();
      const res = await uploadTitleImage(form);
      expect(res.error).toBe(FORBIDDEN_CATALOG);
    });

    it("refuses performUndo for media actions by moderator", async () => {
      await performUndo("publish_media", ["test-id"]);
      expect(mockSetAdminFlash).toHaveBeenCalledWith({ message: FORBIDDEN_CATALOG });
    });
  });

  describe("Editor role attempting user/moderation actions (forbidden)", () => {
    beforeEach(() => {
      currentRole = "editor";
    });

    it("refuses resolveReport for editor with admin flash", async () => {
      await resolveReport("clxxxxxxxxxxxxxxxxxxxx");
      expect(mockSetAdminFlash).toHaveBeenCalledWith({ message: FORBIDDEN_USERS });
    });

    it("refuses resolveAllForMedia for editor", async () => {
      const res = await resolveAllForMedia({ mediaId: "test-media-id" });
      expect(res.ok).toBe(false);
      expect(mockSetAdminFlash).toHaveBeenCalledWith({ message: FORBIDDEN_USERS });
    });

    it("refuses reopenReport for editor with admin flash", async () => {
      await reopenReport("clxxxxxxxxxxxxxxxxxxxx");
      expect(mockSetAdminFlash).toHaveBeenCalledWith({ message: FORBIDDEN_USERS });
    });

    it("refuses performUndo for report actions by editor", async () => {
      await performUndo("resolve_report", ["clxxxxxxxxxxxxxxxxxxxx"]);
      expect(mockSetAdminFlash).toHaveBeenCalledWith({ message: FORBIDDEN_USERS });
    });
  });
  describe("User management (src/lib/admin-user-actions.ts)", () => {
    function target(role: string, extra: Record<string, unknown> = {}) {
      return {
        id: TARGET_ID,
        email: "target@gayflix.test",
        name: "Target",
        role,
        emailVerified: true,
        banned: false,
        banExpires: null,
        banReason: null,
        ...extra,
      };
    }

    function banForm(length = "1d", reason = "Spam") {
      const form = new FormData();
      form.set("reason", reason);
      form.set("length", length);
      return form;
    }

    beforeEach(() => {
      store.readUserTarget.mockResolvedValue(target("user"));
      store.changeRole.mockResolvedValue({ ok: true, previousRole: "user" });
      store.setBanReason.mockResolvedValue(undefined);
      store.findAccountByEmail.mockResolvedValue(null);
      mockDeleteSessions.mockResolvedValue(1);
      admin.updateUserById.mockResolvedValue({ data: {}, error: null });
      admin.mfa.listFactors.mockResolvedValue({ data: { factors: [{ id: "f1" }, { id: "f2" }] }, error: null });
      admin.mfa.deleteFactor.mockResolvedValue({ data: {}, error: null });
    });

    it("a moderator can't ban, sign out or reset the Owner", async () => {
      currentRole = "moderator";
      store.readUserTarget.mockResolvedValue(target("owner"));
      await expect(banUser(TARGET_ID, banForm())).rejects.toThrow("Only the Owner can change the Owner account.");
      await expect(signOutEverywhere(TARGET_ID)).rejects.toThrow("Only the Owner can change the Owner account.");
      expect(await resetUserTwoFactor(TARGET_ID)).toEqual({
        ok: false,
        message: "Only the Owner can change the Owner account.",
      });
      expect(admin.updateUserById).not.toHaveBeenCalled();
      expect(admin.mfa.deleteFactor).not.toHaveBeenCalled();
      expect(mockDeleteSessions).not.toHaveBeenCalled();
    });

    it("an admin can't change the Owner either", async () => {
      currentRole = "admin";
      store.readUserTarget.mockResolvedValue(target("owner"));
      await expect(banUser(TARGET_ID, banForm())).rejects.toThrow("Only the Owner can change the Owner account.");
      expect(admin.updateUserById).not.toHaveBeenCalled();
    });

    it("a moderator changes members only, and never roles", async () => {
      currentRole = "moderator";
      store.readUserTarget.mockResolvedValue(target("editor"));
      await expect(signOutEverywhere(TARGET_ID)).rejects.toThrow("Moderators can only change member accounts.");
      expect(await setUserRole(TARGET_ID, "admin")).toEqual({
        ok: false,
        message: "Only an Owner or an Admin can change roles.",
      });
      await expect(makeAdmin(TARGET_ID)).rejects.toThrow("Only an Owner or an Admin can change roles.");
      expect(store.changeRole).not.toHaveBeenCalled();
      expect(mockDeleteSessions).not.toHaveBeenCalled();
    });

    it("an editor can't manage accounts at all", async () => {
      currentRole = "editor";
      await expect(banUser(TARGET_ID, banForm())).rejects.toThrow(/permission to manage users/);
      await expect(signOutEverywhere(TARGET_ID)).rejects.toThrow(/permission to manage users/);
      expect(store.readUserTarget).not.toHaveBeenCalled();
    });

    it("refuses an id that isn't a UUID", async () => {
      currentRole = "admin";
      await expect(banUser("NoSuchAccountNoSuchAccount00", banForm())).rejects.toThrow("Invalid user");
      expect(await setUserRole("not-a-uuid", "admin")).toEqual({ ok: false, message: "Invalid user ID" });
      expect(store.readUserTarget).not.toHaveBeenCalled();
    });

    it("bans in Supabase Auth, deletes the account's sessions and keeps the reason off its metadata", async () => {
      currentRole = "moderator";
      await banUser(TARGET_ID, banForm("1d", "Spam"));
      expect(admin.updateUserById).toHaveBeenCalledWith(TARGET_ID, { ban_duration: "86400s" });
      expect(mockDeleteSessions).toHaveBeenCalledWith(TARGET_ID);
      expect(store.setBanReason).toHaveBeenCalledWith(TARGET_ID, "Spam");
      expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "user.ban", entityId: TARGET_ID }));
    });

    it("a ban until unbanned is a 100-year ban, with no reason when none was given", async () => {
      currentRole = "admin";
      await banUser(TARGET_ID, banForm("forever", ""));
      expect(admin.updateUserById).toHaveBeenCalledWith(TARGET_ID, { ban_duration: "876000h" });
      expect(store.setBanReason).toHaveBeenCalledWith(TARGET_ID, null);
    });

    it("doesn't record a ban Supabase Auth refused", async () => {
      currentRole = "admin";
      admin.updateUserById.mockResolvedValue({ data: null, error: { message: "boom" } });
      await expect(banUser(TARGET_ID, banForm())).rejects.toThrow();
      expect(store.setBanReason).not.toHaveBeenCalled();
      expect(mockLogActivity).not.toHaveBeenCalled();
    });

    it("unbans and clears the reason", async () => {
      currentRole = "admin";
      store.readUserTarget.mockResolvedValue(target("user", { banned: true, banReason: "Spam" }));
      await unbanUser(TARGET_ID);
      expect(admin.updateUserById).toHaveBeenCalledWith(TARGET_ID, { ban_duration: "none" });
      expect(store.setBanReason).toHaveBeenCalledWith(TARGET_ID, null);
      expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "user.unban" }));
    });

    it("signs a member out everywhere by deleting their sessions", async () => {
      currentRole = "moderator";
      await signOutEverywhere(TARGET_ID);
      expect(mockDeleteSessions).toHaveBeenCalledWith(TARGET_ID);
    });

    it("resets two-factor by deleting every factor, then the account's sessions", async () => {
      currentRole = "admin";
      expect(await resetUserTwoFactor(TARGET_ID)).toMatchObject({ ok: true });
      expect(admin.mfa.listFactors).toHaveBeenCalledWith({ userId: TARGET_ID });
      expect(admin.mfa.deleteFactor).toHaveBeenCalledWith({ id: "f1", userId: TARGET_ID });
      expect(admin.mfa.deleteFactor).toHaveBeenCalledWith({ id: "f2", userId: TARGET_ID });
      expect(mockDeleteSessions).toHaveBeenCalledWith(TARGET_ID);
    });

    it("role changes go through the locked check, which can refuse the last admin's demotion", async () => {
      currentRole = "admin";
      store.readUserTarget.mockResolvedValue(target("admin"));
      store.changeRole.mockResolvedValue({ ok: false, problem: "There must always be at least one admin." });
      await expect(removeAdmin(TARGET_ID)).rejects.toThrow("There must always be at least one admin.");
      expect(store.changeRole).toHaveBeenCalledWith({
        actorId: ACTOR_ID,
        targetId: TARGET_ID,
        newRole: "user",
        action: "remove-admin",
      });
      expect(await setUserRole(TARGET_ID, "editor")).toEqual({
        ok: false,
        message: "There must always be at least one admin.",
      });
      expect(store.changeRole).toHaveBeenLastCalledWith({ actorId: ACTOR_ID, targetId: TARGET_ID, newRole: "editor" });
      expect(mockLogActivity).not.toHaveBeenCalled();
    });

    it("logs a role change that went through", async () => {
      currentRole = "admin";
      expect(await setUserRole(TARGET_ID, "moderator")).toEqual({ ok: true });
      expect(mockLogActivity).toHaveBeenCalledWith(
        expect.objectContaining({ action: "user.role_change", details: { previousRole: "user", newRole: "moderator" } })
      );
    });

    it("edits a member's name and email through Supabase Auth's admin API", async () => {
      currentRole = "admin";
      const form = new FormData();
      form.set("name", "New Name");
      form.set("email", "New@Gayflix.test");
      form.set("emailVerified", "true");
      expect(await updateUserDetails(TARGET_ID, form)).toMatchObject({ ok: true });
      expect(admin.updateUserById).toHaveBeenCalledWith(TARGET_ID, {
        email: "new@gayflix.test",
        user_metadata: { name: "New Name" },
      });
    });

    it("won't edit an email onto another account's", async () => {
      currentRole = "admin";
      store.findAccountByEmail.mockResolvedValue("22222222-2222-4222-8222-222222222222");
      const form = new FormData();
      form.set("name", "Target");
      form.set("email", "taken@gayflix.test");
      form.set("emailVerified", "true");
      expect(await updateUserDetails(TARGET_ID, form)).toEqual({
        ok: false,
        message: "That email is already registered to another account.",
      });
      expect(admin.updateUserById).not.toHaveBeenCalled();
    });
  });
});
