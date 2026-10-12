import Link from "next/link";

// A single detail on a title's page (Director, Country, Language) that
// leads to the titles sharing it: a listing, or a search for a person.
// See src/lib/browse-href.ts.
export function MetaLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-ink-primary transition-colors hover:text-ink-brand hover:underline"
    >
      {children}
    </Link>
  );
}

// Comma-joined list where each item is its own link (Cast, Genre) — the
// commas themselves stay plain text, not part of a link.
export function MetaLinkList({
  items,
  href,
}: {
  items: string[];
  href: (item: string) => string;
}) {
  return (
    <>
      {items.map((item, i) => (
        <span key={item}>
          <MetaLink href={href(item)}>{item}</MetaLink>
          {i < items.length - 1 && ", "}
        </span>
      ))}
    </>
  );
}
