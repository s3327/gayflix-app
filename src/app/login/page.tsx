import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { googleSignInEnabled } from "@/lib/auth";

import { nextParam } from "@/lib/safe-redirect";
import { getSession } from "@/lib/session";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Log In",
  robots: { index: false, follow: false },
};

/**
 * Public log-in. `?next=` is the page to come back to, kept only when
 * it's a path on this site. A member who is already signed in goes
 * straight there, or home.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const next = nextParam((await searchParams).next);
  if (await getSession()) redirect(next ?? "/home");
  return <LoginForm next={next} google={googleSignInEnabled} />;
}
