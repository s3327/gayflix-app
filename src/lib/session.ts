import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { adminAccess } from "@/lib/admin-access";
import { auth } from "@/lib/auth";

/**
 * The signed-in session for this request, or null. Server code only.
 * Cached per request, so a layout and a page can both ask for it with
 * one database lookup.
 */
export const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() })
);

/**
 * For account pages: sends guests to /login, which brings them back to
 * `returnTo` afterwards.
 */
export async function requireUser(returnTo: string) {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return session;
}

/**
 * For admin pages, server actions and API routes: only an admin who
 * signed in with two-factor in the last 12 hours gets through (see
 * adminAccess). Admins without two-factor go to set it up; everyone
 * else goes to the admin login page.
 */
export async function requireAdmin() {
  const session = await getSession();
  const access = adminAccess(session);
  if (access === "setup-2fa") redirect("/admin/setup-2fa");
  if (access !== "ok") redirect("/admin/login");
  return session!;
}
