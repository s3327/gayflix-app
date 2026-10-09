import Link from "next/link";

// Marketing landing page — domain.com. No <Header/> here on purpose;
// this page will get its own design later (hero, sign-up CTA, etc.).
// The real browsing experience lives at /home under the (main) route group.

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-8 text-center">
      <p className="font-body text-sm font-semibold uppercase tracking-widest text-ink-muted">
        Landing page — placeholder
      </p>
      <h1 className="mt-3 font-display text-5xl font-bold">
        Love. Stories. Ours.
      </h1>
      <p className="mt-4 max-w-lg text-ink-secondary">
        This is domain.com — the pre-login marketing page. Not designed yet;
        for now it just links through to the home experience.
      </p>
      <Link
        href="/home"
        className="mt-8 rounded-card bg-brand-pink px-7 py-3 font-body text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark"
      >
        Go to /home →
      </Link>
    </main>
  );
}
