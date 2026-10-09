"use client";

import Modal from "@/components/Modal";

export default function ConfirmModal({
  title,
  description,
  confirmLabel = "Confirm",
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm text-ink-secondary">{description}</p>
      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className="rounded-card bg-status-error px-5 py-2 text-sm font-bold text-ink-onBrand transition-colors hover:brightness-110"
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-card border border-border-strong px-5 py-2 text-sm font-semibold text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary"
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}
