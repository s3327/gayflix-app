"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { adminNav, type NavEntry } from "@/components/admin/nav-config";

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-border-subtle bg-bg-surface transition-[width] duration-200 ${
        collapsed ? "w-24" : "w-64"
      }`}
    >
      {/* Logo + collapse toggle, same row */}
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-3">
        <div className="flex min-w-0 items-center gap-3">
          <Image
            src="/brand/gayflix-icon.png"
            alt="Gayflix"
            width={500}
            height={500}
            className="h-8 w-8 shrink-0"
          />
          {!collapsed && (
            <span className="truncate font-display text-lg font-bold">
              gayflix
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {adminNav.map((entry) => (
          <NavItem
            key={entry.label}
            entry={entry}
            pathname={pathname}
            collapsed={collapsed}
          />
        ))}
      </nav>
    </aside>
  );
}

function NavItem({
  entry,
  pathname,
  collapsed,
}: {
  entry: NavEntry;
  pathname: string;
  collapsed: boolean;
}) {
  const [open, setOpen] = useState(
    entry.type === "group" ? pathname.startsWith(entry.basePath) : false
  );

  if (entry.type === "link") {
    const isCurrent = pathname === entry.href;
    // A user's page (/admin/users/<id>) highlights Users.
    const isActive = isCurrent || pathname.startsWith(`${entry.href}/`);
    const Icon = entry.icon;
    return (
      <Link
        href={entry.href}
        aria-current={isCurrent ? "page" : undefined}
        className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
          collapsed ? "justify-center" : ""
        } ${
          isActive
            ? "bg-brand-pink/10 font-semibold text-ink-brand"
            : "text-ink-secondary hover:bg-bg-elevated hover:text-ink-primary"
        }`}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
        {!collapsed && <span className="truncate">{entry.label}</span>}
      </Link>
    );
  }

  // Group (Library / Upload)
  const isInsideGroup = pathname.startsWith(entry.basePath);
  const Icon = entry.icon;

  // If the sidebar collapses, close the dropdown so it doesn't render
  // orphaned sub-items with no group label above them. (Safe to call
  // during render — React re-renders once more with the corrected value.)
  if (collapsed && open) setOpen(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => !collapsed && setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
          collapsed ? "justify-center" : ""
        } ${
          isInsideGroup
            ? "text-ink-primary"
            : "text-ink-secondary hover:bg-bg-elevated hover:text-ink-primary"
        } ${isInsideGroup && !open ? "bg-bg-elevated" : ""}`}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
        {!collapsed && (
          <>
            <span className="flex-1 truncate text-left">{entry.label}</span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 transition-transform ${
                open ? "rotate-180" : ""
              }`}
            />
          </>
        )}
      </button>

      {!collapsed && open && (
        <div className="ml-[22px] mt-1 flex flex-col gap-0.5 border-l border-border-subtle pl-4">
          {entry.children.map((child) => {
            const isCurrent = pathname === child.href;
            // An edit page (/admin/library/movies/<id>) highlights its list.
            const isActive = isCurrent || pathname.startsWith(`${child.href}/`);
            return (
              <Link
                key={child.href}
                href={child.href}
                aria-current={isCurrent ? "page" : undefined}
                className={`rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-brand-pink/10 font-semibold text-ink-brand"
                    : "text-ink-secondary hover:bg-bg-elevated hover:text-ink-primary"
                }`}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
