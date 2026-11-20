import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { nextParam } from "@/lib/safe-redirect";
import { getSession } from "@/lib/session";
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
 * didn't finish (src/app/auth/callback/route.ts).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>;
}) {
  const params = await searchParams;
  const next = nextParam(params.next);
  if (await getSession()) redirect(next ?? "/home");
  return (
    <LoginForm next={next} google={await googleSignInEnabled()} googleFailed={params.error === "google"} />
  );
}
