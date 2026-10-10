"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { primaryNavItems, filterNavItems, type NavMenuItem } from "@/components/nav-menu-items";

function NavLink({ item, isActive }: { item: NavMenuItem; isActive: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={`shrink-0 text-xs font-semibold transition-colors lg:text-sm ${
        isActive ? "text-ink-brand" : "text-ink-secondary hover:text-ink-primary"
      }`}
    >
      {item.label}
    </Link>
  );
}

/**
 * Two clusters, not one flat row: primary browsing (Home/Trending/New
 * Releases/Browse/Movies/Series) on the left, facet-based browsing
 * (Genre/Country/Year/Language) on the right. `justify-between` pushes
 * them to opposite ends when there's room (lg+, where the 1440px
 * container has plenty of width); the explicit `gap-8` is the fallback
 * for when there isn't — on narrower widths (sm–lg) the two clusters
 * just sit side by side with normal spacing instead of being crushed
 * together, and the whole row already scrolls horizontally
 * (overflow-x-auto) rather than wrapping, same as before.
 */
export default function NavMenu() {
  const pathname = usePathname();

  return (
    // Hidden entirely on mobile — the header's hamburger menu takes
    // over navigation at that size instead (see MobileNavMenu.tsx).
    // Sticks directly under the header's own sticky position.
    <div className="sticky top-16 z-40 hidden border-b border-border-subtle bg-bg-base/95 backdrop-blur-sm sm:block sm:top-20">
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 overflow-x-auto px-4 py-3 scrollbar-none sm:px-8"
      >
        <div className="flex shrink-0 gap-6 sm:gap-8">
          {primaryNavItems.map((item) => (
            <NavLink key={item.href} item={item} isActive={pathname === item.href} />
          ))}
        </div>
        <div className="flex shrink-0 gap-6 sm:gap-8">
          {filterNavItems.map((item) => (
            <NavLink key={item.href} item={item} isActive={pathname === item.href} />
          ))}
        </div>
      </nav>
    </div>
  );
}
