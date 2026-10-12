"use client";

import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { primaryNavItems, filterNavItems, type NavMenuItem } from "@/components/nav-menu-items";
import { useDropdown } from "@/lib/use-dropdown";

function DrawerLink({ item, isActive }: { item: NavMenuItem; isActive: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={`border-b border-border-subtle py-3 text-sm font-semibold transition-colors last:border-b-0 ${
        isActive ? "text-ink-brand" : "text-ink-primary"
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
 * Closes like SearchBox and AccountMenu (see useDropdown), and on
 * route change.
 */
export default function MobileNavMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
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

  return (
    // Same "reserve the grid column, don't just display:none the
    // whole thing" placement as before — invisible (not hidden) at
    // md+, where NavMenu's links show, so Header's 3-column grid keeps
    // the logo centered.
    <div {...dropdown} className="flex md:invisible">
      <button
        ref={buttonRef}
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
        // Opens right under the header, which is taller from sm.
        <div className="fixed inset-x-0 top-16 z-40 max-h-[calc(100vh-4rem)] overflow-y-auto border-b border-border-subtle bg-bg-base shadow-xl sm:top-20 sm:max-h-[calc(100vh-5rem)] md:hidden">
          {/* pt-2: room for the first link's focus ring, which the
              drawer's top edge would otherwise cut off. */}
          <nav aria-label="Primary" className="flex flex-col px-4 pt-2">
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
