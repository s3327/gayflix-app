import { describe, expect, it } from "vitest";
import { isMostLiked, isRating, MOST_LIKED_MIN_RATINGS } from "./ratings";

describe("isRating", () => {
  it("accepts the three ratings", () => {
    expect(["not_for_me", "like", "love"].every(isRating)).toBe(true);
  });

  it("rejects anything else", () => {
    for (const value of ["", "Like", "dislike", null, undefined, 1, ["like"]]) {
      expect(isRating(value)).toBe(false);
    }
  });
});

describe("isMostLiked", () => {
  it("needs enough ratings", () => {
    const few = MOST_LIKED_MIN_RATINGS - 1;
    expect(isMostLiked({ liked: few, total: few })).toBe(false);
    expect(isMostLiked({ liked: MOST_LIKED_MIN_RATINGS, total: MOST_LIKED_MIN_RATINGS })).toBe(true);
  });

  it("needs four in five to like it", () => {
    expect(isMostLiked({ liked: 8, total: 10 })).toBe(true);
    expect(isMostLiked({ liked: 7, total: 10 })).toBe(false);
  });

  it("is false with no ratings", () => {
    expect(isMostLiked({ liked: 0, total: 0 })).toBe(false);
  });
});
