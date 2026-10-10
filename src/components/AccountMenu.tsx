"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { User } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";

/**
 * Header's account icon — branches on real login state now (see
 * auth-context.tsx). Guests get a plain link straight to /login,
 * same as clicking Search used to just link to /search: no menu, no
 * interactivity needed for a single destination.
 *
 * Logged-in is where this earns being its own component: the icon
 * becomes a dropdown trigger with two items, My Account and Log Out,
 * same open/outside-click/Escape/route-change-closes pattern as
 * SearchBox.
 */
export default function AccountMenu() {
  const { isLoggedIn, logout } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close whenever the route changes. Done during render (React's
  // "adjusting state when a prop changes" pattern) rather than in an
  // effect, so there's no extra render with the menu still open.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setIsOpen(false);
  }

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  function handleLogout() {
    logout();
    setIsOpen(false);
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
    <div ref={containerRef} className="relative">
      <button
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
          <Link
            href="/account"
            className="block px-4 py-2.5 text-sm font-semibold text-ink-primary transition-colors hover:bg-bg-elevated"
          >
            My Account
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="block w-full px-4 py-2.5 text-left text-sm font-semibold text-status-error transition-colors hover:bg-bg-elevated"
          >
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}
