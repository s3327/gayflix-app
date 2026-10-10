import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-ink-brand">404</p>
      <h1 className="mt-3 font-display text-4xl font-bold">Page not found</h1>
      <p className="mt-3 text-ink-secondary">
        We couldn&apos;t find what you were looking for. It may have moved, or
        the link may be wrong.
      </p>
      <Link
        href="/home"
        className="mt-8 rounded-card bg-brand-pink px-7 py-3 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark"
      >
        Back to Home
      </Link>
    </main>
  );
}
