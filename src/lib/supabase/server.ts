import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { sessionCookieOptions, supabaseConfig, visitorHeaders } from "@/lib/supabase/config";

/**
 * Whether Google sign-in is turned on in Supabase Auth (the provider is
 * set up in the project's dashboard, not here), from Auth's public
 * settings, cached for 5 minutes. False if Auth can't be reached, so the
 * button just doesn't show.
 */
export async function googleSignInEnabled(): Promise<boolean> {
  try {
    const { url, publishableKey } = supabaseConfig();
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: publishableKey },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return false;
    const settings = (await response.json()) as { external?: { google?: unknown } };
    return settings.external?.google === true;
  } catch {
    return false;
  }
}

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
 *
 * Its calls carry the visitor's User-Agent (visitorHeaders), so the
 * sessions it starts record the visitor's browser.
 */
export async function createServerSupabase() {
  const { url, publishableKey } = supabaseConfig();
  const cookieStore = await cookies();
  const userAgent = (await headers()).get("user-agent");
  return createServerClient(url, publishableKey, {
    global: { headers: visitorHeaders(userAgent) },
    cookieOptions: sessionCookieOptions(),
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a server component, or after the response has
          // gone (after()), neither of which can set cookies.
        }
      },
    },
  });
}
