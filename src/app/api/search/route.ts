import { NextResponse, type NextRequest } from "next/server";
import { suggestTitles } from "@/lib/catalog";
import type { SuggestionResponse } from "@/lib/search";
import { getSiteSettings } from "@/lib/site-settings";
import { getSession } from "@/lib/session";
import { isStaffRole } from "@/lib/admin-roles";

/**
 * Live suggestions for the header search box (titles, and people named
 * on them), and how many titles the search page would find. Runs on the server so the catalog never has to
 * ship in the client bundle.
 */
export async function GET(request: NextRequest) {
  const [settings, session] = await Promise.all([getSiteSettings(), getSession()]);
  if (settings.maintenanceMode && !isStaffRole(session?.user?.role)) {
    return NextResponse.json(
      { results: [], maintenance: true },
      {
        status: 503,
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  }

  const query = request.nextUrl.searchParams.get("q") ?? "";
  const { items, total, people, fuzzy } = await suggestTitles(query);
  return NextResponse.json(
    { results: items, total, people, fuzzy } satisfies SuggestionResponse,
    { headers: { "Cache-Control": "public, max-age=60" } }
  );
}
