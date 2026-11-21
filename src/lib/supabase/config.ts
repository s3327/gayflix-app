/**
 * Where Supabase Auth is, and the publishable key the site uses for it.
 *
 * The key is server-only despite the name: the browser never calls
 * Supabase (every auth call runs in server code), so it isn't a
 * NEXT_PUBLIC_ variable and never reaches a client bundle. The secret
 * key is read only in src/lib/supabase/admin.ts.
 */
export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error(
      "Supabase Auth isn't configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (see .env.example)."
    );
  }
  return { url, publishableKey };
}

/**
 * Attributes for the session cookie (access and refresh tokens), for
 * every client that reads or writes it (src/lib/supabase/server.ts,
 * src/lib/supabase/proxy-session.ts, the sign-in actions):
 * - HttpOnly: the browser never calls Supabase, so no script needs it;
 * - Secure in production, or on a request that came over https (local
 *   http dev still works);
 * - SameSite=Lax and Path=/, as @supabase/ssr sets them by default.
 * The cookie's lifetime stays @supabase/ssr's own.
 */
export function sessionCookieOptions(protocol?: string) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || protocol === "https:",
    sameSite: "lax" as const,
    path: "/",
  };
}

/**
 * Whether the request carries a Supabase Auth cookie (the session,
 * possibly split into `.0`, `.1` chunks, or a sign-in's code verifier).
 * Guests have none, so there's nothing to read or refresh.
 */
export function hasSupabaseAuthCookie(cookies: { name: string }[]) {
  return cookies.some(({ name }) => name.startsWith("sb-") && name.includes("-auth-token"));
}

/**
 * Headers every Supabase Auth call made for a visitor carries: their
 * browser's User-Agent only. Every auth call runs on this server, so
 * without it Auth would record this server's fetch ("node") as each
 * session's device (`auth.sessions.user_agent`, which a sign-in and
 * every token refresh write), and /account/setting couldn't name the
 * devices. Never the visitor's address or any other header.
 */
export function visitorHeaders(userAgent: string | null | undefined): Record<string, string> {
  return userAgent ? { "User-Agent": userAgent.slice(0, 512) } : {};
}
