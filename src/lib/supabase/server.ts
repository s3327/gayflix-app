import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { sessionCookieOptions, supabaseConfig } from "@/lib/supabase/config";

/**
 * A Supabase client acting as the signed-in user of this request, from
 * their session cookies. Server code only (server components, server
 * actions, route handlers); make a new one per request.
 *
 * Server components can't set cookies, so when one of them triggers a
 * token refresh the new cookies are dropped here; that's fine because
 * src/proxy.ts has already refreshed the session before the page renders
 * (refreshSessionCookies). Server actions and route handlers can set
 * cookies, and do.
 */
export async function createServerSupabase() {
  const { url, publishableKey } = supabaseConfig();
  const cookieStore = await cookies();
  return createServerClient(url, publishableKey, {
    cookieOptions: sessionCookieOptions(),
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a server component, which can't set cookies.
        }
      },
    },
  });
}
