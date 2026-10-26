"use client";

import { useId } from "react";
import { NICKNAME_MAX, NICKNAME_MIN } from "@/lib/community-rules";

/**
 * Asks a member without a nickname to pick one, the first time they post
 * to the community (a review, a Community list). Uncontrolled: read it
 * from the form as "nickname".
 */
export default function NicknameField({ className = "" }: { className?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="text-sm font-semibold text-ink-primary">
        Your nickname
      </label>
      <p id={`${id}-hint`} className="mt-0.5 text-xs text-ink-secondary">
        Shown instead of your name, which stays private. You can change it later in Setting.
      </p>
      <input
        id={id}
        name="nickname"
        required
        minLength={NICKNAME_MIN}
        maxLength={NICKNAME_MAX}
        autoComplete="off"
        aria-describedby={`${id}-hint`}
        className="mt-2 w-full max-w-xs rounded-card border border-border-strong bg-bg-base px-3 py-2 text-sm text-ink-primary focus:border-brand-pink focus:outline-none"
      />
    </div>
  );
}
