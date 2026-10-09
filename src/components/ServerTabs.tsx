"use client";

import { useState } from "react";

// Placeholder list — real servers will come from however a title's video
// sources are configured on the (future) admin edit page.
const SERVERS = ["Server 1", "Server 2", "Server 3"];

export default function ServerTabs() {
  const [active, setActive] = useState(0);

  return (
    <div className="flex flex-wrap gap-2">
      {SERVERS.map((server, i) => (
        <button
          key={server}
          type="button"
          onClick={() => setActive(i)}
          aria-pressed={i === active}
          className={`rounded-md border px-4 py-2 text-sm font-semibold transition-colors ${
            i === active
              ? "border-brand-pink bg-brand-pink/10 text-brand-pink"
              : "border-border-subtle text-ink-secondary hover:bg-bg-elevated hover:text-ink-primary"
          }`}
        >
          {server}
        </button>
      ))}
    </div>
  );
}
