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

  function setDigitAt(index: number, value: string) {
    if (!/^[0-9]?$/.test(value)) return; // one numeric character at a time
    setDigits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    if (value && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    event.preventDefault();
    setDigits((prev) => {
      const next = [...prev];
      for (let i = 0; i < length; i++) next[i] = pasted[i] ?? "";
      return next;
    });
    inputRefs.current[Math.min(pasted.length, length - 1)]?.focus();
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
          maxLength={1}
          value={digit}
          onChange={(event) => setDigitAt(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
          aria-label={`Digit ${index + 1} of ${length}`}
          className="h-12 w-11 rounded-md border border-border-subtle bg-bg-elevated text-center text-lg font-semibold text-ink-primary transition-colors focus:border-brand-pink focus-visible:outline-none"
        />
      ))}
    </div>
  );
}
