"use client";

/** Checks or clears every row checkbox (name="ids") in its form. */
export default function SelectAllCheckbox() {
  return (
    <input
      type="checkbox"
      aria-label="Select all"
      onChange={(event) => {
        const { checked, form } = event.currentTarget;
        form?.querySelectorAll<HTMLInputElement>('input[name="ids"]').forEach((box) => {
          box.checked = checked;
        });
      }}
      className="h-4 w-4 rounded-sm border-border-strong accent-brand-pink"
    />
  );
}
