import { NextResponse, type NextRequest } from "next/server";
import { getSuggestions } from "@/lib/search";

/**
 * Live suggestions for the header search box. Runs on the server so the
 * catalog never has to ship in the client bundle — once there's a real
 * database, this is where the query goes.
 */
export function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  return NextResponse.json(
    { results: getSuggestions(query) },
    { headers: { "Cache-Control": "public, max-age=60" } }
  );
}
