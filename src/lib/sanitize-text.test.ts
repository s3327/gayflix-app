import { describe, expect, it } from "vitest";
import { decodeHtmlEntities, stripHtmlAndEntities } from "./sanitize-text";

describe("decodeHtmlEntities", () => {
  it("decodes named entities", () => {
    expect(decodeHtmlEntities("Love &amp; Pride")).toBe("Love & Pride");
    expect(decodeHtmlEntities("&quot;Hello&quot; &amp; &apos;World&apos;")).toBe('"Hello" & \'World\'');
    expect(decodeHtmlEntities("Wait&hellip; &lt;stop&gt;")).toBe("Wait… <stop>");
    expect(decodeHtmlEntities("Item 1&nbsp;&ndash;&nbsp;Item 2")).toBe("Item 1 – Item 2");
  });

  it("decodes decimal entities", () => {
    expect(decodeHtmlEntities("It&#8217;s a movie")).toBe("It’s a movie");
    expect(decodeHtmlEntities("She&#039;s here")).toBe("She's here");
  });

  it("decodes hex entities", () => {
    expect(decodeHtmlEntities("It&#x2019;s great")).toBe("It’s great");
    expect(decodeHtmlEntities("&#x27;Cool&#x27;")).toBe("'Cool'");
  });
});

describe("stripHtmlAndEntities", () => {
  it("returns empty string for non-string or whitespace", () => {
    expect(stripHtmlAndEntities(null)).toBe("");
    expect(stripHtmlAndEntities(undefined)).toBe("");
    expect(stripHtmlAndEntities("   ")).toBe("");
  });

  it("strips basic paragraph tags and preserves text", () => {
    const input = "<p>This is a movie about two men falling in love.</p>";
    expect(stripHtmlAndEntities(input)).toBe("This is a movie about two men falling in love.");
  });

  it("strips WordPress comments and block tags", () => {
    const input = `<!-- wp:paragraph -->
<p>First paragraph from WordPress.</p>
<!-- /wp:paragraph -->
<!-- wp:paragraph -->
<p>Second paragraph with <strong>bold</strong> and <em>italic</em>.</p>
<!-- /wp:paragraph -->`;
    expect(stripHtmlAndEntities(input)).toBe(
      "First paragraph from WordPress.\n\nSecond paragraph with bold and italic."
    );
  });

  it("converts br tags to line breaks and decodes entities", () => {
    const input = "<p>Line 1<br />Line 2<br>Line 3 with &amp; and &nbsp;space.</p>";
    expect(stripHtmlAndEntities(input)).toBe("Line 1\nLine 2\nLine 3 with & and space.");
  });

  it("removes script and style tags completely", () => {
    const input = `<p>Real synopsis</p><script>alert('xss');</script><style>body { color: red; }</style>`;
    expect(stripHtmlAndEntities(input)).toBe("Real synopsis");
  });

  it("handles complex messy HTML from WordPress exports", () => {
    const input = `
<div class="entry-content">
<p><strong>Directed by:</strong> John Doe<br />
<strong>Synopsis:</strong> After years apart, they meet again in Paris&#8230;</p>
<p>An emotional journey exploring love, family, and acceptance &ndash; a true classic.</p>
</div>
`;
    const cleaned = stripHtmlAndEntities(input);
    expect(cleaned).toContain("Directed by: John Doe");
    expect(cleaned).toContain("After years apart, they meet again in Paris…");
    expect(cleaned).toContain("An emotional journey exploring love, family, and acceptance – a true classic.");
    expect(cleaned).not.toContain("<");
    expect(cleaned).not.toContain(">");
    expect(cleaned).not.toContain("&#8230;");
  });
});
