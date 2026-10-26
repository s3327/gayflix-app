"use client";

import { useId, useState, useTransition } from "react";
import { setNickname } from "@/lib/community-actions";
import { NICKNAME_MAX, NICKNAME_MIN } from "@/lib/community-rules";
import { useToast } from "@/lib/toast-context";

/**
 * Account → Setting: the member's public nickname, shown on their reviews
 * and Community lists instead of their name. Members without one get it
 * the first time they post, or here.
 */
export default function NicknameSetting({ initial }: { initial: string | null }) {
  const id = useId();
  const { showToast } = useToast();
  const [value, setValue] = useState(initial ?? "");
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      setError(null);
      const result = await setNickname(value).catch(() => null);
      if (!result) {
        setError("Couldn't save your nickname. Try again.");
      } else if (!result.ok) {
        setError(result.error);
      } else {
        setSaved(result.nickname);
        setValue(result.nickname);
        showToast("Nickname saved");
      }
    });

  return (
    <form action={save} className="mt-4 flex flex-wrap items-start gap-2">
      <div className="min-w-0 flex-1 basis-56">
        <label htmlFor={id} className="sr-only">
          Nickname
        </label>
        <input
          id={id}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          minLength={NICKNAME_MIN}
          maxLength={NICKNAME_MAX}
          required
          autoComplete="off"
          aria-describedby={error ? `${id}-error` : undefined}
          className="w-full rounded-card border border-border-strong bg-bg-base px-3 py-2 text-sm text-ink-primary focus:border-brand-pink focus:outline-none"
        />
        {error && (
          <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-status-error">
            {error}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={isPending || value.trim() === (saved ?? "")}
        className="rounded-card border border-border-strong px-4 py-2 text-sm font-semibold text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary disabled:opacity-50"
      >
        Save Nickname
      </button>
    </form>
  );
}
