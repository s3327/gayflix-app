import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Gayflix Admin",
  description: "Internal admin panel for Gayflix.",
};

/**
 * Root layout for everything under /admin (served at admin.domain.com via
 * middleware rewrite). Intentionally does NOT import the public <Header/> —
 * the admin panel gets its own chrome (sidebar/topbar) once there's more
 * than a login page to wrap.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
