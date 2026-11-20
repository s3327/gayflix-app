import { NextResponse, type NextRequest } from "next/server";
import { nextParam, safeNextPath } from "@/lib/safe-redirect";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Where Google sign-in comes back to (signInWithGoogle in
 * src/lib/auth-actions.ts): swaps the one-time `code` for a session,
 * which the server client writes to the session cookie, then goes on to
 * `next`. `next` must be a path on this site; anything else goes to
 * /home, so this can't be used as an open redirect. If Google or
 * Supabase said no, /login says so.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  if (code) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(safeNextPath(params.get("next"), "/home"), request.url));
    }
  }
  const failed = new URLSearchParams({ error: "google" });
  const next = nextParam(params.get("next") ?? undefined);
  if (next) failed.set("next", next);
  return NextResponse.redirect(new URL(`/login?${failed}`, request.url));
}
