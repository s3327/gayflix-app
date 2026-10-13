import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { checkAdminAccess } from "@/lib/admin-auth";

export const metadata: Metadata = {
  title: {
    template: "%s · Gayflix Admin",
    default: "Gayflix Admin",
  },
  description: "Internal admin panel for Gayflix.",
  robots: { index: false, follow: false },
};

/**
 * Root layout for everything under /admin (domain.com/admin). Intentionally
 * does NOT import the public <Header/> — the admin panel gets its own
 * chrome (sidebar) in (panel).
 *
 * The access check here repeats the one in src/proxy.ts on purpose: the
 * proxy is the front door, this is the second lock in case a request
 * ever reaches the page without passing through it.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  if (checkAdminAccess(requestHeaders.get("authorization")) !== "allowed") {
    notFound();
  }
  return <>{children}</>;
}
