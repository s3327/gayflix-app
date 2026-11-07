/**
 * Text and synopsis sanitizer.
 *
 * Strips HTML tags, WordPress comments/blocks (e.g. from thisgaymovie.click migration),
 * decodes HTML entities, and normalizes spacing.
 */

const NAMED_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&hellip;": "…",
  "&ndash;": "–",
  "&mdash;": "—",
  "&lsquo;": "'",
  "&rsquo;": "'",
  "&ldquo;": '"',
  "&rdquo;": '"',
  "&bull;": "•",
  "&copy;": "©",
  "&reg;": "®",
  "&trade;": "™",
};

/**
 * Decodes HTML entities (both named and numeric decimal/hex).
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return "";

  // 1. Named entities
  let result = text.replace(/&(?:[a-zA-Z]+);/g, (match) => {
    return NAMED_ENTITIES[match.toLowerCase()] ?? match;
  });

  // 2. Decimal entities (e.g. &#8217;, &#39;)
  result = result.replace(/&#(\d+);/g, (_match, dec) => {
    try {
      const code = parseInt(dec, 10);
      return String.fromCodePoint(code);
    } catch {
      return "";
    }
  });

  // 3. Hex entities (e.g. &#x2019;, &#x27;)
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) => {
    try {
      const code = parseInt(hex, 16);
      return String.fromCodePoint(code);
    } catch {
      return "";
    }
  });

  return result;
}

/**
 * Strips HTML tags and WordPress artifacts from text, converts block line breaks,
 * decodes entities, and cleans whitespace.
 */
export function stripHtmlAndEntities(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) {
    return "";
  }

  let text = raw;

  // 1. Remove script and style elements entirely with their content
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

  // 2. Remove HTML comments (including WordPress blocks like <!-- wp:paragraph -->)
  text = text.replace(/<!--[\s\S]*?-->/g, "");

  // 3. Convert line-breaking and block tags to newlines so text doesn't collapse
  text = text.replace(/<(?:br\s*\/?>|br\b[^>]*>)/gi, "\n");
  text = text.replace(/<\/(?:p|div|h[1-6]|li|blockquote|tr|section|article)>/gi, "\n\n");
  text = text.replace(/<(?:p|div|h[1-6]|li|blockquote|tr|section|article)\b[^>]*>/gi, "");

  // 4. Strip any remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // 5. Decode entities
  text = decodeHtmlEntities(text);

  // 6. Normalize whitespace and newlines
  text = text
    .replace(/\r\n|\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();

  return text;
}
