"use client";

import { useId, useState } from "react";
import { setNewEpisodeEmails } from "@/lib/notification-actions";
import { useToast } from "@/lib/toast-context";

/**
 * Account → Setting: the emails a member can turn off. Only new-episode
 * emails for now; emails about the account itself (codes, password
 * resets, sign-in alerts) always go. Saved at once; a failed save puts
 * the switch back.
 */
export default function EmailSettings({ newEpisodes: initial }: { newEpisodes: boolean }) {
  const id = useId();
  const { showToast } = useToast();
  const [newEpisodes, setNewEpisodes] = useState(initial);

  function toggle() {
    const next = !newEpisodes;
    setNewEpisodes(next);
    setNewEpisodeEmails(next)
      .then(() => showToast(next ? "New episode emails on" : "New episode emails off"))
      .catch(() => {
        setNewEpisodes(!next);
        showToast("Couldn't save that. Try again.", { type: "error" });
      });
  }

  return (
    <div className="mt-4 flex items-start justify-between gap-4">
      <div>
        <p id={`${id}-label`} className="text-sm font-semibold text-ink-primary">
          New episodes of my favorite series
        </p>
        <p id={`${id}-hint`} className="mt-0.5 text-xs text-ink-secondary">
          One email when series in your Favorites get new episodes.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={newEpisodes}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`}
        onClick={toggle}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${
          newEpisodes ? "bg-brand-pink" : "bg-border-strong"
        }`}
      >
        <span
          aria-hidden
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-ink-primary transition-transform ${
            newEpisodes ? "translate-x-5" : ""
          }`}
        />
      </button>
    </div>
  );
}
