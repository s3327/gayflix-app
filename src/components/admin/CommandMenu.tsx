"use client";

import { useEffect, useState, useRef, useTransition, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  LayoutDashboard,
  Film,
  ListVideo,
  Users,
  PlusCircle,
  X,
  Keyboard,
  Clock,
} from "lucide-react";

type SearchResultItem = {
  id: string;
  title: string;
  type?: string;
  year?: number;
  status?: string;
  role?: string;
  subtitle?: string;
  href: string;
  category: "Pages" | "Actions" | "Titles" | "Episodes" | "Users" | "Recent";
};

const STATIC_PAGES: SearchResultItem[] = [
  { id: "p-dash", title: "Dashboard", href: "/admin/dashboard", category: "Pages" },
  { id: "p-mov", title: "Movies Library", href: "/admin/library/movies", category: "Pages" },
  { id: "p-ser", title: "Series Library", href: "/admin/library/series", category: "Pages" },
  { id: "p-ep", title: "Episodes Library", href: "/admin/library/episodes", category: "Pages" },
  { id: "p-imp", title: "Import from TMDB", href: "/admin/import", category: "Pages" },
  { id: "p-rep", title: "Reports Queue", href: "/admin/reports", category: "Pages" },
  { id: "p-usr", title: "Users & Accounts", href: "/admin/users", category: "Pages" },
  { id: "p-tr", title: "Trash", href: "/admin/trash", category: "Pages" },
  { id: "p-set", title: "Settings", href: "/admin/setting", category: "Pages" },
];

const STATIC_ACTIONS: SearchResultItem[] = [
  { id: "a-add-m", title: "Add a Movie", href: "/admin/upload/movies", category: "Actions" },
  { id: "a-add-s", title: "Add a Series", href: "/admin/upload/series", category: "Actions" },
  { id: "a-add-e", title: "Add an Episode", href: "/admin/upload/episodes", category: "Actions" },
  { id: "a-exp-m", title: "Export Movies CSV", href: "/api/admin/export?type=movies", category: "Actions" },
  { id: "a-exp-s", title: "Export Series CSV", href: "/api/admin/export?type=series", category: "Actions" },
  { id: "a-exp-r", title: "Export Reports CSV", href: "/api/admin/export?type=reports", category: "Actions" },
];

const emptySubscribe = () => () => {};

