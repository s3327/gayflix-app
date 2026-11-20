import { headers } from "next/headers";

/**
 * Injects Schema.org JSON-LD structured data into the HTML page.
 * Safe for search engines (Google, Bing, etc.) to parse rich cards.
 *
 * Carries the request's CSP nonce (set by src/proxy.ts) like every other
 * script on the page, and escapes "<" so a title containing "</script>"
 * can't end the block early.
 */
export default async function JsonLd({
  data,
}: {
  data: Record<string, unknown> | Array<Record<string, unknown>>;
}) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
