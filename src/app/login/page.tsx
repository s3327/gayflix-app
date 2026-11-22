import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { nextParam } from "@/lib/safe-redirect";
import { getPendingTwoFactorSession, getVerifiedSession } from "@/lib/session";
import { googleSignInEnabled } from "@/lib/supabase/server";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Log In",
  robots: { index: false, follow: false },
};

/**
 * Public log-in. `?next=` is the page to come back to, kept only when
 * it's a path on this site. A member who is already signed in goes
 * straight there, or home. `?error=google` is a Google sign-in that
 * didn't finish (src/app/auth/callback/route.ts). `?twoFactor=1` opens
 * on the two-factor code step, but only while a sign-in is waiting for
 * its code (after Google sign-in on an account with two-factor, or a
 * reload in the middle of signing in).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[]; twoFactor?: string | string[] }>;
}) {
  const params = await searchParams;
  const next = nextParam(params.next);
  // Checked against the database, like the account pages (requireUser),
  // so a device signed out elsewhere sees the form rather than a loop.
  if (await getVerifiedSession()) redirect(next ?? "/home");
  const twoFactor = params.twoFactor === "1" && (await getPendingTwoFactorSession()) !== null;
  return (
    <LoginForm
      next={next}
      google={await googleSignInEnabled()}
      googleFailed={params.error === "google"}
      twoFactor={twoFactor}
    />
  );
}
