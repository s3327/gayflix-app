import Header from "@/components/Header";
import NavMenu from "@/components/NavMenu";
import Footer from "@/components/Footer";
import LibraryProviders from "@/components/LibraryProviders";
import { loadLibrary } from "@/lib/library";
import { getSession } from "@/lib/session";
import { ToastProvider } from "@/lib/toast-context";

/**
 * Shared layout for the "signed-in app" experience — /home, /search, /user,
 * and future routes like /browse, /title/[id]. The marketing landing page
 * at "/" lives outside this group and does NOT get this header/nav/footer,
 * since it will likely want its own (simpler, or fully custom) treatment.
 *
 * Favorites/Lists/History/Toast providers live here (not higher up) so
 * this stuff only works within the signed-in app — same scope as
 * everything else that's account-specific. ToastProvider is outermost
 * since the library providers call useToast() internally.
 *
 * A signed-in user's favorites, lists and history are loaded here, on
 * the server, so pages render with them straight away.
 */
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
