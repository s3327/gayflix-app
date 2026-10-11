"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { User } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { useDropdown } from "@/lib/use-dropdown";

/**
 * Header's account icon — branches on the real session (see
 * auth-context.tsx). Guests get a plain link straight to /login,
 * same as clicking Search used to just link to /search: no menu, no
 * interactivity needed for a single destination.
 *
 * Logged-in is where this earns being its own component: the icon
 * becomes a dropdown trigger with two items, My Account and Log Out,
 * that closes like SearchBox (see useDropdown) and on route change.
 */
export default function AccountMenu() {
  const { isLoggedIn, logout } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdown = useDropdown(isOpen, setIsOpen, buttonRef);

  // Close whenever the route changes. Done during render (React's
  // "adjusting state when a prop changes" pattern) rather than in an
  // effect, so there's no extra render with the menu still open.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setIsOpen(false);
  }

  async function handleLogout() {
    setIsOpen(false);
    await logout();
    showToast("Logged out");
    router.push("/home");
  }

  if (!isLoggedIn) {
    return (
      <Link
        href="/login"
        aria-label="Log in"
        className="flex h-10 w-10 items-center justify-center rounded-full text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary"
      >
        <User className="h-5 w-5" strokeWidth={2} />
      </Link>
    );
  }

  return (
    <div {...dropdown} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Account menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="flex h-10 w-10 items-center justify-center rounded-full text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary"
      >
        <User className="h-5 w-5" strokeWidth={2} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-card border border-border-subtle bg-bg-surface py-1 shadow-xl">
          {/* The panel clips anything outside it, so these items draw
              their focus ring inside their edges instead. */}
          <Link
            href="/account"
            className="block px-4 py-2.5 text-sm font-semibold text-ink-primary transition-colors hover:bg-bg-elevated focus-visible:-outline-offset-2"
          >
            My Account
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="block w-full px-4 py-2.5 text-left text-sm font-semibold text-status-error transition-colors hover:bg-bg-elevated focus-visible:-outline-offset-2"
          >
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}
