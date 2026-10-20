"use client";

import { Share2 } from "lucide-react";
import { useToast } from "@/lib/toast-context";

/**
 * Shares a title's page: the phone's share sheet where there is one,
 * otherwise copies the link and says so. Cancelling the share sheet
 * does nothing.
 */
export default function ShareButton({ title, className }: { title: string; className: string }) {
  const { showToast } = useToast();

  async function share() {
    const url = window.location.origin + window.location.pathname;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `${title} on Gayflix`, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // No share sheet after all: copy the link instead.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied");
    } catch {
      showToast("The link couldn't be copied. Copy it from the address bar.", { type: "error" });
    }
  }

  return (
    <button type="button" onClick={share} className={className}>
      <Share2 className="h-5 w-5" aria-hidden />
      <span className="text-sm font-semibold">Share</span>
    </button>
  );
}
