import { describe, expect, it } from "vitest";
import { PAGE_SIZE, paginate } from "@/lib/paginate";

const items = Array.from({ length: 50 }, (_, i) => i);

describe("paginate", () => {
  it("slices the requested page", () => {
    const { page, totalPages, pageItems } = paginate(items, 2);
    expect(page).toBe(2);
    expect(totalPages).toBe(Math.ceil(50 / PAGE_SIZE));
    expect(pageItems).toEqual(items.slice(PAGE_SIZE, PAGE_SIZE * 2));
  });

  it("clamps out-of-range pages", () => {
    expect(paginate(items, 0).page).toBe(1);
    expect(paginate(items, -3).page).toBe(1);
    expect(paginate(items, 999).page).toBe(3);
    expect(paginate(items, NaN).page).toBe(1);
  });

  it("always reports at least one page", () => {
    expect(paginate([], 1)).toEqual({ page: 1, totalPages: 1, pageItems: [] });
  });
});
