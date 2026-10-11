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
      <ul
        // On mobile the list scrolls sideways, and Chrome leaves a
        // keyboard-focused item that's partly out of view where it is.
        // Bring it fully in. (Not on a click: the item would move away
        // from under the pointer.)
        onFocus={(event) => {
          if (event.target.matches(":focus-visible")) {
            event.target.scrollIntoView({ block: "nearest", inline: "nearest" });
          }
        }}
        className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible"
      >
        {ACCOUNT_NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <li key={href} className="shrink-0 md:shrink">
              {/* Focus ring inside the edges: on mobile the list scrolls
                  sideways and clips anything outside it. */}
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:-outline-offset-2 ${
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
