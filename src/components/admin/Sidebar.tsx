"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { adminNav, type NavEntry } from "@/components/admin/nav-config";
import { useDropdown } from "@/lib/use-dropdown";

/**
 * The admin panel's navigation: a sidebar on tablets and up, and on
 * phones, where a sidebar would leave the page no room, a bar across the
 * top with the same links in a menu.
 */
export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      <PhoneBar pathname={pathname} />
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border-subtle bg-bg-surface transition-[width] duration-200 md:flex ${
          collapsed ? "w-24" : "w-64"
        }`}
      >
        {/* Logo + collapse toggle, same row */}
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-3">
          <Brand showName={!collapsed} />

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
        <nav aria-label="Admin" className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
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
    </>
  );
}

function Brand({ showName }: { showName: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Image
        src="/brand/gayflix-icon.png"
        alt="Gayflix"
        width={500}
        height={500}
        className="h-8 w-8 shrink-0"
      />
      {showName && (
        <span className="truncate font-display text-lg font-bold">
          gayflix
        </span>
      )}
    </div>
  );
}

/**
 * The phone layout's top bar. Its menu closes like the site header's
 * (see useDropdown), and on route change.
 */
function PhoneBar({ pathname }: { pathname: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdown = useDropdown(isOpen, setIsOpen, buttonRef);

  // Close whenever the route changes, during render rather than in an
  // effect, as MobileNavMenu does.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setIsOpen(false);
  }

  return (
    <div {...dropdown} className="sticky top-0 z-40 md:hidden">
      <div className="flex h-14 items-center justify-between gap-2 border-b border-border-subtle bg-bg-surface px-3">
        <Brand showName />
        <button
          ref={buttonRef}
          type="button"
          aria-label={isOpen ? "Close menu" : "Open menu"}
          aria-expanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
          className="flex h-10 w-10 items-center justify-center rounded-md text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary"
        >
          {isOpen ? <X className="h-5 w-5" strokeWidth={2} /> : <Menu className="h-5 w-5" strokeWidth={2} />}
        </button>
      </div>

      {isOpen && (
        // pt-2: room for the first link's focus ring.
        <nav
          aria-label="Admin"
          className="absolute inset-x-0 top-14 max-h-[calc(100vh-3.5rem)] space-y-1 overflow-y-auto border-b border-border-subtle bg-bg-surface px-3 pb-4 pt-2 shadow-xl"
        >
          {adminNav.map((entry) => (
            <NavItem key={entry.label} entry={entry} pathname={pathname} collapsed={false} />
          ))}
        </nav>
      )}
    </div>
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
    const isActive = pathname === entry.href;
    const Icon = entry.icon;
    return (
      <Link
        href={entry.href}
        aria-current={isActive ? "page" : undefined}
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
