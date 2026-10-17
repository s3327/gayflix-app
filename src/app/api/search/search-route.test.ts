import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

vi.mock("@/lib/catalog", () => ({
  suggestTitles: vi.fn(),
}));

vi.mock("@/lib/site-settings", () => ({
  getSiteSettings: vi.fn(),
  DEFAULT_SETTINGS: {
    id: "default",
    siteTitle: "Gayflix",
    tagline: "Stream queer cinema, series and shorts",
    contactEmail: "support@gayflix.com",
    registrationOpen: true,
    maintenanceMode: false,
    allowedEmbedHosts: [],
    defaultPageSize: 24,
    webhookUrl: null,
    updatedAt: new Date(),
    updatedBy: null,
  },
}));

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
}));

import { suggestTitles } from "@/lib/catalog";
import { getSiteSettings, DEFAULT_SETTINGS } from "@/lib/site-settings";
import { getSession } from "@/lib/session";

const mockSuggest = vi.mocked(suggestTitles);
const mockSettings = vi.mocked(getSiteSettings);
const mockSession = vi.mocked(getSession);

describe("GET /api/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns search suggestions when maintenance mode is off", async () => {
    mockSettings.mockResolvedValueOnce({
      ...DEFAULT_SETTINGS,
      maintenanceMode: false,
    });
    mockSession.mockResolvedValueOnce(null);
    mockSuggest.mockResolvedValueOnce([
      { id: "m1", title: "Heartstopper", year: 2022, type: "series", posterUrl: "/poster1.jpg" },
    ]);

    const req = new NextRequest("http://localhost:3000/api/search?q=heart");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
    const body = await res.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].title).toBe("Heartstopper");
  });

  it("returns 503 during maintenance mode for anonymous visitors", async () => {
    mockSettings.mockResolvedValueOnce({
      ...DEFAULT_SETTINGS,
      maintenanceMode: true,
    });
    mockSession.mockResolvedValueOnce(null);

    const req = new NextRequest("http://localhost:3000/api/search?q=heart");
    const res = await GET(req);

    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await res.json();
    expect(body).toEqual({ results: [], maintenance: true });
    expect(mockSuggest).not.toHaveBeenCalled();
  });

  it("returns 503 during maintenance mode for non-staff users", async () => {
    mockSettings.mockResolvedValueOnce({
      ...DEFAULT_SETTINGS,
      maintenanceMode: true,
    });
    mockSession.mockResolvedValueOnce({
      user: { id: "u1", email: "user@example.com", role: "user" },
      session: { id: "s1" },
    } as unknown as NonNullable<Awaited<ReturnType<typeof getSession>>>);

    const req = new NextRequest("http://localhost:3000/api/search?q=heart");
    const res = await GET(req);

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.maintenance).toBe(true);
    expect(mockSuggest).not.toHaveBeenCalled();
  });

  it("allows search during maintenance mode for staff users", async () => {
    mockSettings.mockResolvedValueOnce({
      ...DEFAULT_SETTINGS,
      maintenanceMode: true,
    });
    mockSession.mockResolvedValueOnce({
      user: { id: "admin1", email: "admin@example.com", role: "admin" },
      session: { id: "s2" },
    } as unknown as NonNullable<Awaited<ReturnType<typeof getSession>>>);
    mockSuggest.mockResolvedValueOnce([
      { id: "m2", title: "Fellow Travelers", year: 2023, type: "series", posterUrl: "/poster2.jpg" },
    ]);

    const req = new NextRequest("http://localhost:3000/api/search?q=fellow");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].title).toBe("Fellow Travelers");
  });
});
