import { NextRequest, NextResponse } from "next/server";

// Any hostname prefix that should be treated as the admin panel.
// Works for admin.domain.com in production and admin.localhost:3000 in dev
// (modern browsers resolve *.localhost to 127.0.0.1 automatically).
const ADMIN_HOST_PREFIX = "admin.";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const isAdminHost = host.startsWith(ADMIN_HOST_PREFIX);
  const url = request.nextUrl.clone();

  if (isAdminHost) {
    // admin.domain.com/login  ->  internally serves /admin/login
    // The visitor's address bar still shows admin.domain.com/login.
    if (!url.pathname.startsWith("/admin")) {
      url.pathname = `/admin${url.pathname}`;
    }
    return NextResponse.rewrite(url);
  }

  // Safety: don't let the admin routes be reachable from the public
  // domain directly (e.g. domain.com/admin/login). Only the admin
  // subdomain should ever resolve them.
  if (url.pathname.startsWith("/admin")) {
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except Next internals and static/brand assets.
    "/((?!api|_next/static|_next/image|favicon.ico|brand/).*)",
  ],
};
