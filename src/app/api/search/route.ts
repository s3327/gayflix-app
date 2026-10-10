import { NextResponse, type NextRequest } from "next/server";
import { suggestTitles } from "@/lib/catalog";

/**
 * Live suggestions for the header search box. Runs on the server so the
 * catalog never has to ship in the client bundle.
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  return NextResponse.json(
    { results: await suggestTitles(query) },
    { headers: { "Cache-Control": "public, max-age=60" } }
  );
}
