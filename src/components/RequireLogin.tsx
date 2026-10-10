"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

/**
 * Client-side companion to the account layout's server check. The
 * server already sends guests to /login before rendering; this covers
 * the session ending while the page is open (logging out here or in
 * another tab), so the page doesn't keep showing account data.
 */
export default function RequireLogin({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, isPending, isLoggingOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const signedOut = !isPending && !isLoggedIn;

  // Logging out from the account menu navigates on its own (to /home);
  // only an unexpected end of the session sends the user to /login.
  useEffect(() => {
    if (signedOut && !isLoggingOut) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [signedOut, isLoggingOut, pathname, router]);

  if (signedOut) {
    return (
      <p className="py-20 text-center text-sm text-ink-muted" role="status">
        {isLoggingOut ? "Logging out…" : "Redirecting to log in…"}
      </p>
    );
  }

  return <>{children}</>;
}
