import { NextRequest, NextResponse } from "next/server";
import { ADMIN_AUTH_REALM, checkAdminAccess } from "@/lib/admin-auth";

/**
 * Guards the admin panel at domain.com/admin. Every /admin request needs
 * the admin password (see src/lib/admin-auth.ts) before anything renders;
 * the admin layout checks again as a second lock. Admin responses are
 * also marked noindex.
 *
 * Only /admin paths run through here (see `config.matcher`), so the
 * public site never pays for this check.
 */
export function proxy(request: NextRequest) {
  const access = checkAdminAccess(request.headers.get("authorization"));

  if (access !== "allowed") {
    const headers = new Headers({
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    });
    if (access === "unauthorized") {
      headers.set("WWW-Authenticate", `Basic realm="${ADMIN_AUTH_REALM}", charset="UTF-8"`);
      return new NextResponse("Authentication required.", { status: 401, headers });
    }
    return new NextResponse(
      "The admin panel is disabled: set ADMIN_BASIC_AUTH_USER and ADMIN_BASIC_AUTH_PASSWORD to enable it.",
      { status: 503, headers }
    );
  }

  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  // `/admin` itself plus everything under it — but not look-alikes such
  // as /administrators, which the `:path*` form wouldn't match anyway.
  matcher: ["/admin", "/admin/:path*"],
};
