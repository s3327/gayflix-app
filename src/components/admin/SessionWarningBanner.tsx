"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Warns an admin when their 12-hour session is close to expiring (within 15 minutes)
 * so they can save in-progress forms or refresh their authentication before losing work (F7).
 */
export default function SessionWarningBanner({
  sessionExpiresAt,
}: {
  sessionExpiresAt?: string;
}) {
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!sessionExpiresAt) return;

    function update() {
      const expiresTime = new Date(sessionExpiresAt!).getTime();
      const diff = expiresTime - Date.now();
      if (diff <= 0) {
        setMinutesLeft(0);
      } else if (diff <= 15 * 60 * 1000) {
        setMinutesLeft(Math.ceil(diff / 60000));
      } else {
        setMinutesLeft(null);
      }
    }

    update();
    const timer = setInterval(update, 30000);
    return () => clearInterval(timer);
  }, [sessionExpiresAt]);

  if (minutesLeft === null) return null;

  if (minutesLeft === 0) {
    return (
      <div
        role="alert"
        className="flex items-center justify-between gap-4 border-b border-status-danger/30 bg-status-danger/10 px-6 py-2.5 text-xs font-semibold text-status-danger"
      >
        <span>Your admin session has expired. Save operations may fail until you sign in again.</span>
        <Link href="/admin/login" className="underline hover:text-ink-primary">
          Sign in again
        </Link>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-4 border-b border-status-warning/40 bg-status-warning/10 px-6 py-2.5 text-xs font-semibold text-amber-400"
    >
      <span>
        Your admin session expires in {minutesLeft} {minutesLeft === 1 ? "minute" : "minutes"}. Save your
        work to avoid losing changes.
      </span>
      <Link href="/admin/login" className="underline hover:text-ink-primary">
        Sign in again
      </Link>
    </div>
  );
}

