import { describe, expect, it, vi } from "vitest";
import { getAdminFlash, setAdminFlash, type AdminFlash } from "@/lib/admin-flash";

const mockCookieStore = new Map<string, { value: string }>();

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (key: string) => mockCookieStore.get(key),
    set: (key: string, value: string) => {
      mockCookieStore.set(key, { value });
    },
  })),
}));

describe("admin-flash", () => {
  it("stores and retrieves flash message", async () => {
    mockCookieStore.clear();
    const flash: AdminFlash = {
      message: "3 titles published.",
      undo: { label: "Undo", action: "unpublish_media", ids: ["id1", "id2", "id3"] },
    };

    await setAdminFlash(flash);
    const retrieved = await getAdminFlash();

    expect(retrieved).toEqual(flash);
  });

  it("returns null when no flash cookie exists", async () => {
    mockCookieStore.clear();
    const retrieved = await getAdminFlash();
    expect(retrieved).toBeNull();
  });
});

