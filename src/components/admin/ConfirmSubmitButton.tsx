"use client";

import { useRef, useState } from "react";
import ConfirmModal from "@/components/ConfirmModal";

/**
 * A submit button that asks first, for actions that can't be undone.
 * Put it inside the form it submits.
 */
export default function ConfirmSubmitButton({
  children,
  confirmTitle,
  confirmDescription,
  confirmLabel,
  className,
  ariaLabel,
  formAction,
}: {
  children: React.ReactNode;
  confirmTitle: string;
  confirmDescription: string;
  confirmLabel: string;
  className?: string;
  ariaLabel?: string;
  formAction?: (form: FormData) => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const hiddenSubmitRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => setIsOpen(true)}
        className={className}
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
          title={confirmTitle}
          description={confirmDescription}
          confirmLabel={confirmLabel}
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
