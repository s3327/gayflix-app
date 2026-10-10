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
 */
export default function SwipeableRow({
  children,
  className = "",
  scrollPaddingClassName = "scroll-pl-4 sm:scroll-pl-8",
}: {
  children: React.ReactNode;
  className?: string;
  scrollPaddingClassName?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
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
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    const el = scrollRef.current;
    if (!el) return;
    drag.current = { startX: e.clientX, startScrollLeft: el.scrollLeft, moved: false };
    setIsDragging(true);
    el.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const el = scrollRef.current;
    if (!el) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > 3) drag.current.moved = true;
    el.scrollLeft = drag.current.startScrollLeft - dx;
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    scrollRef.current?.releasePointerCapture(e.pointerId);
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
      <div
        ref={scrollRef}
        className={`${className} ${scrollPaddingClassName} ${
          isDragging ? "cursor-grabbing select-none" : "cursor-grab"
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={handleClickCapture}
      >
        {children}
      </div>

      {canScrollLeft && (
        <>
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-bg-base to-transparent sm:w-16" />
          <button
            type="button"
            onClick={() => scrollByPage(-1)}
            aria-label="Scroll left"
            className="absolute left-2 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-bg-elevated/90 text-ink-primary shadow-lg backdrop-blur transition-all hover:scale-110 hover:bg-brand-pink hover:text-ink-onBrand"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        </>
      )}

      {canScrollRight && (
        <>
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-bg-base to-transparent sm:w-16" />
          <button
            type="button"
            onClick={() => scrollByPage(1)}
            aria-label="Scroll right"
            className="absolute right-2 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-bg-elevated/90 text-ink-primary shadow-lg backdrop-blur transition-all hover:scale-110 hover:bg-brand-pink hover:text-ink-onBrand"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}
    </div>
  );
}
