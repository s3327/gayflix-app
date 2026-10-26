import type { Metadata } from "next";
import Link from "next/link";
import {
  blockList,
  deleteReviewForGood,
  dismissReports,
  hideReview,
  restoreReview,
  unblockList,
} from "@/lib/admin-community-actions";
import { REPORT_REASONS, isReportReason } from "@/lib/community-rules";
import { db } from "@/lib/db";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = {
  title: "Community",
};

const SHOWN = 50;

const dateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function when(date: Date) {
  return `${dateTime.format(date)} UTC`;
}

const TABS = [
  { key: "reported", label: "Reported" },
  { key: "recent", label: "Recent" },
  { key: "hidden", label: "Hidden" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const ACTION =
  "rounded-card border border-border-strong px-3 py-1.5 text-xs font-semibold text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary";
const DANGER = `${ACTION} hover:text-status-error`;

function reasonSummary(reports: { reason: string }[]) {
  const counts = new Map<string, number>();
  for (const { reason } of reports) {
    const label = isReportReason(reason) ? REPORT_REASONS[reason] : reason;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].map(([label, count]) => (count > 1 ? `${label} (${count})` : label)).join(", ");
}

const REVIEW_INCLUDE = {
  media: { select: { id: true, title: true, type: true } },
  user: { select: { id: true, email: true, profile: { select: { nickname: true } } } },
  reports: { where: { resolvedAt: null }, select: { reason: true } },
} as const;

type ReviewRow = Awaited<ReturnType<typeof loadReviews>>[number];

function loadReviews(where: object, orderBy: object) {
  return db.review.findMany({ where, orderBy, take: SHOWN, include: REVIEW_INCLUDE });
}

function ReviewItem({ review }: { review: ReviewRow }) {
  const author = review.user.profile?.nickname ?? "A member";
  return (
    <li className="flex flex-wrap items-start gap-4 px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <Link
            href={`/${review.media.type === "series" ? "series" : "movie"}/${review.media.id}`}
            className="font-medium text-ink-primary hover:text-ink-brand hover:underline"
          >
            {review.media.title}
          </Link>
          <span className="text-ink-muted">
            {" · "}by {author} (
            <Link href={`/admin/users/${review.user.id}`} className="hover:text-ink-brand hover:underline">
              {review.user.email}
            </Link>
            ) · {when(review.createdAt)}
          </span>
        </p>
        <p className="mt-1 whitespace-pre-line break-words text-sm text-ink-secondary">{review.body}</p>
        {review.reports.length > 0 && (
          <p className="mt-1.5 text-xs font-semibold text-status-error">
            {review.reports.length} open {review.reports.length === 1 ? "report" : "reports"}:{" "}
            {reasonSummary(review.reports)}
          </p>
        )}
        {review.hiddenAt && (
          <p className="mt-1.5 text-xs text-ink-muted">
            Hidden by {review.hiddenBy ?? "a moderator"} on {when(review.hiddenAt)}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {review.hiddenAt ? (
          <form action={restoreReview.bind(null, review.id)}>
            <button type="submit" className={ACTION} aria-label={`Show review by ${author} again`}>
              Show Again
            </button>
          </form>
        ) : (
          <form action={hideReview.bind(null, review.id)}>
            <button type="submit" className={ACTION} aria-label={`Hide review by ${author}`}>
              Hide
            </button>
          </form>
        )}
        {review.reports.length > 0 && (
          <form action={dismissReports.bind(null, "review", review.id)}>
            <button type="submit" className={ACTION} aria-label={`Dismiss reports on review by ${author}`}>
              Dismiss Reports
            </button>
          </form>
        )}
        <form action={deleteReviewForGood.bind(null, review.id)}>
          <button type="submit" className={DANGER} aria-label={`Delete review by ${author}`}>
            Delete
          </button>
        </form>
      </div>
    </li>
  );
}

/**
 * /admin/community: moderating what members post (A9). Reported reviews
 * and Community lists first, with what they were reported for; recent
 * reviews and the lists on Community Lists now; and what moderators hid
 * or took off. Reviews go live at once,
 * so this is where they're checked.
 */
export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const requested = firstParam((await searchParams).tab);
  const tab: Tab = TABS.some((t) => t.key === requested) ? (requested as Tab) : "reported";
  const openReports = { reports: { some: { resolvedAt: null } } };

  const [reviews, lists, openCount] = await Promise.all([
    tab === "reported"
      ? loadReviews(openReports, { createdAt: "desc" })
      : tab === "recent"
        ? loadReviews({}, { createdAt: "desc" })
        : loadReviews({ hiddenAt: { not: null } }, { hiddenAt: "desc" }),
    db.mediaList.findMany({
      where:
        tab === "reported"
          ? openReports
          : tab === "recent"
            ? { isPublic: true, inCommunity: true, communityBlocked: false }
            : { communityBlocked: true },
      orderBy: { updatedAt: "desc" },
      take: SHOWN,
      select: {
        id: true,
        name: true,
        communityBlocked: true,
        _count: { select: { items: true } },
        user: { select: { id: true, email: true, profile: { select: { nickname: true } } } },
        reports: { where: { resolvedAt: null }, select: { reason: true } },
      },
    }),
    db.contentReport.count({ where: { resolvedAt: null } }),
  ]);

  return (
    <div className="px-6 py-10 sm:px-10">
      <h1 className="font-display text-2xl font-bold">Community</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {openCount === 1 ? "1 open report" : `${openCount} open reports`} on members&apos; reviews
        and Community lists. Reviews go live at once; hide or delete any that break the rules.
      </p>

      <nav aria-label="Community views" className="mt-6 flex flex-wrap gap-2">
        {TABS.map(({ key, label }) => (
          <Link
            key={key}
            href={key === "reported" ? "/admin/community" : `/admin/community?tab=${key}`}
            aria-current={tab === key ? "page" : undefined}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
              tab === key
                ? "border-brand-pink bg-brand-pink/10 text-ink-brand shadow-2xs"
                : "border-border-strong text-ink-secondary hover:bg-bg-elevated hover:text-ink-primary"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      <section aria-labelledby="reviews-heading" className="mt-8">
        <h2 id="reviews-heading" className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
          Reviews
        </h2>
        {reviews.length === 0 ? (
          <p className="mt-3 text-sm text-ink-secondary">Nothing here.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border-subtle overflow-hidden rounded-card border border-border-subtle bg-bg-surface shadow-2xs">
            {reviews.map((review) => (
              <ReviewItem key={review.id} review={review} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="lists-heading" className="mt-10">
        <h2 id="lists-heading" className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
          Community Lists
        </h2>
        {lists.length === 0 ? (
          <p className="mt-3 text-sm text-ink-secondary">Nothing here.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border-subtle overflow-hidden rounded-card border border-border-subtle bg-bg-surface shadow-2xs">
            {lists.map((list) => {
              const author = list.user.profile?.nickname ?? "A member";
              return (
                <li key={list.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <Link
                        href={`/list/${list.id}`}
                        className="font-medium text-ink-primary hover:text-ink-brand hover:underline"
                      >
                        {list.name}
                      </Link>
                      <span className="text-ink-muted">
                        {" · "}by {author} (
                        <Link
                          href={`/admin/users/${list.user.id}`}
                          className="hover:text-ink-brand hover:underline"
                        >
                          {list.user.email}
                        </Link>
                        ) · {list._count.items} {list._count.items === 1 ? "title" : "titles"}
                      </span>
                    </p>
                    {list.reports.length > 0 && (
                      <p className="mt-1.5 text-xs font-semibold text-status-error">
                        {list.reports.length} open {list.reports.length === 1 ? "report" : "reports"}:{" "}
                        {reasonSummary(list.reports)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {list.communityBlocked ? (
                      <form action={unblockList.bind(null, list.id)}>
                        <button type="submit" className={ACTION} aria-label={`Allow ${list.name} on Community Lists`}>
                          Allow Again
                        </button>
                      </form>
                    ) : (
                      <form action={blockList.bind(null, list.id)}>
                        <button type="submit" className={DANGER} aria-label={`Take ${list.name} off Community Lists`}>
                          Take Off Community
                        </button>
                      </form>
                    )}
                    {list.reports.length > 0 && (
                      <form action={dismissReports.bind(null, "list", list.id)}>
                        <button type="submit" className={ACTION} aria-label={`Dismiss reports on ${list.name}`}>
                          Dismiss Reports
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
