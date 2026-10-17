"use client";

import Link from "next/link";
import Modal from "@/components/Modal";
import { authHref } from "@/lib/safe-redirect";
import { useCurrentPath } from "@/lib/use-current-path";

/**
 * Asks a guest to log in or sign up for something only members can do,
 * such as saving a favorite. Both ways come back to this page.
 */
export default function LoginPrompt({
  title,
  description,
  onClose,
}: {
  title: string;
  description: string;
  onClose: () => void;
}) {
  const here = useCurrentPath();

  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm text-ink-secondary">{description}</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href={authHref("/login", here)}
          className="rounded-card bg-brand-pink px-5 py-2 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark"
        >
          Log in
        </Link>
        <Link
          href={authHref("/signup", here)}
          className="rounded-card border border-border-strong px-5 py-2 text-sm font-semibold text-ink-primary transition-colors hover:bg-bg-elevated"
        >
          Sign up
        </Link>
      </div>
    </Modal>
  );
}
