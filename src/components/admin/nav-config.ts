import {
  Flag,
  LayoutDashboard,
  Import,
  Library,
  PlusCircle,
  Users,
  Trash2,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavLink = {
  type: "link";
  label: string;
  href: string;
  icon: LucideIcon;
};

export type NavGroup = {
  type: "group";
  label: string;
  icon: LucideIcon;
  /** Any route under this path counts as "inside" the group, for active styling. */
  basePath: string;
  children: { label: string; href: string }[];
};

export type NavEntry = NavLink | NavGroup;

export const adminNav: NavEntry[] = [
  { type: "link", label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { type: "link", label: "Import", href: "/admin/import", icon: Import },
  {
    type: "group",
    label: "Library",
    icon: Library,
    basePath: "/admin/library",
    children: [
      { label: "Movies", href: "/admin/library/movies" },
      { label: "Series", href: "/admin/library/series" },
      { label: "Episodes", href: "/admin/library/episodes" },
    ],
  },
  {
    type: "group",
    label: "Add",
    icon: PlusCircle,
    basePath: "/admin/upload",
    children: [
      { label: "Movies", href: "/admin/upload/movies" },
      { label: "Series", href: "/admin/upload/series" },
      { label: "Episodes", href: "/admin/upload/episodes" },
    ],
  },
  { type: "link", label: "Users", href: "/admin/users", icon: Users },
  { type: "link", label: "Reports", href: "/admin/reports", icon: Flag },
  { type: "link", label: "Trash", href: "/admin/trash", icon: Trash2 },
  { type: "link", label: "Settings", href: "/admin/setting", icon: Settings },
];
