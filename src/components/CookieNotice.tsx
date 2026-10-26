"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cookie } from "lucide-react";

const KEY = "gayflix:cookie-notice";

const noSubscription = () => () => {};

/** Whether this browser has said OK already; on the server, as if it had. */
function seenBefore(): boolean {
  try {
    return localStorage.getItem(KEY) === "seen";
  } catch {
    return false;
  }
}

/**
 * The cookie notice (A15). The site sets one cookie, which keeps you
 * signed in and is strictly necessary, and nothing for tracking or ads,
 * so this tells rather than asks: OK hides it for good in this browser
 * (local storage). Video hosts may set their own cookies; the privacy
 * page says so. Not shown in the admin panel. Shown only after the
 * page has loaded, since the server can't know whether it was seen.
 */
export default function CookieNotice() {
  const pathname = usePathname();
  const seen = useSyncExternalStore(noSubscription, seenBefore, () => true);
  const [dismissed, setDismissed] = useState(false);

  if (seen || dismissed || pathname.startsWith("/admin")) return null;

  function dismiss() {
    try {
      localStorage.setItem(KEY, "seen");
    } catch {
      // Storage off: it shows again next time, which is fine.
    }
    setDismissed(true);
  }

  return (
    <section
      aria-label="Cookie notice"
      className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-xl items-start gap-3 rounded-card border border-border-subtle bg-bg-surface p-4 shadow-xl sm:items-center"
    >
      <Cookie className="mt-0.5 h-5 w-5 shrink-0 text-ink-brand sm:mt-0" aria-hidden />
      <p className="flex-1 text-sm text-ink-secondary">
        We use one cookie, only to keep you signed in, and no tracking or ads. Video hosts may set
        their own.{" "}
        <Link href="/privacy#cookies" className="font-semibold text-ink-brand hover:underline">
          Learn more
        </Link>
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded-card bg-brand-pink px-4 py-2 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light"
      >
        OK
      </button>
    </section>
  );
}
