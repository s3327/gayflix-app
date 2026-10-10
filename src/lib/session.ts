import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";

/**
 * The signed-in session for this request, or null. Server code only.
 * Cached per request, so a layout and a page can both ask for it with
 * one database lookup.
 */
export const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() })
);

export function isAdmin(session: Awaited<ReturnType<typeof getSession>>): boolean {
  return session?.user.role === "admin";
}

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
 * For admin pages, server actions and API routes: only accounts with the
 * "admin" role get through. Everyone else goes to the admin login page.
 */
export async function requireAdmin() {
  const session = await getSession();
  if (!isAdmin(session)) redirect("/admin/login");
  return session!;
}
