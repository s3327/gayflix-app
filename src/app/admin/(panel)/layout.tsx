import Sidebar from "@/components/admin/Sidebar";
import { requireAdmin } from "@/lib/session";

/**
 * Wraps every "real" admin page (dashboard, import, library, upload,
 * users, trash, setting) with the persistent left sidebar. Login and
 * forgot-password live outside this group, so they stay full-screen
 * with no sidebar.
 *
 * Only accounts with the "admin" role get past this layout; anyone else
 * is sent to /admin/login. Server actions and API routes that change
 * admin data must call requireAdmin() themselves, since a layout doesn't
 * run for them.
 */
export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <div className="flex min-h-screen bg-bg-base">
      <Sidebar />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
