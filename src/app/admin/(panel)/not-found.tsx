import Link from "next/link";

/**
 * A resource that isn't found in the panel, shown inside the admin panel
 * rather than falling back to the public 404 page.
 */
export default function AdminNotFound() {
  return (
    <div className="px-6 py-10 sm:px-10">
      <h1 className="font-display text-2xl font-bold">Not in the library</h1>
      <p className="mt-2 max-w-lg text-sm text-ink-muted">
        This admin address doesn&apos;t exist, or the resource may have been deleted.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/admin/dashboard"
          className="rounded-card bg-brand-pink px-4 py-2 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light"
        >
          Back to Dashboard
        </Link>
        <Link
          href="/admin/library/movies"
          className="rounded-card border border-border-strong px-4 py-2 text-sm font-semibold text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary"
        >
          Open the library
        </Link>
      </div>
    </div>
  );
}
