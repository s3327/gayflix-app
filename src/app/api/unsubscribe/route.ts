import { NextResponse, type NextRequest } from "next/server";
import { unsubscribeFromNewEpisodes } from "@/lib/notification-actions";

/**
 * One-click unsubscribe (RFC 8058) for the new-episode emails: mail apps
 * POST here from the email's List-Unsubscribe header. The link people
 * click goes to /unsubscribe instead, which asks first, so a scanner
 * opening links can't unsubscribe anyone.
 */
export async function POST(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const done = await unsubscribeFromNewEpisodes(params.get("u"), params.get("t"));
  return NextResponse.json({ ok: done }, { status: done ? 200 : 400, headers: { "Cache-Control": "no-store" } });
}
