import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { atLeast } from "@/lib/auth-timing";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("atLeast", () => {
  it("holds a quick result back until the floor", async () => {
    let settled = false;
    const result = atLeast(1500, async () => "quick").then((value) => {
      settled = true;
      return value;
    });
    await vi.advanceTimersByTimeAsync(1499);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe("quick");
  });

  it("doesn't add to work that already took longer", async () => {
    const result = atLeast(100, () => new Promise((resolve) => setTimeout(() => resolve("slow"), 300)));
    await vi.advanceTimersByTimeAsync(300);
    await expect(result).resolves.toBe("slow");
  });

  it("holds a failure back until the floor too", async () => {
    let settled = false;
    const result = atLeast(1000, async () => {
      throw new Error("refused");
    }).catch((error: Error) => {
      settled = true;
      return error.message;
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe("refused");
  });
});
