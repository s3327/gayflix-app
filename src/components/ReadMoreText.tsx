"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Clamps text to 3 lines and only shows a "Read more" toggle if the full
 * text actually overflows that — measured via scrollHeight vs.
 * clientHeight after render, so a short synopsis never shows a pointless
 * toggle that wouldn't visibly change anything when clicked.
 */
export default function ReadMoreText({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setCanExpand(el.scrollHeight > el.clientHeight + 1);
  }, [text]);

  return (
    <div>
      <p
        ref={ref}
        className={`text-sm leading-snug text-ink-secondary ${
          expanded ? "" : "line-clamp-3"
        }`}
      >
        {text}
      </p>
      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-sm font-semibold text-ink-brand transition-colors hover:text-brand-pink-light"
        >
          {expanded ? "Read less" : "Read more"}
        </button>
      )}
    </div>
  );
}
