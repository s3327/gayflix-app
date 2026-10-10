import { NextRequest, NextResponse } from "next/server";
import { ADMIN_AUTH_REALM, checkAdminAccess } from "@/lib/admin-auth";

// Any hostname prefix that should be treated as the admin panel.
// Works for admin.domain.com in production and admin.localhost:3000 in dev
// (modern browsers resolve *.localhost to 127.0.0.1 automatically).
//
// The Host header is trusted as-is — fine on Vercel and behind any proxy
// that only forwards the site's own hostnames. Behind a proxy that passes
// arbitrary Host values through, pin the allowed hostnames here instead.
const ADMIN_HOST_PREFIX = "admin.";

function isAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function adminDenied(access: "unauthorized" | "disabled") {
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

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const isAdminHost = host.startsWith(ADMIN_HOST_PREFIX);
  const url = request.nextUrl.clone();

  if (isAdminHost) {
    const access = checkAdminAccess(request.headers.get("authorization"));
    if (access !== "allowed") return adminDenied(access);

    // admin.domain.com/login  ->  internally serves /admin/login
    // The visitor's address bar still shows admin.domain.com/login.
    if (!isAdminPath(url.pathname)) {
      url.pathname = `/admin${url.pathname === "/" ? "" : url.pathname}`;
    }
    const response = NextResponse.rewrite(url);
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }

  // Safety: don't let the admin routes be reachable from the public
  // domain directly (e.g. domain.com/admin/login). Only the admin
  // subdomain should ever resolve them.
  if (isAdminPath(url.pathname)) {
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except API routes, Next internals and static/brand assets.
    // API routes are outside the admin rewrite, so admin APIs must check
    // checkAdminAccess themselves.
    "/((?!api|_next/static|_next/image|favicon.ico|icon.png|robots.txt|brand/).*)",
  ],
};
