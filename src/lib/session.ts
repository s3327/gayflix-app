import type { JwtPayload } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { adminAccess } from "@/lib/admin-access";
import { readAuthProfile } from "@/lib/auth-profile";
import { hasSupabaseAuthCookie } from "@/lib/supabase/config";
import { createServerSupabase } from "@/lib/supabase/server";

/** The signed-in user of a request, as server code sees it. */
export type AppSession = {
  user: {
    id: string;
    email: string;
    /** "user", or a staff role (src/lib/admin-roles.ts). */
    role: string;
    /** The display name from the account's metadata, if it has one. */
    name: string | null;
  };
  /** Supabase Auth's session id (the token's `session_id`). */
  sessionId: string;
  /** "aal2" once the session passed two-factor. */
  aal: "aal1" | "aal2";
  /** When the session last passed TOTP two-factor (ms since epoch), or null. */
  totpVerifiedAt: number | null;
  /** When the session started: its first sign-in (ms since epoch). */
  createdAt: number;
  /**
   * Whether the account has a verified TOTP factor. Only
   * getVerifiedSession() looks it up (getPendingTwoFactorSession() knows
   * it from the token); getSession() always says false.
   */
  hasVerifiedTotp: boolean;
};

/** The token's `amr` entries that carry a time, as [method, ms]. */
function signInTimes(claims: JwtPayload): [string, number][] {
  if (!Array.isArray(claims.amr)) return [];
  return claims.amr.flatMap((entry) =>
    typeof entry === "object" && entry !== null && Number.isFinite(entry.timestamp)
      ? [[String(entry.method), entry.timestamp * 1000] as [string, number]]
      : []
  );
}

function sessionFromClaims(claims: JwtPayload, role: string, hasVerifiedTotp: boolean): AppSession {
  const times = signInTimes(claims);
  const totpTimes = times.filter(([method]) => method === "totp").map(([, at]) => at);
  const name = claims.user_metadata?.name;
  return {
    user: {
      id: claims.sub,
      email: typeof claims.email === "string" ? claims.email : "",
      role,
      name: typeof name === "string" && name.trim() ? name : null,
    },
    sessionId: claims.session_id,
    aal: claims.aal === "aal2" ? "aal2" : "aal1",
    totpVerifiedAt: totpTimes.length > 0 ? Math.max(...totpTimes) : null,
    // The session's start is its earliest `amr` time: Supabase Auth keeps
    // those across token refreshes (checked on the local stack), unlike
    // `iat`, which is the latest refresh. A token without timed `amr`
    // entries counts as started at 0, so the admin 12-hour rule
    // (src/lib/admin-access.ts) refuses it rather than trusting `iat`.
    createdAt: times.length > 0 ? Math.min(...times.map(([, at]) => at)) : 0,
    hasVerifiedTotp,
  };
}

/** The request's verified token claims, or null for a guest. */
async function readClaims(): Promise<JwtPayload | null> {
  // A guest has no Supabase cookies: nothing to check.
  if (!hasSupabaseAuthCookie((await cookies()).getAll())) return null;
  const supabase = await createServerSupabase();
  // Checks the token's signature locally against the project's signing
  // keys (cached), with no database read.
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return data.claims;
}

/**
 * Whether the token is a sign-in still waiting for its two-factor code:
 * password only (aal1), on an account with a verified TOTP factor (the
 * `has_totp` claim, from custom_access_token_hook). signIn keeps such a
 * session so verifyTwoFactor can raise it to aal2; until then it counts
 * as signed out.
 */
function awaitingTwoFactor(claims: JwtPayload): boolean {
  return claims.aal !== "aal2" && claims.has_totp === true;
}

function claimedRole(claims: JwtPayload): string {
  return typeof claims.user_role === "string" ? claims.user_role : "user";
}

/**
 * The signed-in session for this request, or null. Server code only.
 * Read from the session cookie's verified token, without a database
 * read, and cached per request. The role is the token's `user_role`
 * claim, which can be up to an hour stale: fine for showing things,
 * never for admin access (that's getVerifiedSession()). A sign-in still
 * waiting for its two-factor code is null here.
 */
export const getSession = cache(async (): Promise<AppSession | null> => {
  const claims = await readClaims();
  if (!claims || awaitingTwoFactor(claims)) return null;
  return sessionFromClaims(claims, claimedRole(claims), false);
});

/**
 * The sign-in waiting for its two-factor code, or null when there's no
 * such session (a guest, or a session that is fully signed in). Only
 * verifyTwoFactor (src/lib/two-factor-actions.ts) may use it: everything
 * else must treat that session as signed out.
 */
export async function getPendingTwoFactorSession(): Promise<AppSession | null> {
  const claims = await readClaims();
  if (!claims || !awaitingTwoFactor(claims)) return null;
  return sessionFromClaims(claims, claimedRole(claims), true);
}

/**
 * Like getSession(), but checked against the database, so admin access
 * decisions see a sign-out, ban or role change at once, not when the
 * token expires (up to an hour later). Null unless the token's session
 * still exists in Supabase Auth, the account isn't banned, and it has a
 * profile row; the role (and whether the account has two-factor) comes
 * from the database (src/lib/auth-profile.ts). Like getSession(), null
 * for a sign-in waiting for its two-factor code, judged by the database
 * (a password-only session of an account that has a verified factor),
 * not by the token's possibly stale `has_totp`.
 */
export const getVerifiedSession = cache(async (): Promise<AppSession | null> => {
  const claims = await readClaims();
  if (!claims || typeof claims.session_id !== "string") return null;
  const profile = await readAuthProfile(claims.sub, claims.session_id);
  if (!profile) return null;
  if (profile.hasVerifiedTotp && claims.aal !== "aal2") return null;
  return sessionFromClaims(claims, profile.role, profile.hasVerifiedTotp);
});

/**
 * For account pages: sends guests to /login, which brings them back to
 * `returnTo` afterwards.
 */
export async function requireUser(returnTo: string): Promise<AppSession> {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return session;
}

/**
 * For admin pages, server actions and API routes: only staff (per the
 * database) who passed two-factor in the last 12 hours get through (see
 * adminAccess). Staff without two-factor go to set it up when it's
 * required; everyone else goes to the admin login page.
 */
export async function requireAdmin(): Promise<AppSession> {
  const session = await getVerifiedSession();
  const access = adminAccess(session);
  if (access === "setup-2fa") redirect("/admin/setup-2fa");
  if (access !== "ok") {
    const h = await headers();
    const pathname = h.get("x-pathname");
    if (pathname && pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
      redirect(`/admin/login?next=${encodeURIComponent(pathname)}`);
    }
    redirect("/admin/login");
  }
  return session!;
}
