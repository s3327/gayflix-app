export type NavMenuItem = {
  label: string;
  href: string;
};

// Left cluster — primary browsing entry points.
export const primaryNavItems: NavMenuItem[] = [
  { label: "Home", href: "/home" },
  { label: "Trending", href: "/trending" },
  { label: "New Releases", href: "/new-releases" },
  { label: "Browse", href: "/browse" },
  { label: "Movies", href: "/movie" },
  { label: "Series", href: "/series" },
];

// Right cluster — filter/facet-based browsing.
export const filterNavItems: NavMenuItem[] = [
  { label: "Genre", href: "/genre" },
  { label: "Country", href: "/country" },
  { label: "Year", href: "/year" },
  { label: "Language", href: "/language" },
];
