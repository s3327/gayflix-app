import Sidebar from "@/components/admin/Sidebar";

/**
 * Wraps every "real" admin page (dashboard, import, library, upload,
 * users, trash, setting) with the persistent left sidebar. Login and
 * forgot-password live outside this group, so they stay full-screen
 * with no sidebar.
 */
export default function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-bg-base">
      <Sidebar />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
