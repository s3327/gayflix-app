import Link from "next/link";

/**
 * A title or episode that isn't in the library (deleted, or a mistyped
 * link), shown inside the admin panel rather than the public 404.
 */
export default function AdminNotFound() {
  return (
    <div className="px-6 py-10 sm:px-10">
      <h1 className="font-display text-2xl font-bold">Not in the library</h1>
      <p className="mt-2 max-w-lg text-sm text-ink-muted">
        It may have been deleted, or the link may be wrong.
      </p>
      <Link
        href="/admin/library/movies"
        className="mt-6 inline-block rounded-card border border-border-strong px-4 py-2 text-sm font-semibold text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary"
      >
        Open the library
      </Link>
    </div>
  );
}
