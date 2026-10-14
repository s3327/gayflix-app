import type { Metadata } from "next";
import Header from "@/components/Header";
import NavMenu from "@/components/NavMenu";
import Footer from "@/components/Footer";
import LibraryProviders from "@/components/LibraryProviders";
import { loadLibrary } from "@/lib/library";
import { SITE_NAME, SITE_TITLE } from "@/lib/page-metadata";
import { getSession } from "@/lib/session";
import { ToastProvider } from "@/lib/toast-context";

/**
 * Shared layout for the browsing experience — /home, /search, /browse,
 * the title pages and the account pages. The landing page at "/" lives
 * outside this group, with its own simpler header (src/app/page.tsx).
 *
 * Favorites/Lists/History/Toast providers live here (not higher up) so
 * this stuff only works within the signed-in app — same scope as
 * everything else that's account-specific. ToastProvider is outermost
 * since the library providers call useToast() internally.
 *
 * A signed-in user's favorites, lists and history are loaded here, on
 * the server, so pages render with them straight away.
 */
// Each page names itself in the browser tab ("Browse · Gayflix"); /home,
// and any page that doesn't, gets the full site title.
export const metadata: Metadata = {
  title: { default: SITE_TITLE, template: `%s · ${SITE_NAME}` },
};

import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { getSiteSettings } from "@/lib/site-settings";
import { isStaffRole } from "@/lib/admin-roles";

export default async function MainGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, settings] = await Promise.all([getSession(), getSiteSettings()]);
  const isAdmin = isStaffRole(session?.user?.role);

  if (settings.maintenanceMode && !isAdmin) {
    redirect("/maintenance");
  }

  const library = session ? await loadLibrary(session.user.id) : null;

  return (
    <ToastProvider>
      <LibraryProviders userId={session?.user.id ?? null} library={library}>
        {settings.maintenanceMode && isAdmin && (
          <div className="bg-status-warning/20 border-b border-status-warning/30 px-4 py-2 text-center text-xs font-semibold text-status-warning flex items-center justify-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Maintenance Mode is Active — Public visitors are redirected to the maintenance screen.</span>
          </div>
        )}
        <Header />
        <NavMenu />
        {children}
        <Footer />
      </LibraryProviders>
    </ToastProvider>
  );
}
