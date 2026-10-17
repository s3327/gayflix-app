"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

const INPUT =
  "w-full rounded-md border border-border-subtle bg-bg-elevated py-2.5 pl-4 pr-12 text-sm text-ink-primary placeholder:text-ink-muted transition-colors focus:border-brand-pink focus-visible:outline-hidden";

/**
 * A password field with a Show toggle, so people can check what they
 * typed. The toggle's name is just "Show" (pressed or not), so the
 * field's own label stays the only thing called "Password".
 */
export default function PasswordInput(
  props: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "className">
) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;

  return (
    <div className="relative">
      <input {...props} type={visible ? "text" : "password"} className={INPUT} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        aria-controls={props.id}
        title={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-ink-muted transition-colors hover:text-ink-primary focus-visible:-outline-offset-2"
      >
        <Icon className="h-4 w-4" aria-hidden />
        <span className="sr-only">Show</span>
      </button>
    </div>
  );
}
