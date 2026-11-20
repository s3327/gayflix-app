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
 * Whether the request carries a Supabase Auth cookie (the session,
 * possibly split into `.0`, `.1` chunks, or a sign-in's code verifier).
 * Guests have none, so there's nothing to read or refresh.
 */
export function hasSupabaseAuthCookie(cookies: { name: string }[]) {
  return cookies.some(({ name }) => name.startsWith("sb-") && name.includes("-auth-token"));
}
