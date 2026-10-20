"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Wraps a horizontally-scrolling row (snap-x) with:
 * 1. scroll-padding matching the row's visual padding — without this,
 *    CSS scroll-snap aligns the first item flush to the raw scrollport
 *    edge and ignores the padding you set, making the row look
 *    misaligned compared to non-scrolling sections next to it.
 * 2. A fade + arrow button on whichever edge still has more content,
 *    so it's visually obvious the row is swipeable/scrollable — the
 *    arrows disappear once you've reached that end. The outer wrapper
 *    has overflow-hidden so nothing (a sliver of an adjacent card, a
 *    sub-pixel snap-alignment mismatch) can visually leak past the
 *    row's edges.
 * 3. Click-and-drag scrolling for mouse users. Touch devices already get
 *    native swipe scrolling for free; a plain desktop mouse (no
 *    trackpad, no touchscreen) otherwise has no way to scroll a row like
 *    this at all, so this makes it usable — and testable — without
 *    needing DevTools' touch-emulation mode.
 * 4. Keyboard users Tab through the cards themselves, and the row
 *    scrolls each focused card clear of the fades. So the arrows are for
 *    pointers only: out of the Tab order and hidden from screen readers,
 *    which reach every card anyway.
 *
 * The row needs vertical padding for a focused card's ring and a
 * hovered card's scale-up, which it would otherwise cut off.
 *
 * `as="ol"` makes the row itself a numbered list (its children <li>s),
 * for a ranking such as Top 10.
 */
export default function SwipeableRow({
  children,
  className = "",
  scrollPaddingClassName = "scroll-pl-4 sm:scroll-pl-8",
  as: Row = "div",
}: {
  children: React.ReactNode;
  className?: string;
  scrollPaddingClassName?: string;
  as?: "div" | "ol";
}) {
  // Either element: only HTMLElement's scrolling and children are used.
  const scrollRef = useRef<HTMLDivElement & HTMLOListElement>(null);
  const leftFadeRef = useRef<HTMLDivElement>(null);
  const rightFadeRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const drag = useRef({ startX: 0, startScrollLeft: 0, moved: false });

  const updateEdges = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  };

  useEffect(() => {
    updateEdges();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateEdges, { passive: true });
    window.addEventListener("resize", updateEdges);
    return () => {
      el.removeEventListener("scroll", updateEdges);
      window.removeEventListener("resize", updateEdges);
    };
  }, [children]);

  const scrollByPage = (direction: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: "smooth" });
  };

  // Mouse-only drag-to-scroll. Touch keeps native scrolling untouched.
  const handlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse") return;
    const el = scrollRef.current;
    if (!el) return;
    drag.current = { startX: e.clientX, startScrollLeft: el.scrollLeft, moved: false };
    setIsDragging(true);
    el.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!isDragging) return;
    const el = scrollRef.current;
    if (!el) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > 3) drag.current.moved = true;
    el.scrollLeft = drag.current.startScrollLeft - dx;
  };

  const endDrag = (e: React.PointerEvent<HTMLElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    scrollRef.current?.releasePointerCapture(e.pointerId);
  };

  // The browser scrolls a focused card into view, but snapping can pull
  // the row back so the card is still cut off or under a fade. Once it's
  // done, move to the nearest snap position that shows the card clear of
  // both fades. Mouse focus (a drag that starts on a card) is left alone.
  const handleFocus = (e: React.FocusEvent<HTMLElement>) => {
    const target = e.target;
    if (!target.matches(":focus-visible")) return;
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      const card = el && [...el.children].find((child) => child.contains(target));
      if (!el || !card) return;
      const view = el.getBoundingClientRect();
      const box = card.getBoundingClientRect();
      const pastRight = box.right - (view.right - (rightFadeRef.current?.offsetWidth ?? 0));
      const pastLeft = view.left + (leftFadeRef.current?.offsetWidth ?? 0) - box.left;
      if (pastRight <= 0 && pastLeft <= 0) return;
      // Each card's snap position: its left edge at the scroll padding.
      const padding = parseFloat(getComputedStyle(el).scrollPaddingLeft) || 0;
      const snaps = [...el.children].map(
        (child) => el.scrollLeft + child.getBoundingClientRect().left - view.left - padding
      );
      const left =
        pastRight > 0
          ? (snaps.find((snap) => snap >= el.scrollLeft + pastRight) ?? snaps[snaps.length - 1])
          : (snaps.findLast((snap) => snap <= el.scrollLeft - pastLeft) ?? snaps[0]);
      el.scrollTo({ left, behavior: "smooth" });
    });
  };

  // Swallow the click that would otherwise fire on a card right after a
  // drag — without this, dragging past a poster would also "click" it.
  const handleClickCapture = (e: React.MouseEvent) => {
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      drag.current.moved = false;
    }
  };

  return (
    <div className="relative overflow-hidden">
      <Row
        ref={scrollRef}
        className={`${className} ${scrollPaddingClassName} ${
          isDragging ? "cursor-grabbing select-none" : "cursor-grab"
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={handleClickCapture}
        onFocus={handleFocus}
      >
        {children}
      </Row>

      {canScrollLeft && (
        <>
          <div
            ref={leftFadeRef}
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-linear-to-r from-bg-base to-transparent sm:w-16"
          />
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={() => scrollByPage(-1)}
            aria-label="Scroll left"
            className="absolute left-2 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-bg-elevated/90 text-ink-primary shadow-lg backdrop-blur-sm transition-all hover:scale-110 hover:bg-brand-pink hover:text-ink-onBrand"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        </>
      )}

      {canScrollRight && (
        <>
          <div
            ref={rightFadeRef}
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-linear-to-l from-bg-base to-transparent sm:w-16"
          />
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={() => scrollByPage(1)}
            aria-label="Scroll right"
            className="absolute right-2 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-bg-elevated/90 text-ink-primary shadow-lg backdrop-blur-sm transition-all hover:scale-110 hover:bg-brand-pink hover:text-ink-onBrand"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}
    </div>
  );
}
