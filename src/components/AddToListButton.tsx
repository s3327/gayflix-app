"use client";

import { useState } from "react";
import { ListChecks, ListPlus } from "lucide-react";
import AddToListModal from "@/components/AddToListModal";
import LoginPrompt from "@/components/LoginPrompt";
import { useAuth } from "@/lib/auth-context";
import type { FavoriteEntry } from "@/lib/favorites-context";
import { useLists } from "@/lib/lists-context";

/**
 * Puts a title into lists from its own page, its watch page and its
 * episodes' pages. Sits beside FavoriteButton at the same height; the
 * label says how many lists already have the title.
 *
 * Lists live in an account, so a guest's tap asks them to log in or
 * sign up, and either way brings them back to this page.
 */
export default function AddToListButton({ media }: { media: FavoriteEntry }) {
  const { isLoggedIn } = useAuth();
  const { lists, isInList } = useLists();
  const [open, setOpen] = useState<"lists" | "login" | null>(null);
  const inLists = lists.filter((list) => isInList(list.id, media.id)).length;
  const Icon = inLists > 0 ? ListChecks : ListPlus;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(isLoggedIn ? "lists" : "login")}
        aria-haspopup="dialog"
        className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-card border border-border-strong px-5 text-ink-primary transition-colors hover:border-brand-pink hover:bg-bg-elevated"
      >
        <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
        <span className="text-sm font-semibold">
          {inLists === 0 ? "Add to List" : inLists === 1 ? "In 1 List" : `In ${inLists} Lists`}
        </span>
      </button>

      {open === "lists" && <AddToListModal entry={media} onClose={() => setOpen(null)} />}
      {open === "login" && (
        <LoginPrompt
          title="Log in to make lists"
          description={`Lists are kept in your account, on every device. Log in or sign up, and you'll come right back to ${media.title}.`}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
