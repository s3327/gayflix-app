"use client";

import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import LoginPrompt from "@/components/LoginPrompt";
import { useAuth } from "@/lib/auth-context";
import { RATING_LABELS, RATINGS, type Rating } from "@/lib/ratings";
import { useRatings } from "@/lib/ratings-context";

/** Love it: two thumbs up, one behind the other. */
function DoubleThumbsUp({ className }: { className?: string }) {
  return (
    <span className={`relative inline-flex ${className ?? ""}`} aria-hidden>
      <ThumbsUp className="absolute -left-1 -top-0.5 h-full w-full opacity-60" />
      <ThumbsUp className="relative h-full w-full" />
    </span>
  );
}

const ICONS: Record<Rating, React.ComponentType<{ className?: string }>> = {
  not_for_me: ThumbsDown,
  like: ThumbsUp,
  love: DoubleThumbsUp,
};

/**
 * Not for me, Like and Love it for a movie or a series (`mediaId`; an
 * episode's page passes its series). A member's choice is pressed;
 * pressing it again takes the rating back. A guest's tap asks them to
 * log in or sign up, and either way brings them back here.
 */
export default function RatingButtons({
  mediaId,
  title,
  className = "",
}: {
  mediaId: string;
  title: string;
  className?: string;
}) {
  const { ratingOf, rate } = useRatings();
  const { isLoggedIn } = useAuth();
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const current = ratingOf(mediaId);

  return (
    <>
      <div role="group" aria-label={`Rate ${title}`} className={`flex flex-wrap items-center gap-2 ${className}`}>
        <span className="mr-1 text-sm text-ink-secondary" aria-hidden>
          Rate it
        </span>
        {RATINGS.map((value) => {
          const Icon = ICONS[value];
          const active = current === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() =>
                isLoggedIn ? rate(mediaId, active ? null : value) : setIsPromptOpen(true)
              }
              className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors ${
                active
                  ? "border-brand-pink bg-brand-pink/10 text-ink-brand hover:bg-brand-pink/20"
                  : "border-border-strong text-ink-primary hover:border-brand-pink hover:bg-bg-elevated"
              }`}
            >
              <Icon className="h-4 w-4" />
              {RATING_LABELS[value]}
            </button>
          );
        })}
      </div>

      {isPromptOpen && (
        <LoginPrompt
          title="Log in to rate titles"
          description={`Your ratings are kept in your account and shape what we suggest. Log in or sign up, and you'll come right back to ${title}.`}
          onClose={() => setIsPromptOpen(false)}
        />
      )}
    </>
  );
}
