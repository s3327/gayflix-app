import Header from "@/components/Header";
import NavMenu from "@/components/NavMenu";
import Footer from "@/components/Footer";
import { ToastProvider } from "@/lib/toast-context";
import { FavoritesProvider } from "@/lib/favorites-context";
import { ListsProvider } from "@/lib/lists-context";
import { HistoryProvider } from "@/lib/history-context";

/**
 * Shared layout for the "signed-in app" experience — /home, /search, /user,
 * and future routes like /browse, /title/[id]. The marketing landing page
 * at "/" lives outside this group and does NOT get this header/nav/footer,
 * since it will likely want its own (simpler, or fully custom) treatment.
 *
 * Favorites/Lists/History/Toast providers live here (not higher up) so
 * this stuff only works within the signed-in app — same scope as
 * everything else that's account-specific. ToastProvider is outermost
 * since ListsProvider calls useToast() internally.
 */
export default function MainGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <FavoritesProvider>
        <ListsProvider>
          <HistoryProvider>
            <Header />
            <NavMenu />
            {children}
            <Footer />
          </HistoryProvider>
        </ListsProvider>
      </FavoritesProvider>
    </ToastProvider>
  );
}
