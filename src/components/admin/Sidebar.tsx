"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, ExternalLink, LogOut, Menu, PanelLeftClose, PanelLeftOpen, User, X } from "lucide-react";
import { adminNav, type NavEntry } from "@/components/admin/nav-config";
import { authClient } from "@/lib/auth-client";
import { useDropdown } from "@/lib/use-dropdown";

export type AdminUserSummary = {
  name?: string | null;
  email?: string | null;
  sessionExpiresAt?: string;
};

/**
 * The admin panel's navigation: a sidebar on tablets and up, and on
 * phones, a bar across the top with the same links in a drawer menu.
 *
 * F8: Includes an account menu at the foot with admin name, email,
 * session expiry time, View site link, and Sign out button.
 * F10: When collapsed, groups (Library, Upload) open flyout menus beside
 * their icons, and every icon has accessible labels and tooltips.
 */
export default function Sidebar({ adminUser }: { adminUser?: AdminUserSummary }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      <PhoneBar pathname={pathname} adminUser={adminUser} />
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border-subtle bg-bg-surface transition-[width] duration-200 md:flex ${
          collapsed ? "w-20" : "w-64"
        }`}
      >
        {/* Logo + collapse toggle, same row */}
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-3">
          <Brand showName={!collapsed} />

          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
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

        {/* Account footer (F8, F7) */}
        <AdminAccountSection adminUser={adminUser} collapsed={collapsed} />
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
function PhoneBar({
  pathname,
  adminUser,
}: {
  pathname: string;
  adminUser?: AdminUserSummary;
}) {
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
          <AdminAccountSection adminUser={adminUser} collapsed={false} />
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
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const flyoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!flyoutOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (flyoutRef.current && !flyoutRef.current.contains(event.target as Node)) {
        setFlyoutOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setFlyoutOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [flyoutOpen]);

  if (entry.type === "link") {
    const isCurrent = pathname === entry.href;
    const isActive = isCurrent || pathname.startsWith(`${entry.href}/`);
    const Icon = entry.icon;
    return (
      <Link
        href={entry.href}
        aria-label={collapsed ? entry.label : undefined}
        title={collapsed ? entry.label : undefined}
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

  if (collapsed && open) setOpen(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          if (collapsed) {
            setFlyoutOpen((v) => !v);
          } else {
            setOpen((v) => !v);
          }
        }}
        aria-expanded={collapsed ? flyoutOpen : open}
        aria-haspopup={collapsed ? "menu" : undefined}
        aria-label={collapsed ? entry.label : undefined}
        title={collapsed ? entry.label : undefined}
        className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
          collapsed ? "justify-center" : ""
        } ${
          isInsideGroup
            ? "text-ink-primary"
            : "text-ink-secondary hover:bg-bg-elevated hover:text-ink-primary"
        } ${(isInsideGroup && !open) || (collapsed && flyoutOpen) ? "bg-bg-elevated" : ""}`}
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

      {/* Flyout menu when sidebar is collapsed (F10) */}
      {collapsed && flyoutOpen && (
        <div
          ref={flyoutRef}
          role="menu"
          aria-label={entry.label}
          className="absolute left-full top-0 ml-2 z-50 w-44 rounded-md border border-border-subtle bg-bg-surface p-1.5 shadow-xl"
        >
          <div className="px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-ink-muted">
            {entry.label}
          </div>
          <div className="mt-1 flex flex-col gap-0.5">
            {entry.children.map((child) => {
              const isCurrent = pathname === child.href;
              const isActive = isCurrent || pathname.startsWith(`${child.href}/`);
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  role="menuitem"
                  onClick={() => setFlyoutOpen(false)}
                  aria-current={isCurrent ? "page" : undefined}
                  className={`rounded-md px-2.5 py-1.5 text-sm transition-colors ${
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
        </div>
      )}

      {/* Inline accordion when sidebar is expanded */}
      {!collapsed && open && (
        <div className="ml-[22px] mt-1 flex flex-col gap-0.5 border-l border-border-subtle pl-4">
          {entry.children.map((child) => {
            const isCurrent = pathname === child.href;
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

function AdminAccountSection({
  adminUser,
  collapsed,
}: {
  adminUser?: AdminUserSummary;
  collapsed: boolean;
}) {
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const flyoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!flyoutOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (flyoutRef.current && !flyoutRef.current.contains(event.target as Node)) {
        setFlyoutOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setFlyoutOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [flyoutOpen]);

  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut().catch(() => {});
    router.push("/admin/login");
    router.refresh();
  }

  const expiryTime = adminUser?.sessionExpiresAt
    ? new Date(adminUser.sessionExpiresAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  if (collapsed) {
    return (
      <div className="relative border-t border-border-subtle p-2">
        <button
          type="button"
          onClick={() => setFlyoutOpen((v) => !v)}
          aria-label="Account options"
          title={adminUser?.name || adminUser?.email || "Admin account"}
          aria-haspopup="menu"
          aria-expanded={flyoutOpen}
          className="flex h-10 w-full items-center justify-center rounded-md text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary"
        >
          <User className="h-5 w-5" strokeWidth={2} />
        </button>

        {flyoutOpen && (
          <div
            ref={flyoutRef}
            role="menu"
            aria-label="Account options"
            className="absolute bottom-2 left-full ml-2 z-50 w-56 rounded-md border border-border-subtle bg-bg-surface p-3 shadow-xl"
          >
            <div className="border-b border-border-subtle pb-2">
              <p className="truncate text-sm font-semibold text-ink-primary">
                {adminUser?.name || "Admin"}
              </p>
              {adminUser?.email && (
                <p className="truncate text-xs text-ink-muted">{adminUser.email}</p>
              )}
              {expiryTime && (
                <p className="mt-1 text-xs text-ink-secondary">
                  Signed in until {expiryTime}
                </p>
              )}
            </div>

            <div className="mt-2 flex flex-col gap-1">
              <Link
                href="/home"
                role="menuitem"
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View site
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={handleSignOut}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-status-danger transition-colors hover:bg-status-danger/10"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="border-t border-border-subtle p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink-primary">
          {adminUser?.name || "Admin"}
        </p>
        {adminUser?.email && (
          <p className="truncate text-xs text-ink-muted">{adminUser.email}</p>
        )}
        {expiryTime && (
          <p className="mt-1 text-xs text-ink-secondary">
            Signed in until {expiryTime}
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border-subtle pt-2">
        <Link
          href="/home"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          View site
        </Link>
        <button
          type="button"
          onClick={handleSignOut}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-status-danger transition-colors hover:bg-status-danger/10"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </div>
  );
}
