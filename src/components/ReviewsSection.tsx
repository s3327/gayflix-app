"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Pencil, Trash2 } from "lucide-react";
import ConfirmModal from "@/components/ConfirmModal";
import LoginPrompt from "@/components/LoginPrompt";
import NicknameField from "@/components/NicknameField";
import ReportContentButton from "@/components/ReportContentButton";
import { useAuth } from "@/lib/auth-context";
import type { ReviewView, TitleReviews } from "@/lib/community";
import { deleteReview, saveReview } from "@/lib/community-actions";
import { REVIEW_MAX } from "@/lib/community-rules";
import { useToast } from "@/lib/toast-context";

const day = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

const BUTTON =
  "rounded-card bg-brand-pink px-5 py-2 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light disabled:opacity-50";
const SECONDARY =
  "inline-flex items-center gap-1.5 rounded-card border border-border-strong px-4 py-2 text-sm font-semibold text-ink-primary transition-colors hover:bg-bg-elevated";

function ReviewBody({ review }: { review: ReviewView }) {
  const edited = review.updatedAt.slice(0, 10) !== review.createdAt.slice(0, 10);
  return (
    <>
      <p className="text-sm">
        <span className="font-semibold text-ink-primary">{review.nickname}</span>
        <span className="text-ink-muted">
          {" · "}
          <time dateTime={review.createdAt}>{day.format(new Date(review.createdAt))}</time>
          {edited && " · edited"}
        </span>
      </p>
      <p className="mt-1 whitespace-pre-line break-words text-sm leading-relaxed text-ink-secondary">
        {review.body}
      </p>
    </>
  );
}

/**
 * Members' short reviews on a title's page (A9), newest first, each under
 * its author's nickname. A member writes one per title, and can change or
 * delete it; one a moderator hid is shown only to its author, marked as
 * hidden. Members can report others' reviews. Guests read them, and are
 * asked to log in to write one. `initial` is what the server read for
 * this page; after a change the page is read again.
 */
export default function ReviewsSection({
  mediaId,
  title,
  initial,
}: {
  mediaId: string;
  title: string;
  initial: TitleReviews;
}) {
  const { isLoggedIn } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const formId = useId();
  const { reviews, total, mine, nickname } = initial;
  const [isEditing, setIsEditing] = useState(false);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [draft, setDraft] = useState(mine?.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const others = reviews.filter((review) => !review.isMine);
  const showForm = isLoggedIn && (!mine || isEditing);

  const submit = (form: FormData) =>
    startTransition(async () => {
      setError(null);
      const result = await saveReview(mediaId, draft, form.get("nickname") ?? undefined).catch(() => null);
      if (!result) {
        setError("Couldn't save your review. Try again.");
        return;
      }
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setIsEditing(false);
      showToast(mine ? "Review updated" : "Review posted");
      router.refresh();
    });

  const remove = () =>
    startTransition(async () => {
      try {
        await deleteReview(mediaId);
        setDraft("");
        showToast("Review deleted");
        router.refresh();
      } catch {
        showToast("Couldn't delete your review. Try again.", { type: "error" });
      }
    });

  return (
    <section aria-labelledby={`${formId}-heading`} className="mt-10 max-w-2xl">
      <h2 id={`${formId}-heading`} className="font-display text-lg font-semibold">
        Reviews{total > 0 && <span className="ml-2 text-sm font-normal text-ink-muted">{total}</span>}
      </h2>

      {!isLoggedIn && (
        <button type="button" onClick={() => setIsPromptOpen(true)} className={`mt-4 ${SECONDARY}`}>
          <MessageSquare className="h-4 w-4" aria-hidden />
          Write a Review
        </button>
      )}

      {mine && !isEditing && (
        <div className="mt-4 rounded-card border border-border-subtle bg-bg-surface p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Your review</p>
          <ReviewBody review={mine} />
          {mine.hidden && (
            <p className="mt-2 text-xs text-status-error">
              A moderator hid this review. Only you can see it.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft(mine.body);
                setIsEditing(true);
              }}
              className={SECONDARY}
            >
              <Pencil className="h-4 w-4" aria-hidden />
              Edit
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setIsConfirmingDelete(true)}
              className={`${SECONDARY} hover:text-status-error`}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Delete
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <form action={submit} className="mt-4 space-y-4">
          {!nickname && <NicknameField />}
          <div>
            <label htmlFor={`${formId}-body`} className="text-sm font-semibold text-ink-primary">
              {mine ? "Your review" : `Your review of ${title}`}
            </label>
            <textarea
              id={`${formId}-body`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={REVIEW_MAX}
              rows={4}
              required
              aria-describedby={`${formId}-count`}
              placeholder="What did you think? Keep spoilers out."
              className="mt-2 w-full rounded-card border border-border-strong bg-bg-base px-3 py-2 text-sm text-ink-primary focus:border-brand-pink focus:outline-none"
            />
            <p id={`${formId}-count`} className="text-right text-xs text-ink-muted">
              {draft.length}/{REVIEW_MAX}
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-status-error">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={isPending || draft.trim().length === 0} className={BUTTON}>
              {mine ? "Save Review" : "Post Review"}
            </button>
            {isEditing && (
              <button type="button" onClick={() => setIsEditing(false)} className={SECONDARY}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {others.length > 0 ? (
        <ul className="mt-6 divide-y divide-border-subtle">
          {others.map((review) => (
            <li key={review.id} className="py-4">
              <ReviewBody review={review} />
              <ReportContentButton
                target={{ reviewId: review.id }}
                what={`review by ${review.nickname}`}
                className="mt-2"
              />
            </li>
          ))}
        </ul>
      ) : (
        !mine && <p className="mt-4 text-sm text-ink-secondary">No reviews yet. Be the first to write one.</p>
      )}

      {total > reviews.length && (
        <p className="mt-2 text-xs text-ink-muted">
          Showing the {reviews.length} newest of {total} reviews.
        </p>
      )}

      {isPromptOpen && (
        <LoginPrompt
          title="Log in to write a review"
          description={`Reviews are posted under a nickname you choose, never your name. Log in or sign up, and you'll come right back to ${title}.`}
          onClose={() => setIsPromptOpen(false)}
        />
      )}

      {isConfirmingDelete && (
        <ConfirmModal
          title="Delete Review"
          description="Delete your review? This can't be undone."
          confirmLabel="Delete"
          onConfirm={remove}
          onClose={() => setIsConfirmingDelete(false)}
        />
      )}
    </section>
  );
}
