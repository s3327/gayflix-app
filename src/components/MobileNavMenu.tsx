"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { primaryNavItems, filterNavItems, type NavMenuItem } from "@/components/nav-menu-items";

function DrawerLink({ item, isActive }: { item: NavMenuItem; isActive: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={`border-b border-border-subtle py-3 text-sm font-semibold transition-colors last:border-b-0 ${
        isActive ? "text-brand-pink" : "text-ink-primary"
      }`}
    >
      {item.label}
    </Link>
  );
}

/**
 * Takes over navigation on mobile, where NavMenu hides its links
 * entirely (see NavMenu.tsx) — same left/right split as the desktop
 * strip, just stacked as two sections instead of two side-by-side
 * clusters, since there's no width to spare for side-by-side at this
 * size.
 *
 * Same open/outside-click/Escape/route-change-closes pattern as
 * SearchBox and AccountMenu.
 */
export default function MobileNavMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
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

  return (
    // Same "reserve the grid column, don't just display:none the
    // whole thing" placement as before — invisible (not hidden) at
    // sm+ so Header's 3-column grid keeps the logo centered.
    <div ref={containerRef} className="flex sm:invisible">
      <button
        type="button"
        aria-label={isOpen ? "Close menu" : "Open menu"}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="flex h-10 w-10 items-center justify-center rounded-full text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary"
      >
        {isOpen ? (
          <X className="h-5 w-5" strokeWidth={2} />
        ) : (
          <Menu className="h-5 w-5" strokeWidth={2} />
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-x-0 top-16 z-40 max-h-[calc(100vh-4rem)] overflow-y-auto border-b border-border-subtle bg-bg-base shadow-xl sm:hidden">
          <nav aria-label="Primary" className="flex flex-col px-4">
            {primaryNavItems.map((item) => (
              <DrawerLink key={item.href} item={item} isActive={pathname === item.href} />
            ))}
          </nav>

          <p className="border-t border-border-subtle px-4 pt-4 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Discover
          </p>
          <nav aria-label="Filter by" className="flex flex-col px-4 pb-2">
            {filterNavItems.map((item) => (
              <DrawerLink key={item.href} item={item} isActive={pathname === item.href} />
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
