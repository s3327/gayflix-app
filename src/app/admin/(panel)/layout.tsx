import Sidebar from "@/components/admin/Sidebar";
import AdminFlashBanner from "@/components/admin/AdminFlashBanner";
import SessionWarningBanner from "@/components/admin/SessionWarningBanner";
import { ADMIN_SESSION_MAX_AGE_MS } from "@/lib/admin-access";
import { getAdminFlash } from "@/lib/admin-flash";
import { requireAdmin } from "@/lib/session";

/**
 * Wraps every "real" admin page (dashboard, import, library, upload,
 * users, trash, setting) with the persistent left sidebar (a top bar on
 * phones). Login and forgot-password live outside this group, so they stay full-screen
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
  const session = await requireAdmin();
  const sessionExpiresAt = new Date(
    new Date(session.session.createdAt).getTime() + ADMIN_SESSION_MAX_AGE_MS
  ).toISOString();
  const flash = await getAdminFlash();

  return (
    // A column on phones (the navigation is a bar across the top), a row
    // from md up (a sidebar).
    <div className="flex min-h-screen flex-col bg-bg-base md:flex-row">
      <Sidebar
        adminUser={{
          name: session.user.name,
          email: session.user.email,
          sessionExpiresAt,
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <SessionWarningBanner sessionExpiresAt={sessionExpiresAt} />
        <AdminFlashBanner flash={flash} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
