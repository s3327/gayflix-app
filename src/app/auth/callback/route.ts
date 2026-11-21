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
 *
 * An account with two-factor gets a session waiting for its code, which
 * counts as signed out until then (src/lib/session.ts): it goes to the
 * code step on /login (`twoFactor=1`), which comes back to `next`. If the
 * two-factor check itself fails, the session is ended, rather than let
 * through.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  if (code) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const destination = safeNextPath(params.get("next"), "/home");
      const { data: levels, error: levelsError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!levelsError && levels) {
        if (levels.nextLevel === "aal2" && levels.currentLevel !== "aal2") {
          const codeStep = new URLSearchParams({ twoFactor: "1", next: destination });
          return NextResponse.redirect(new URL(`/login?${codeStep}`, request.url));
        }
        return NextResponse.redirect(new URL(destination, request.url));
      }
      await supabase.auth.signOut({ scope: "local" });
    }
  }
  const failed = new URLSearchParams({ error: "google" });
  const next = nextParam(params.get("next") ?? undefined);
  if (next) failed.set("next", next);
  return NextResponse.redirect(new URL(`/login?${failed}`, request.url));
}
