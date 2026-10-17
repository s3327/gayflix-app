"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { primaryNavItems, type NavMenuItem } from "@/components/nav-menu-items";

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
 * One row of links: Home, Trending, New Releases, Browse (where genre,
 * country, year and language are filters), Movies and Series.
 *
 * Shown from md (768px, a portrait tablet), where every link fits on
 * one line with the tighter md gaps. Below that the links would run
 * off the edge, so phones and small tablets use the header's menu
 * button instead (MobileNavMenu). overflow-x-auto stays as a safety
 * net for unusually long labels.
 */
export default function NavMenu() {
  const pathname = usePathname();

  return (
    // Hidden below md — the header's hamburger menu takes over
    // navigation at that size instead (see MobileNavMenu.tsx).
    // Sticks directly under the header's own sticky position.
    <div className="sticky top-16 z-40 hidden border-b border-border-subtle bg-bg-base/95 backdrop-blur-sm sm:top-20 md:block">
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-[1440px] items-center gap-6 overflow-x-auto px-4 py-3 scrollbar-none sm:px-8 lg:gap-8"
      >
        {primaryNavItems.map((item) => (
          <NavLink key={item.href} item={item} isActive={pathname === item.href} />
        ))}
      </nav>
    </div>
  );
}
