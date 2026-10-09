// Single clickable value (Director, Country, Language). Not routed yet —
// will eventually link to a media_people / media_country / media_language
// filtered listing.
export function MetaLink({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="text-ink-primary transition-colors hover:text-brand-pink hover:underline"
    >
      {children}
    </button>
  );
}

// Comma-joined list where each item is independently clickable (Cast,
// Genre) — the commas themselves stay plain text, not part of the button.
export function MetaLinkList({ items }: { items: string[] }) {
  return (
    <>
      {items.map((item, i) => (
        <span key={item}>
          <MetaLink>{item}</MetaLink>
          {i < items.length - 1 && ", "}
        </span>
      ))}
    </>
  );
}
