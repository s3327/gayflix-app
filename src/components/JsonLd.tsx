/**
 * Injects Schema.org JSON-LD structured data into the HTML page.
 * Safe for search engines (Google, Bing, etc.) to parse rich cards.
 */
export default function JsonLd({
  data,
}: {
  data: Record<string, unknown> | Array<Record<string, unknown>>;
}) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
