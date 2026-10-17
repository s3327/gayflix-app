import Image from "next/image";
import Link from "next/link";
import { isPlaceholder, LEGAL } from "@/lib/legal";

/** The pages that link to one another at the foot of each. */
const LEGAL_LINKS = [
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/copyright", label: "Copyright" },
];

/**
 * The frame shared by About, Contact, Terms, Privacy and Copyright: the
 * logo home, a heading, an optional "Last updated" line, the sections,
 * and links to the others.
 */
export default function LegalPage({
  title,
  path,
  updated = false,
  children,
}: {
  title: string;
  /** This page's own path, left out of the links at the foot. */
  path: string;
  /** Shows LEGAL.lastUpdated under the heading. */
  updated?: boolean;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-8 sm:py-16">
      <Link href="/" className="inline-flex items-center gap-2">
        <Image src="/brand/gayflix-icon.png" alt="Gayflix" width={500} height={500} className="h-8 w-8" />
      </Link>

      <h1 className="mt-8 font-display text-3xl font-bold">{title}</h1>
      {updated && <p className="mt-2 text-sm text-ink-muted">Last updated: {LEGAL.lastUpdated}</p>}

      <div className="mt-8 flex flex-col gap-8 text-sm leading-relaxed text-ink-secondary">{children}</div>

      <nav aria-label="About Gayflix" className="mt-12 border-t border-border-subtle pt-6">
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {LEGAL_LINKS.filter((link) => link.href !== path).map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="font-medium text-ink-brand transition-colors hover:text-brand-pink-light">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}

/** One numbered or titled part of a legal page. */
export function LegalSection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={id && `${id}-title`} className="scroll-mt-8">
      <h2 id={id && `${id}-title`} className="font-display text-lg font-semibold text-ink-primary">
        {title}
      </h2>
      <div className="mt-2 flex flex-col gap-3">{children}</div>
    </section>
  );
}

/** The contact address, as a mail link once it's a real one. */
export function ContactEmail() {
  if (isPlaceholder(LEGAL.contactEmail)) {
    return <strong className="font-semibold text-ink-primary">{LEGAL.contactEmail}</strong>;
  }
  return (
    <a
      href={`mailto:${LEGAL.contactEmail}`}
      className="font-medium text-ink-brand transition-colors hover:text-brand-pink-light"
    >
      {LEGAL.contactEmail}
    </a>
  );
}

/** A link inside legal copy. */
export function LegalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-ink-brand transition-colors hover:text-brand-pink-light">
      {children}
    </Link>
  );
}
