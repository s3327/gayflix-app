import Link from "next/link";

/**
 * Shared pill styling for both variants below — capitalize is harmless
 * on already-capitalized text (genre/country/language names, "All",
 * numeric years), so it's applied unconditionally rather than only
 * where it was originally needed (Browse/Trending's lowercase
 * "movie"/"series" labels).
 */
const chipClassName = (isActive: boolean) =>
  `rounded-pill px-4 py-1.5 text-xs font-semibold capitalize transition-colors ${
    isActive
      ? "bg-brand-pink text-ink-onBrand"
      : "border border-border-strong text-ink-secondary hover:bg-bg-elevated hover:text-ink-primary"
  }`;

/**
 * URL-based filter chip — used by Genre/Country/Year/Language/Browse/
 * Trending, all of which encode the active filter in the query string
 * so a Server Component can read it from `searchParams`.
 */
export function FilterChipLink({
  href,
  isActive,
  children,
}: {
  href: string;
  isActive: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} aria-pressed={isActive} className={chipClassName(isActive)}>
      {children}
    </Link>
  );
}

/**
 * Local-state filter chip — for chip-style toggles that aren't URL-
 * driven, like /account/favorite's Favorites/My Lists tab switcher.
 */
export function FilterChipButton({
  onClick,
  isActive,
  children,
}: {
  onClick: () => void;
  isActive: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={chipClassName(isActive)}
    >
      {children}
    </button>
  );
}
