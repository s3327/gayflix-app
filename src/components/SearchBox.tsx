"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { Search, X } from "lucide-react";
import type { SearchSuggestion } from "@/lib/search";
import { titleHref } from "@/lib/title-href";
import { useDropdown } from "@/lib/use-dropdown";

const DEBOUNCE_MS = 150;

type SuggestionResult = { query: string; items: SearchSuggestion[]; total: number };

/** What the dropdown lists: titles, then "See all 44 titles". */
type Option = { key: string; href: string };

/**
 * Search icon in the header that expands into a live suggestion
 * dropdown. Client Component by necessity (open/query state, closing on
 * outside click, Escape or focus leaving: see useDropdown) — everything
 * else in Header stays a plain server-rendered link.
 *
 * The box is a combobox: focus stays in it while the arrow keys move
 * through the suggestions and Enter opens the one picked (or, with none
 * picked, the search page). Suggestions match the way the search page
 * does, and the last option goes there for everything found.
 */
/** "1 title", "44 titles"; "all 44 titles" with `all`. */
function titleCount(total: number, all = "") {
  return total === 1 ? "1 title" : `${all}${total} titles`;
}

export default function SearchBox() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdown = useDropdown(isOpen, setIsOpen, buttonRef);
  const pathname = usePathname();
  const router = useRouter();
  const id = useId();
  const listboxId = `${id}-listbox`;
  const optionId = (index: number) => `${id}-option-${index}`;

  const [result, setResult] = useState<SuggestionResult | null>(null);
  const trimmedQuery = query.trim();

  // Suggestions come from /api/search (the catalog stays on the server).
  // A result is only shown while it still matches what's typed, so a slow
  // response for an older query can never overwrite a newer one.
  const current = result?.query === trimmedQuery ? result : null;
  const suggestions = current?.items ?? null;
  const searchPage = `/search?q=${encodeURIComponent(trimmedQuery)}`;
  const options: Option[] =
    current && current.total > 0
      ? [
          ...current.items.map((item) => ({ key: item.id, href: titleHref(item) })),
          { key: "all", href: searchPage },
        ]
      : [];
  const hasOptions = Boolean(trimmedQuery) && options.length > 0;

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
        const data: { results: SearchSuggestion[]; total: number } = await response.json();
        setResult({ query: trimmedQuery, items: data.results, total: data.total });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error(error);
        setResult({ query: trimmedQuery, items: [], total: 0 });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmedQuery]);

  // Keep the picked option in view as the arrows move through a list
  // taller than the dropdown.
  useEffect(() => {
    if (activeIndex < 0) return;
    document.getElementById(`${id}-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [id, activeIndex]);

  function go(href: string) {
    // Closed here as well as on the route change below, for links to the
    // page that's already open.
    setIsOpen(false);
    router.push(href);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (trimmedQuery) go(searchPage);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!hasOptions) return;
    const last = options.length - 1;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index >= last ? 0 : index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? last : index - 1));
    } else if (event.key === "Enter" && activeIndex >= 0 && activeIndex <= last) {
      event.preventDefault();
      go(options[activeIndex].href);
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
    setActiveIndex(-1);
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
              role="combobox"
              aria-label="Search titles"
              aria-autocomplete="list"
              aria-expanded={hasOptions}
              aria-controls={listboxId}
              aria-activedescendant={hasOptions && activeIndex >= 0 ? optionId(activeIndex) : undefined}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(-1);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search titles..."
              className="w-full bg-transparent text-sm text-ink-primary placeholder:text-ink-muted focus:outline-hidden"
            />
          </form>

          {/* Says what came back to a screen reader; the list itself
              isn't a live region, so arrowing through it stays quiet. */}
          <div role="status">
            {trimmedQuery &&
              (suggestions === null ? (
                <p className="px-3 py-4 text-center text-sm text-ink-muted">Searching…</p>
              ) : current && current.total === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-ink-muted">
                  No titles found for &ldquo;{trimmedQuery}&rdquo;
                </p>
              ) : (
                <span className="sr-only">{titleCount(current?.total ?? 0)} found</span>
              ))}
          </div>

          {/* Always in the page, so the box's aria-controls names it. */}
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Suggestions"
            hidden={!hasOptions}
            className="max-h-80 overflow-y-auto py-1"
          >
            {hasOptions &&
              options.map((option, index) => {
                const item = suggestions?.[index];
                return (
                  // Mouse down would take focus from the box and close the
                  // dropdown before the click lands.
                  <li
                    key={option.key}
                    id={optionId(index)}
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => go(option.href)}
                    onMouseMove={() => setActiveIndex(index)}
                    className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${
                      index === activeIndex
                        ? "bg-bg-elevated outline-2 -outline-offset-2 outline-focus"
                        : ""
                    } ${item ? "" : "border-t border-border-subtle text-sm font-semibold text-ink-brand"}`}
                  >
                    {item ? (
                      <>
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
                          <p className="truncate text-xs text-ink-secondary">
                            {item.type === "movie" ? "Movie" : "Series"} · {item.year}
                          </p>
                        </div>
                      </>
                    ) : (
                      <span className="py-1">See {titleCount(current!.total, "all ")}</span>
                    )}
                  </li>
                );
              })}
          </ul>
        </div>
      )}
    </div>
  );
}
