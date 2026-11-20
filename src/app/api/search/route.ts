import { NextResponse, type NextRequest } from "next/server";
import { suggestTitles } from "@/lib/catalog";
import type { SuggestionResponse } from "@/lib/search";
import { getSiteSettings } from "@/lib/site-settings";
import { getSession } from "@/lib/session";
import { isStaffRole } from "@/lib/admin-roles";

/**
 * The same for every visitor, so Vercel's CDN keeps each answer for 5
 * minutes (s-maxage) and the browser for 1: a repeated search never
 * reaches the server. Not during maintenance, when only staff get answers.
 */
const SHARED_CACHE = "public, max-age=60, s-maxage=300, stale-while-revalidate=600";
const NO_CACHE = "private, no-store";

/**
 * Live suggestions for the header search box (titles, and people named
 * on them), and how many titles the search page would find. Runs on the server so the catalog never has to
 * ship in the client bundle.
 */
export async function GET(request: NextRequest) {
  const settings = await getSiteSettings();
  // Only maintenance makes the answer depend on who asks, so only then is
  // the session read.
  if (settings.maintenanceMode) {
    const session = await getSession();
    if (!isStaffRole(session?.user?.role)) {
      return NextResponse.json(
        { results: [], maintenance: true },
        { status: 503, headers: { "Cache-Control": NO_CACHE } }
      );
    }
  }

  const query = request.nextUrl.searchParams.get("q") ?? "";
  const { items, total, people, fuzzy } = await suggestTitles(query);
  return NextResponse.json(
    { results: items, total, people, fuzzy } satisfies SuggestionResponse,
    { headers: { "Cache-Control": settings.maintenanceMode ? NO_CACHE : SHARED_CACHE } }
  );
}
