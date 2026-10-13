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
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        formAction={formAction}
        aria-label={ariaLabel}
        onClick={() => setIsOpen(true)}
        className={className}
      >
        {children}
      </button>
      {isOpen && (
        <ConfirmModal
          title={confirmTitle}
          description={confirmDescription}
          confirmLabel={confirmLabel}
          onConfirm={() => buttonRef.current?.form?.requestSubmit(buttonRef.current)}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
