import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-nonce": "abc123" }),
}));

const { default: JsonLd } = await import("@/components/JsonLd");

describe("JsonLd", () => {
  it("carries the request's CSP nonce", async () => {
    const element = await JsonLd({ data: { "@type": "Movie" } });
    expect(element.props.nonce).toBe("abc123");
    expect(element.props.type).toBe("application/ld+json");
  });

  it("can't be closed early by a title containing </script>", async () => {
    const element = await JsonLd({ data: { name: "</script><script>alert(1)</script>" } });
    const html: string = element.props.dangerouslySetInnerHTML.__html;
    expect(html).not.toContain("</script>");
    expect(JSON.parse(html)).toEqual({ name: "</script><script>alert(1)</script>" });
  });
});
