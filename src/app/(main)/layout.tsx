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

export default async function MainGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const library = session ? await loadLibrary(session.user.id) : null;

  return (
    <ToastProvider>
      <LibraryProviders userId={session?.user.id ?? null} library={library}>
        <Header />
        <NavMenu />
        {children}
        <Footer />
      </LibraryProviders>
    </ToastProvider>
  );
}
