"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { unsubscribeFromNewEpisodes } from "@/lib/notification-actions";

/** Stop emails about new episodes, for the account the link was sent to. */
export default function UnsubscribeForm({ userId, token }: { userId: string; token: string }) {
  const [state, setState] = useState<"ask" | "done" | "invalid">("ask");
  const [isPending, startTransition] = useTransition();

  if (state === "done") {
    return (
      <p role="status" className="mt-4 text-sm text-ink-secondary">
        Done. You won&apos;t get emails about new episodes anymore. You can turn them back on in{" "}
        <Link href="/account/setting" className="font-semibold text-ink-brand hover:underline">
          Account, then Setting
        </Link>
        .
      </p>
    );
  }

  return (
    <>
      <p className="mt-4 text-sm text-ink-secondary">
        Stop the emails we send when a series in your Favorites gets new episodes? Emails about
        your account, such as sign-in codes, keep coming.
      </p>
      {state === "invalid" && (
        <p role="alert" className="mt-4 text-sm text-status-error">
          This link isn&apos;t right. Turn the emails off in Account, then Setting, instead.
        </p>
      )}
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setState((await unsubscribeFromNewEpisodes(userId, token)) ? "done" : "invalid");
          })
        }
        className="mt-6 rounded-card bg-brand-pink px-5 py-2.5 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light disabled:opacity-60"
      >
        Stop These Emails
      </button>
    </>
  );
}
