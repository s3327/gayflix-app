"use client";

import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";

/**
 * How the header's dropdowns (search, account menu, mobile menu) close:
 * on a click outside, on Escape, and when keyboard focus moves out of
 * them, so one is never left open over the page behind whatever has
 * focus. Escape also hands focus back to the button that opened it when
 * focus was inside, rather than dropping it to the top of the page as
 * the dropdown disappears.
 *
 * Spread the returned props on the element that holds both the button
 * and the dropdown.
 */
export function useDropdown(
  isOpen: boolean,
  setIsOpen: Dispatch<SetStateAction<boolean>>,
  buttonRef: RefObject<HTMLElement | null>
) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setIsOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (ref.current?.contains(document.activeElement)) buttonRef.current?.focus();
      setIsOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, setIsOpen, buttonRef]);

  function onBlur(event: React.FocusEvent<HTMLDivElement>) {
    // relatedTarget is what gets focus next. It's null when focus leaves
    // the page (for another window, say), which shouldn't close anything.
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) {
      setIsOpen(false);
    }
  }

  return { ref, onBlur };
}
