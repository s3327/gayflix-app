import Link from "next/link";
import Image from "next/image";
import SearchBox from "@/components/SearchBox";
import AccountMenu from "@/components/AccountMenu";
import MobileNavMenu from "@/components/MobileNavMenu";

/**
 * Global site header. Rendered once from the (main) group layout so it
 * persists across every page in that group. NavMenu sits directly below
 * it — a separate component, not nested inside Header, so the two stay
 * independently reusable.
 *
 * Responsive behavior:
 * - Desktop (lg+): full "gayflix" tagline lockup, centered
 * - Tablet (sm–lg): icon-only logo, centered — NavMenu's links remain
 *   visible below at a smaller size (see NavMenu.tsx)
 * - Mobile (<sm): icon-only logo stays centered; the reserved left slot
 *   is MobileNavMenu's hamburger button, which opens a drawer with every
 *   nav link — NavMenu hides its links entirely at this size
 * - Search/account icons are icon-only at every size — no label text,
 *   by design, not just at narrower widths
 */
export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border-subtle bg-bg-base/95 backdrop-blur-sm">
      <div className="mx-auto grid h-16 max-w-[1440px] grid-cols-[1fr_auto_1fr] items-center px-4 sm:h-20 sm:px-8">
        {/* Left: hamburger menu, mobile only — opens MobileNavMenu's
            drawer. invisible (not hidden) on purpose: this is a grid
            item in the 3-column layout below. display:none would
            remove it from grid placement entirely at sm+, collapsing
            3 columns down to 2 and shoving the logo left instead of
            keeping it centered. visibility:hidden keeps its column's
            space reserved while just not rendering it visually. */}
        <MobileNavMenu />

        {/* Logo — centered regardless of what's in the side columns.
            Two images swapped via CSS, not JS: icon-only below lg,
            full lockup at lg+. */}
        <Link
          href="/"
          aria-label="Gayflix home"
          className="shrink-0 justify-self-center rounded-xs"
        >
          <Image
            src="/brand/gayflix-icon.png"
            alt="Gayflix"
            width={500}
            height={500}
            priority
            className="block h-9 w-9 sm:h-10 sm:w-10 lg:hidden"
          />
          <Image
            src="/brand/gayflix-logo-tagline.png"
            alt="Gayflix — Love. Stories. Ours."
            width={600}
            height={600}
            priority
            className="hidden h-14 w-auto lg:block"
          />
        </Link>

        {/* Actions — icon-only at every breakpoint */}
        <nav aria-label="Account" className="flex items-center justify-self-end gap-1 sm:gap-2">
          <SearchBox />
          <AccountMenu />
        </nav>
      </div>
    </header>
  );
}
