"use client";

import { useRef, useState } from "react";
import ConfirmModal from "@/components/ConfirmModal";

/**
 * A submit button that asks first, for actions that can't be undone.
 * Put it inside the form it submits. Pressing Enter in one of the form's
 * fields asks too: the browser submits with the hidden button, which only
 * goes through once the dialog is confirmed.
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
  const confirmedRef = useRef(false);

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
        onClick={(event) => {
          if (confirmedRef.current) {
            confirmedRef.current = false;
            return;
          }
          event.preventDefault();
          setIsOpen(true);
        }}
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
            confirmedRef.current = true;
            hiddenSubmitRef.current?.click();
          }}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
