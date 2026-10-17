"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Search, X } from "lucide-react";
import type { SearchSuggestion } from "@/lib/search";
import { titleHref } from "@/lib/title-href";
import { useDropdown } from "@/lib/use-dropdown";

const DEBOUNCE_MS = 150;

type SuggestionResult = { query: string; items: SearchSuggestion[] };

/**
 * Search icon in the header that expands into a live suggestion
 * dropdown. Client Component by necessity (open/query state, closing on
 * outside click, Escape or focus leaving: see useDropdown) — everything
 * else in Header stays a plain server-rendered link.
 */
export default function SearchBox() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdown = useDropdown(isOpen, setIsOpen, buttonRef);
  const pathname = usePathname();
  const router = useRouter();

  const [result, setResult] = useState<SuggestionResult | null>(null);
  const trimmedQuery = query.trim();

  // Suggestions come from /api/search (the catalog stays on the server).
  // A result is only shown while it still matches what's typed, so a slow
  // response for an older query can never overwrite a newer one.
  const suggestions = result?.query === trimmedQuery ? result.items : null;

  useEffect(() => {
    if (!trimmedQuery) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(trimmedQuery)}`,
          { signal: controller.signal }
        );
        if (!response.ok) throw new Error(`Search failed: ${response.status}`);
        const data: { results: SearchSuggestion[] } = await response.json();
        setResult({ query: trimmedQuery, items: data.results });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error(error);
        setResult({ query: trimmedQuery, items: [] });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmedQuery]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (q) {
      setIsOpen(false);
      router.push(`/search?q=${encodeURIComponent(q)}`);
    }
  }

  // Header is rendered once at the (main) layout level and never
  // unmounts between pages, so clicking a suggestion doesn't naturally
  // close this — closing explicitly whenever the route changes is what
  // makes that work. Done during render (React's "adjusting state when a
  // prop changes" pattern) rather than in an effect, so there's no extra
  // render with the dropdown still open.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setIsOpen(false);
    setQuery("");
  }

  function openSearch() {
    setIsOpen(true);
    // Wait a frame so the input has actually mounted before focusing it.
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <div {...dropdown} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={isOpen ? "Close search" : "Search"}
        aria-expanded={isOpen}
        onClick={() => (isOpen ? setIsOpen(false) : openSearch())}
        className="flex h-10 w-10 items-center justify-center rounded-full text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary"
      >
        {isOpen ? (
          <X className="h-5 w-5" strokeWidth={2} />
        ) : (
          <Search className="h-5 w-5" strokeWidth={2} />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-card border border-border-subtle bg-bg-surface shadow-xl sm:w-80">
          <form
            role="search"
            onSubmit={handleSubmit}
            className="flex items-center gap-2 border-b border-border-subtle px-3 py-2.5"
          >
            <Search aria-hidden className="h-4 w-4 shrink-0 text-ink-muted" strokeWidth={2} />
            <input
              ref={inputRef}
              type="text"
              aria-label="Search titles"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search titles..."
              className="w-full bg-transparent text-sm text-ink-primary placeholder:text-ink-muted focus:outline-hidden"
            />
          </form>

          {trimmedQuery && (
            <ul className="max-h-80 overflow-y-auto py-1" aria-live="polite">
              {suggestions === null ? (
                <li className="px-3 py-4 text-center text-sm text-ink-muted">
                  Searching…
                </li>
              ) : suggestions.length > 0 ? (
                suggestions.map((item) => (
                  <li key={item.id}>
                    {/* Focus ring inside the edges: the panel clips
                        anything outside it. */}
                    <Link
                      href={titleHref(item)}
                      className="flex items-center gap-3 px-3 py-2 transition-colors hover:bg-bg-elevated focus-visible:-outline-offset-2"
                    >
                      <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-xs bg-bg-elevated">
                        <Image
                          src={item.posterUrl}
                          alt=""
                          fill
                          sizes="40px"
                          className="object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink-primary">
                          {item.title}
                        </p>
                        <p className="truncate text-xs capitalize text-ink-secondary">
                          {item.type} · {item.year}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))
              ) : (
                <li className="px-3 py-4 text-center text-sm text-ink-muted">
                  No titles found for &ldquo;{query}&rdquo;
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
