export type NavMenuItem = {
  label: string;
  href: string;
};

// The header's links (NavMenu, and MobileNavMenu on phones).
export const primaryNavItems: NavMenuItem[] = [
  { label: "Home", href: "/home" },
  { label: "Trending", href: "/trending" },
  { label: "New Releases", href: "/new-releases" },
  { label: "Browse", href: "/browse" },
  { label: "Movies", href: "/movie" },
  { label: "Series", href: "/series" },
];
