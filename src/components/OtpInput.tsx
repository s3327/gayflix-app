"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Shared 6-box (by default) one-time-code input — auto-advance on
 * type, backspace-to-previous, paste-a-whole-code support. Originally
 * built inline for /verify-email; pulled out so the account-page email
 * and password change flows can reuse the exact same behavior instead
 * of re-implementing it.
 */
export default function OtpInput({
  length = 6,
  onChange,
  onComplete,
}: {
  length?: number;
  onChange?: (code: string) => void;
  onComplete?: (code: string) => void;
}) {
  const [digits, setDigits] = useState<string[]>(Array(length).fill(""));
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    const code = digits.join("");
    onChange?.(code);
    if (code.length === length) onComplete?.(code);
    // Only re-run when the code itself changes — onChange/onComplete are
    // expected to be stable-enough closures from the parent, not deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits]);

  // Writes `incoming` digits starting at box `start`, then focuses the
  // box after the last one filled. Shared by paste and by multi-character
  // input events — SMS/password-manager autofill (autoComplete=
  // "one-time-code") drops the whole code into one box at once.
  function fillFrom(start: number, incoming: string) {
    const chars = incoming.slice(0, length - start).split("");
    setDigits((prev) => {
      const next = [...prev];
      chars.forEach((char, offset) => {
        next[start + offset] = char;
      });
      return next;
    });
    inputRefs.current[Math.min(start + chars.length, length - 1)]?.focus();
  }

  function handleChange(index: number, value: string) {
    const numeric = value.replace(/\D/g, "");
    if (value && !numeric) return; // ignore non-numeric keystrokes
    if (numeric.length > 1) {
      fillFrom(index, numeric);
      return;
    }
    setDigits((prev) => {
      const next = [...prev];
      next[index] = numeric;
      return next;
    });
    if (numeric && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(index: number, event: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;
    event.preventDefault();
    // A full-length code always means "the whole code", wherever it's
    // pasted; anything shorter fills from the box it was pasted into.
    fillFrom(pasted.length >= length ? 0 : index, pasted);
  }

  return (
    <div className="flex justify-center gap-2">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={length}
          value={digit}
          // Select on focus so typing replaces the digit instead of
          // appending to it.
          onFocus={(event) => event.target.select()}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={(event) => handlePaste(index, event)}
          aria-label={`Digit ${index + 1} of ${length}`}
          className="h-12 w-11 rounded-md border border-border-subtle bg-bg-elevated text-center text-lg font-semibold text-ink-primary transition-colors focus:border-brand-pink focus-visible:outline-none"
        />
      ))}
    </div>
  );
}