export default function CommandMenu() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [remoteResults, setRemoteResults] = useState<SearchResultItem[]>([]);
  const [recentItems, setRecentItems] = useState<SearchResultItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem("gayflix_admin_recent");
      return stored ? JSON.parse(stored).slice(0, 5) : [];
    } catch {
      return [];
    }
  });
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const saveRecent = (item: SearchResultItem) => {
    try {
      const updated = [
        { ...item, category: "Recent" as const },
        ...recentItems.filter((r) => r.href !== item.href),
      ].slice(0, 5);
      setRecentItems(updated);
      localStorage.setItem("gayflix_admin_recent", JSON.stringify(updated));
    } catch {
      // Ignore storage errors
    }
  };

  const isMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  // Keyboard navigation & sequences
  useEffect(() => {
    let lastKey = "";
    let lastKeyTime = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // Cmd+K or Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((prev) => {
          if (!prev) {
            setQuery("");
            setSelectedIndex(0);
            return true;
          }
          return false;
        });
        setShowShortcuts(false);
        return;
      }

      // '?' for Shortcuts modal (matches ?, Shift+/, or Shift+Slash)
      if (!isInput && (e.key === "?" || (e.key === "/" && e.shiftKey) || (e.code === "Slash" && e.shiftKey)) && !isOpen) {
        e.preventDefault();
        setShowShortcuts((prev) => !prev);
        return;
      }

      // 'Escape' closes modals
      if (e.key === "Escape") {
        if (isOpen) setIsOpen(false);
        if (showShortcuts) setShowShortcuts(false);
        return;
      }

      // Sequence navigation "G then ..."
      if (!isInput && !isOpen && !showShortcuts) {
        const now = Date.now();
        const key = e.key.toLowerCase();

        if (key === "g") {
          lastKey = "g";
          lastKeyTime = now;
          return;
        }

        if (lastKey === "g" && now - lastKeyTime < 1000) {
          lastKey = "";
          if (key === "m") {
            e.preventDefault();
            router.push("/admin/library/movies");
          } else if (key === "s") {
            e.preventDefault();
            router.push("/admin/library/series");
          } else if (key === "e") {
            e.preventDefault();
            router.push("/admin/library/episodes");
          } else if (key === "r") {
            e.preventDefault();
            router.push("/admin/reports");
          } else if (key === "u") {
            e.preventDefault();
            router.push("/admin/users");
          } else if (key === "d") {
            e.preventDefault();
            router.push("/admin/dashboard");
          } else if (key === "t") {
            e.preventDefault();
            router.push("/admin/trash");
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, showShortcuts, router]);

  // Focus input when palette opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  // Query remote items when query changes
  useEffect(() => {
    if (!isOpen || query.trim().length < 2) {
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/command-search?q=${encodeURIComponent(query.trim())}`);
        if (!res.ok) return;
        const data = await res.json();
        const items: SearchResultItem[] = [];

        if (data.titles) {
          for (const t of data.titles) {
            items.push({
              id: `t-${t.id}`,
              title: t.title,
              subtitle: `${t.type === "movie" ? "Movie" : "Series"} · ${t.year} · ${t.status}`,
              href: `/admin/library/${t.type === "movie" ? "movies" : "series"}/${t.id}`,
              category: "Titles",
            });
          }
        }
        if (data.episodes) {
          for (const ep of data.episodes) {
            items.push({
              id: `ep-${ep.id}`,
              title: ep.title,
              subtitle: `${ep.media?.title ?? "Series"} · S${ep.seasonNumber} E${ep.episodeNumber}`,
              href: `/admin/library/episodes/${ep.id}`,
              category: "Episodes",
            });
          }
        }
        if (data.users) {
          for (const u of data.users) {
            items.push({
              id: `u-${u.id}`,
              title: u.name,
              subtitle: `${u.email} ${u.role ? `(${u.role})` : ""}`,
              href: `/admin/users/${u.id}`,
              category: "Users",
            });
          }
        }
        setRemoteResults(items);
        setSelectedIndex(0);
      } catch {
        // Ignore fetch errors
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [isOpen, query]);

  // Filter static items by query
  const cleanQ = query.trim().toLowerCase();
  const filteredPages = cleanQ
    ? STATIC_PAGES.filter((p) => p.title.toLowerCase().includes(cleanQ))
    : STATIC_PAGES;
  const filteredActions = cleanQ
    ? STATIC_ACTIONS.filter((a) => a.title.toLowerCase().includes(cleanQ))
    : STATIC_ACTIONS;

  const activeRemoteResults = cleanQ.length >= 2 ? remoteResults : [];

  const displayList: SearchResultItem[] = cleanQ
    ? [...filteredPages, ...filteredActions, ...activeRemoteResults]
    : [...recentItems, ...STATIC_PAGES.slice(0, 5), ...STATIC_ACTIONS.slice(0, 3)];

  const handleSelect = (item: SearchResultItem) => {
    saveRecent(item);
    setIsOpen(false);
    startTransition(() => {
      router.push(item.href);
    });
  };

  const handleKeyDownInList = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, displayList.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + displayList.length) % Math.max(1, displayList.length));
    } else if (e.key === "Enter" && displayList[selectedIndex]) {
      e.preventDefault();
      handleSelect(displayList[selectedIndex]);
    }
  };

  return (
    <>
      {isMounted && <div data-command-menu-ready className="sr-only" aria-hidden="true" />}
      {/* Command Palette Modal */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Command Menu"
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-16 px-4 backdrop-blur-xs"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="w-full max-w-xl overflow-hidden rounded-xl border border-border-subtle bg-bg-surface shadow-2xl animate-in fade-in zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleKeyDownInList}
          >
            {/* Search Input Bar */}
            <div className="flex items-center border-b border-border-subtle px-4 py-3">
              <Search className="mr-3 h-5 w-5 text-ink-muted shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                placeholder="Type a command, page name, title..."
                className="w-full bg-transparent text-sm text-ink-primary placeholder:text-ink-muted focus:outline-hidden"
              />
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-ink-muted hover:text-ink-primary p-1"
                aria-label="Close command menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Results List */}
            <div className="max-h-96 overflow-y-auto p-2">
              {displayList.length === 0 ? (
                <div className="p-8 text-center text-sm text-ink-muted">
                  No matching pages, commands, or titles found.
                </div>
              ) : (
                <div className="space-y-1">
                  {displayList.map((item, idx) => {
                    const isSelected = idx === selectedIndex;
                    return (
                      <button
                        key={`${item.category}-${item.id}`}
                        type="button"
                        onClick={() => handleSelect(item)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                          isSelected
                            ? "bg-bg-elevated text-ink-brand font-medium"
                            : "text-ink-primary hover:bg-bg-elevated"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {item.category === "Recent" ? (
                            <Clock className="h-4 w-4 text-ink-muted shrink-0" />
                          ) : item.category === "Pages" ? (
                            <LayoutDashboard className="h-4 w-4 text-ink-muted shrink-0" />
                          ) : item.category === "Actions" ? (
                            <PlusCircle className="h-4 w-4 text-brand-pink shrink-0" />
                          ) : item.category === "Titles" ? (
                            <Film className="h-4 w-4 text-ink-muted shrink-0" />
                          ) : item.category === "Episodes" ? (
                            <ListVideo className="h-4 w-4 text-ink-muted shrink-0" />
                          ) : (
                            <Users className="h-4 w-4 text-ink-muted shrink-0" />
                          )}
                          <div className="truncate">
                            <span className="block truncate">{item.title}</span>
                            {item.subtitle && (
                              <span className="block truncate text-xs text-ink-muted font-normal">
                                {item.subtitle}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="ml-2 text-2xs uppercase tracking-wider text-ink-muted shrink-0 rounded px-1.5 py-0.5 bg-bg-base border border-border-subtle">
                          {item.category}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer Hints */}
            <div className="flex items-center justify-between border-t border-border-subtle bg-bg-base px-4 py-2 text-2xs text-ink-muted">
              <div className="flex items-center gap-2">
                <span>Navigate <kbd className="rounded border border-border-subtle bg-bg-surface px-1">↑</kbd><kbd className="rounded border border-border-subtle bg-bg-surface px-1">↓</kbd></span>
                <span>Select <kbd className="rounded border border-border-subtle bg-bg-surface px-1">↵</kbd></span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setShowShortcuts(true);
                }}
                className="hover:text-ink-primary underline"
              >
                Press <kbd className="rounded border border-border-subtle bg-bg-surface px-1">?</kbd> for shortcuts
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shortcuts Reference Dialog */}
      {showShortcuts && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard Shortcuts"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border-subtle bg-bg-surface p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <Keyboard className="h-5 w-5 text-brand-pink" />
                <h2 className="font-display text-lg font-bold">Admin Keyboard Shortcuts</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowShortcuts(false)}
                className="text-ink-muted hover:text-ink-primary"
                aria-label="Close shortcuts modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-sm">
              <div>
                <h3 className="text-xs font-semibold uppercase text-ink-muted mb-2">Global Navigation</h3>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center py-1">
                    <span className="text-ink-secondary">Command palette</span>
                    <kbd className="rounded border border-border-strong bg-bg-elevated px-2 py-0.5 text-xs font-mono">Cmd + K</kbd>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-ink-secondary">Go to Movies</span>
                    <kbd className="rounded border border-border-strong bg-bg-elevated px-2 py-0.5 text-xs font-mono">G then M</kbd>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-ink-secondary">Go to Series</span>
                    <kbd className="rounded border border-border-strong bg-bg-elevated px-2 py-0.5 text-xs font-mono">G then S</kbd>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-ink-secondary">Go to Episodes</span>
                    <kbd className="rounded border border-border-strong bg-bg-elevated px-2 py-0.5 text-xs font-mono">G then E</kbd>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-ink-secondary">Go to Reports</span>
                    <kbd className="rounded border border-border-strong bg-bg-elevated px-2 py-0.5 text-xs font-mono">G then R</kbd>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-ink-secondary">Go to Users</span>
                    <kbd className="rounded border border-border-strong bg-bg-elevated px-2 py-0.5 text-xs font-mono">G then U</kbd>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-ink-secondary">Go to Dashboard</span>
                    <kbd className="rounded border border-border-strong bg-bg-elevated px-2 py-0.5 text-xs font-mono">G then D</kbd>
                  </div>
                </div>
              </div>

              <div className="border-t border-border-subtle pt-3">
                <h3 className="text-xs font-semibold uppercase text-ink-muted mb-2">Library Tables</h3>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center py-1">
                    <span className="text-ink-secondary">Navigate rows</span>
                    <kbd className="rounded border border-border-strong bg-bg-elevated px-2 py-0.5 text-xs font-mono">↑ / ↓</kbd>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-ink-secondary">Select / Deselect row</span>
                    <kbd className="rounded border border-border-strong bg-bg-elevated px-2 py-0.5 text-xs font-mono">Space or X</kbd>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-ink-secondary">Quick Edit drawer</span>
                    <kbd className="rounded border border-border-strong bg-bg-elevated px-2 py-0.5 text-xs font-mono">Q</kbd>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-ink-secondary">Toggle Published / Draft</span>
                    <kbd className="rounded border border-border-strong bg-bg-elevated px-2 py-0.5 text-xs font-mono">P</kbd>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShowShortcuts(false)}
                className="rounded-card bg-brand-pink px-4 py-2 text-xs font-bold text-ink-onBrand hover:bg-brand-pink-light"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

