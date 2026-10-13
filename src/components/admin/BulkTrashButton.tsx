"use client";

import { useRef, useState } from "react";
import ConfirmModal from "@/components/ConfirmModal";

/**
 * Bulk trash submit button: asks for confirmation only when more than one title
 * is selected (F5: "Ask before trashing more than one title at once").
 * Single-title selections submit directly and are protected by the Undo banner (A7).
 */
export default function BulkTrashButton({
  formAction,
  children,
}: {
  formAction: (form: FormData) => Promise<void>;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [count, setCount] = useState(0);
  const hiddenSubmitRef = useRef<HTMLButtonElement>(null);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const form = e.currentTarget.form;
    const checked = form ? form.querySelectorAll<HTMLInputElement>('input[name="ids"]:checked') : [];
    if (checked.length > 1) {
      setCount(checked.length);
      setIsOpen(true);
    } else {
      hiddenSubmitRef.current?.click();
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="rounded-card border border-border-strong px-3 py-1 text-xs font-semibold text-status-error transition-colors hover:bg-status-error/10"
      >
        {children}
      </button>
      <button
        ref={hiddenSubmitRef}
        type="submit"
        formAction={formAction}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
      {isOpen && (
        <ConfirmModal
          title={`Move ${count} titles to trash?`}
          description={`The ${count} selected titles will be removed from the public site and moved to trash.`}
          confirmLabel="Move to trash"
          onConfirm={() => {
            setIsOpen(false);
            hiddenSubmitRef.current?.click();
          }}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

