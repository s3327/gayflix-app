export type NavMenuItem = {
  label: string;
  href: string;
};

// The header's links (NavMenu, and MobileNavMenu on phones). Trending
// and Recently Added are New & Popular's See More, and in the footer. My
// List is the account's Favorites and Lists; a guest is asked to log in.
export const primaryNavItems: NavMenuItem[] = [
  { label: "Home", href: "/home" },
  { label: "Movies", href: "/movie" },
  { label: "Series", href: "/series" },
  { label: "New & Popular", href: "/new-popular" },
  { label: "Browse", href: "/browse" },
  { label: "My List", href: "/account/favorite" },
];
