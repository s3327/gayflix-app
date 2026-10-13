import { NextRequest, NextResponse } from "next/server";
import { ADMIN_AUTH_REALM, checkAdminAccess } from "@/lib/admin-auth";
import { buildContentSecurityPolicy, createNonce } from "@/lib/csp";
import { errorReportingOrigin } from "@/lib/error-reporting";
import { videoHostSources, videoHosts } from "@/lib/video-hosts";

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
    "The admin panel is disabled: set both ADMIN_BASIC_AUTH_USER and ADMIN_BASIC_AUTH_PASSWORD, or neither.",
    { status: 503, headers }
  );
}

/**
 * Runs before every page request (see `config.matcher`) and does two
 * things:
 *
 * 1. Guards the admin panel at /admin. When the optional admin password
 *    is configured (src/lib/admin-auth.ts), every /admin request needs it
 *    before anything renders; the admin layout checks again as a second
 *    lock. Admin responses are marked noindex and never cached. The
 *    account checks (role and two-factor) happen in requireAdmin().
 * 2. Sets a per-request nonce-based Content-Security-Policy
 *    (src/lib/csp.ts). Next.js picks the nonce up from the request
 *    header and applies it to its scripts — which is why the root layout
 *    opts every page into dynamic rendering.
 *
 * It also passes the requested path on as `x-pathname`, so server
 * layouts (which don't receive the URL) can send a guest to
 * /login?next=<this page>.
 */
export function proxy(request: NextRequest) {
  const admin = isAdminPath(request.nextUrl.pathname);

  if (admin) {
    const access = checkAdminAccess(request.headers.get("authorization"));
    if (access !== "allowed") return adminDenied(access);
  }

  const nonce = createNonce();
  const csp = buildContentSecurityPolicy(nonce, {
    dev: process.env.NODE_ENV === "development",
    reportOrigin: errorReportingOrigin(),
    videoSources: videoHostSources(videoHosts()),
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  requestHeaders.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  if (admin) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}

export const config = {
  matcher: [
    // Every page, including /admin. Skipped: API routes (JSON, no CSP
    // needed; admin APIs must check access themselves), build assets,
    // the image optimizer, and static files in public/ and app/.
    // Prefetches are deliberately NOT skipped, so they can't be used to
    // fetch /admin content without passing the admin check.
    "/((?!api/|_next/static|_next/image|favicon.ico|icon.png|robots.txt|sitemap.xml|brand/).*)",
  ],
};
