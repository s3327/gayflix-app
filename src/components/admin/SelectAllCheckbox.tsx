"use client";

import { useEffect, useRef } from "react";

/** Checks or clears every row checkbox (name="ids") in its form, with full indeterminate support. */
export default function SelectAllCheckbox() {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = ref.current;
    if (!input || !input.form) return;
    const form = input.form;

    const syncState = () => {
      const boxes = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="ids"]'));
      if (boxes.length === 0) {
        input.checked = false;
        input.indeterminate = false;
        return;
      }
      const checkedCount = boxes.filter((b) => b.checked).length;
      if (checkedCount === 0) {
        input.checked = false;
        input.indeterminate = false;
      } else if (checkedCount === boxes.length) {
        input.checked = true;
        input.indeterminate = false;
      } else {
        input.checked = false;
        input.indeterminate = true;
      }

      // Update any selected count badge
      const countEl = form.querySelector('[data-selected-count]');
      if (countEl) {
        countEl.textContent = String(checkedCount);
      }
    };

    form.addEventListener("change", syncState);
    syncState();

    return () => {
      form.removeEventListener("change", syncState);
    };
  }, []);

  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label="Select all"
      onChange={(event) => {
        const { checked, form } = event.currentTarget;
        if (!form) return;
        form.querySelectorAll<HTMLInputElement>('input[name="ids"]').forEach((box) => {
          box.checked = checked;
        });
        const countEl = form.querySelector('[data-selected-count]');
        if (countEl) {
          countEl.textContent = checked
            ? String(form.querySelectorAll('input[name="ids"]').length)
            : "0";
        }
      }}
      className="h-4 w-4 rounded-sm border-border-strong accent-brand-pink"
    />
  );
}
