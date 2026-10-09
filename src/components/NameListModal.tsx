"use client";

import { useState } from "react";
import Modal from "@/components/Modal";

export default function NameListModal({
  title,
  initialName = "",
  confirmLabel = "Create",
  onSubmit,
  onClose,
}: {
  title: string;
  initialName?: string;
  confirmLabel?: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    onSubmit(name.trim());
    onClose();
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="text"
          autoFocus
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Weekend Watchlist"
          className="w-full rounded-md border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted transition-colors focus:border-brand-pink focus-visible:outline-none"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-card bg-brand-pink px-5 py-2 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark"
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
      </form>
    </Modal>
  );
}
