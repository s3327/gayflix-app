"use client";

import { useAuth } from "@/lib/auth-context";
import { FavoritesProvider } from "@/lib/favorites-context";
import { HistoryProvider } from "@/lib/history-context";
import type { Library } from "@/lib/library-types";
import { ListsProvider } from "@/lib/lists-context";

/**
 * Favorites, Lists and History for whoever is signed in. `library` is
 * what the server loaded for `userId` while rendering the (main) layout.
 *
 * The layout stays mounted across client-side navigation, so when the
 * session ends (logging out) the providers are re-keyed and start over
 * as a guest's, instead of keeping the previous user's data on screen.
 */
export default function LibraryProviders({
  userId,
  library,
  children,
}: {
  userId: string | null;
  library: Library | null;
  children: React.ReactNode;
}) {
  const { user, isPending } = useAuth();
  const activeUserId = isPending ? userId : (user?.id ?? null);
  const initial = activeUserId !== null && activeUserId === userId ? library : null;
  const key = activeUserId ?? "guest";

  return (
    <FavoritesProvider key={`favorites-${key}`} userId={activeUserId} initial={initial?.favorites}>
      <ListsProvider key={`lists-${key}`} userId={activeUserId} initial={initial?.lists}>
        <HistoryProvider key={`history-${key}`} userId={activeUserId} initial={initial?.history}>
          {children}
        </HistoryProvider>
      </ListsProvider>
    </FavoritesProvider>
  );
}
