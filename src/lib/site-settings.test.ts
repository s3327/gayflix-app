import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./site-settings";

describe("site-settings", () => {
  it("provides sensible default configuration values", () => {
    expect(DEFAULT_SETTINGS.siteTitle).toBe("Gayflix");
    expect(DEFAULT_SETTINGS.tagline).toBe("Stream queer cinema, series and shorts");
    expect(DEFAULT_SETTINGS.contactEmail).toBe("support@gayflix.com");
    expect(DEFAULT_SETTINGS.registrationOpen).toBe(true);
    expect(DEFAULT_SETTINGS.maintenanceMode).toBe(false);
    expect(DEFAULT_SETTINGS.defaultPageSize).toBe(24);
    expect(DEFAULT_SETTINGS.allowedEmbedHosts).toContain("vidsrc.to");
    expect(DEFAULT_SETTINGS.allowedEmbedHosts).toContain("2embed.cc");
  });
});
