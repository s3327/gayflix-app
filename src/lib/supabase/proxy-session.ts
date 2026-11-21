import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { hasSupabaseAuthCookie, sessionCookieOptions, supabaseConfig, visitorHeaders } from "@/lib/supabase/config";

/**
 * Refreshes the signed-in user's session when its access token has
 * expired, from src/proxy.ts before every page renders. Server
 * components can't set cookies, so this is the one place a page request
 * can.
 *
 * getClaims() checks the access token; when it's expired, the client
 * swaps the refresh token for a new session and writes it through
 * setAll, which puts the new cookies:
 * - on `request`, so the page rendered for this request already sees
 *   the new session (the proxy forwards the request's headers);
 * - on `response`, with Supabase's no-cache headers, so the browser
 *   keeps them and no CDN serves them to someone else.
 *
 * Guests (no Supabase cookies) are skipped: there's nothing to refresh.
 * A refresh rewrites the session's recorded browser, so it carries the
 * visitor's User-Agent too (visitorHeaders).
 */
export async function refreshSessionCookies(
  request: NextRequest,
  response: NextResponse
): Promise<void> {
  if (!hasSupabaseAuthCookie(request.cookies.getAll())) return;
  const { url, publishableKey } = supabaseConfig();
  const supabase = createServerClient(url, publishableKey, {
    global: { headers: visitorHeaders(request.headers.get("user-agent")) },
    cookieOptions: sessionCookieOptions(request.nextUrl.protocol),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value, options } of cookiesToSet) {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });
  // Auth errors (an expired or revoked refresh token, Auth unreachable)
  // come back as `error`, and the page then renders signed out; only a
  // bug throws, and that should surface.
  await supabase.auth.getClaims();
}
