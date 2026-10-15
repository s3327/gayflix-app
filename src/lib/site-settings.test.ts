import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, isRegistrationOpen, updateSiteSettings } from "./site-settings";

let mockRole = "admin";

vi.mock("@/lib/session", () => ({
  requireAdmin: vi.fn(async () => ({
    user: { id: "test-admin", email: "admin@gayflix.test", role: mockRole },
  })),
}));

vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockFindUnique = vi.fn();
const mockUpsert = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    siteSetting: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
    },
  },
}));

describe("site-settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRole = "admin";
    mockFindUnique.mockResolvedValue(null);
    mockUpsert.mockImplementation(async ({ create, update }) => ({
      ...DEFAULT_SETTINGS,
      ...create,
      ...update,
    }));
  });

  it("provides sensible default configuration values with empty allowedEmbedHosts", () => {
    expect(DEFAULT_SETTINGS.siteTitle).toBe("Gayflix");
    expect(DEFAULT_SETTINGS.tagline).toBe("Stream queer cinema, series and shorts");
    expect(DEFAULT_SETTINGS.contactEmail).toBe("support@gayflix.com");
    expect(DEFAULT_SETTINGS.registrationOpen).toBe(true);
    expect(DEFAULT_SETTINGS.maintenanceMode).toBe(false);
    expect(DEFAULT_SETTINGS.defaultPageSize).toBe(24);
    expect(DEFAULT_SETTINGS.allowedEmbedHosts).toEqual([]);
    expect(DEFAULT_SETTINGS.webhookUrl).toBeNull();
  });

  it("isRegistrationOpen reflects site settings", async () => {
    mockFindUnique.mockResolvedValueOnce({
      ...DEFAULT_SETTINGS,
      registrationOpen: false,
    });
    expect(await isRegistrationOpen()).toBe(false);
  });

  describe("updateSiteSettings validation and partial preservation", () => {
    it("refuses unauthorized roles", async () => {
      mockRole = "moderator";
      const res = await updateSiteSettings({ siteTitle: "Hacked" });
      expect(res.ok).toBe(false);
      expect(res.message).toContain("Forbidden");
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it("sanitizes siteTitle length to max 100 and tagline to max 250", async () => {
      const longTitle = "A".repeat(150);
      const longTagline = "B".repeat(300);

      const res = await updateSiteSettings({ siteTitle: longTitle, tagline: longTagline });
      expect(res.ok).toBe(true);

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            siteTitle: "A".repeat(100),
            tagline: "B".repeat(250),
          }),
        })
      );
    });

    it("rejects invalid email format", async () => {
      const res = await updateSiteSettings({ contactEmail: "not-an-email" });
      expect(res.ok).toBe(false);
      expect(res.message).toBe("Invalid contact email address.");
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it("rejects non-https and private/SSRF webhook URLs", async () => {
      const httpRes = await updateSiteSettings({ webhookUrl: "http://example.com/webhook" });
      expect(httpRes.ok).toBe(false);
      expect(httpRes.message).toBe("Webhook URL must be a valid public HTTPS URL.");

      const ssrfRes = await updateSiteSettings({ webhookUrl: "https://127.0.0.1:8443/webhook" });
      expect(ssrfRes.ok).toBe(false);
      expect(ssrfRes.message).toBe("Webhook URL must be a valid public HTTPS URL.");

      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it("accepts valid public https webhook URL", async () => {
      const res = await updateSiteSettings({ webhookUrl: "https://discord.com/api/webhooks/123/xyz" });
      expect(res.ok).toBe(true);
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            webhookUrl: "https://discord.com/api/webhooks/123/xyz",
          }),
        })
      );
    });

    it("clamps defaultPageSize between 12 and 100", async () => {
      await updateSiteSettings({ defaultPageSize: 5 });
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ defaultPageSize: 12 }),
        })
      );

      await updateSiteSettings({ defaultPageSize: 500 });
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ defaultPageSize: 100 }),
        })
      );
    });

    it("preserves unmodified fields from existing database record on partial update", async () => {
      mockFindUnique.mockResolvedValueOnce({
        ...DEFAULT_SETTINGS,
        maintenanceMode: true,
        registrationOpen: false,
        siteTitle: "Custom Gayflix",
        defaultPageSize: 48,
      });

      const res = await updateSiteSettings({ tagline: "New Custom Tagline" });
      expect(res.ok).toBe(true);

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            siteTitle: "Custom Gayflix",
            tagline: "New Custom Tagline",
            maintenanceMode: true,
            registrationOpen: false,
            defaultPageSize: 48,
          }),
        })
      );
    });
  });
});
