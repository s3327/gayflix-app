import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { nextParam } from "@/lib/safe-redirect";
import { getVerifiedSession } from "@/lib/session";
import { googleSignInEnabled } from "@/lib/supabase/server";
import SignupForm from "./SignupForm";

export const metadata: Metadata = {
  title: "Sign Up",
  robots: { index: false, follow: false },
};

/**
 * Public sign-up. `?next=` is the page to come back to once the email is
 * confirmed, kept only when it's a path on this site. A member who is
 * already signed in goes straight there, or home.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const next = nextParam((await searchParams).next);
  // Checked against the database, like the account pages (requireUser),
  // so a device signed out elsewhere sees the form rather than a loop.
  if (await getVerifiedSession()) redirect(next ?? "/home");
  return <SignupForm next={next} google={await googleSignInEnabled()} />;
}
