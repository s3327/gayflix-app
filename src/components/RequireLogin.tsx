"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useHydrated } from "@/lib/use-hydrated";

/**
 * Sends guests to /login (and back here afterwards) instead of showing
 * them account pages.
 *
 * This is a UX guard, not security: login state is still a localStorage
 * flag (see auth-context.tsx), so it can't protect anything sensitive.
 * Once real sessions exist, the same check belongs on the server (the
 * account layout reading the session cookie), with this kept only to
 * avoid a flash of content.
 */
export default function RequireLogin({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useAuth();
  const hydrated = useHydrated();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (hydrated && !isLoggedIn) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [hydrated, isLoggedIn, pathname, router]);

  if (!hydrated || !isLoggedIn) {
    return (
      <p className="py-20 text-center text-sm text-ink-muted" role="status">
        {hydrated ? "Redirecting to log in…" : "Loading…"}
      </p>
    );
  }

  return <>{children}</>;
}
