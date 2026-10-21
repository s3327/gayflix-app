"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { User } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { useDropdown } from "@/lib/use-dropdown";
import { authHref } from "@/lib/safe-redirect";
import { useCurrentPath } from "@/lib/use-current-path";

/**
 * Header's account icon — branches on the real session (see
 * auth-context.tsx). Guests get a plain link to /login that comes back
 * to this page, query string included: no menu, no interactivity needed
 * for a single destination.
 *
 * Logged-in is where this earns being its own component: the icon
 * becomes a dropdown trigger with the account pages and Log Out, that
 * closes like SearchBox (see useDropdown) and on route change.
 */
const MENU_ITEMS = [
  { label: "My Account", href: "/account" },
  { label: "Favorites", href: "/account/favorite" },
  { label: "Watchlist", href: "/account/favorite?tab=watchlist" },
  { label: "My Lists", href: "/account/favorite?tab=lists" },
  { label: "History", href: "/account/history" },
  { label: "Settings", href: "/account/setting" },
];

export default function AccountMenu() {
  const { isLoggedIn, logout } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const here = useCurrentPath();
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
        href={authHref("/login", here)}
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
          {MENU_ITEMS.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setIsOpen(false)}
              className="block px-4 py-2.5 text-sm font-semibold text-ink-primary transition-colors hover:bg-bg-elevated focus-visible:-outline-offset-2"
            >
              {label}
            </Link>
          ))}
          <button
            type="button"
            onClick={handleLogout}
            className="block w-full border-t border-border-subtle px-4 py-2.5 text-left text-sm font-semibold text-status-error transition-colors hover:bg-bg-elevated focus-visible:-outline-offset-2"
          >
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}
