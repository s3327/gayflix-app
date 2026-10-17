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

let currentRole = "moderator";

vi.mock("@/lib/session", () => ({
  requireAdmin: vi.fn(async () => ({
    user: { id: "test-user-id", email: "staff@gayflix.test", role: currentRole },
  })),
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
});
