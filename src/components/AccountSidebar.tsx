"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Heart, History, Settings } from "lucide-react";

const ACCOUNT_NAV_ITEMS = [
  { label: "Account", href: "/account", icon: User },
  { label: "Favorite", href: "/account/favorite", icon: Heart },
  { label: "History", href: "/account/history", icon: History },
  { label: "Setting", href: "/account/setting", icon: Settings },
  // Billing intentionally left out — comes later once the site and
  // backend are solid enough to actually support it. Don't add it back
  // here without a real page + route behind it.
];

/**
 * Left nav for the /account section. Its own bordered box (not a bar
 * flush under Header) — sits alongside the content column inside the
 * same padded max-width container every other page uses, so Header
 * stays exactly as-is above it.
 *
 * Client Component only because of usePathname for active-item
 * highlighting; everything else here is static.
 */
export default function AccountSidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Account"
      className="w-full shrink-0 rounded-card border border-border-subtle bg-bg-surface p-3 md:w-56"
    >
      {/* Below md, four equal tabs (icon over label) across the top,
          so all of them fit on a phone without scrolling sideways; from
          md, a column beside the content. */}
      <ul className="grid grid-cols-4 gap-1 md:flex md:flex-col">
        {ACCOUNT_NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <li key={href}>
              {/* Focus ring inside the edges, clear of the box around it. */}
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={`flex flex-col items-center gap-1 rounded-md px-1 py-2 text-xs font-semibold transition-colors focus-visible:-outline-offset-2 md:flex-row md:gap-2.5 md:px-3 md:py-2.5 md:text-sm ${
                  isActive
                    ? "bg-brand-pink text-ink-onBrand"
                    : "text-ink-secondary hover:bg-bg-elevated hover:text-ink-primary"
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
