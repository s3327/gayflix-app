import { describe, expect, it } from "vitest";
import { personHref, personName } from "@/lib/browse-href";

describe("person pages", () => {
  it("put the name in the address as it's written", () => {
    expect(personHref("Jordan Lee")).toBe("/people/Jordan%20Lee");
    expect(personHref("José García-Smith")).toBe("/people/Jos%C3%A9%20Garc%C3%ADa-Smith");
    expect(personHref("AC/DC")).toBe("/people/AC%2FDC");
  });

  it("read the name back from the address", () => {
    for (const name of ["Jordan Lee", "José García-Smith", "AC/DC", "100% Real"]) {
      expect(personName(personHref(name).slice("/people/".length))).toBe(name);
    }
  });

  it("take a name that's already decoded as it is", () => {
    expect(personName("100% Real")).toBe("100% Real");
  });

  it("refuse an address that isn't a name", () => {
    expect(personName("")).toBeNull();
    expect(personName("%20%20")).toBeNull();
    expect(personName(encodeURIComponent("x".repeat(121)))).toBeNull();
  });
});
