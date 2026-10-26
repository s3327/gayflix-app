import { describe, expect, it } from "vitest";
import {
  checkNickname,
  cleanReviewBody,
  isReportReason,
  nicknameKey,
  REVIEW_MAX,
} from "./community-rules";

describe("checkNickname", () => {
  it("trims and collapses spaces", () => {
    expect(checkNickname("  Queer   Cinema  ")).toEqual({ nickname: "Queer Cinema" });
  });

  it("accepts letters in any language, digits and . _ -", () => {
    for (const name of ["José_92", "Ана-Мария", "film.fan", "李小龙"]) {
      expect(checkNickname(name)).toEqual({ nickname: name });
    }
  });

  it("rejects names too short, too long or with other characters", () => {
    for (const name of ["ab", "x".repeat(25), "<script>", "@me", "-dash", "hi!", "", 42, null]) {
      expect(checkNickname(name)).toHaveProperty("error");
    }
  });

  it("keeps staff-sounding names for the staff", () => {
    for (const name of ["Admin", "GAYFLIX", "Mod", "moder-ator", "Official"]) {
      expect(checkNickname(name)).toHaveProperty("error");
    }
  });

  it("compares nicknames without case", () => {
    expect(nicknameKey("FilmFan")).toBe(nicknameKey("filmfan"));
  });
});

describe("cleanReviewBody", () => {
  it("trims, drops control characters and long gaps", () => {
    expect(cleanReviewBody("  Loved it.\r\n\r\n\r\n\r\nWatch it!\u0007  ")).toBe("Loved it.\n\nWatch it!");
  });

  it("rejects empty and over-long reviews", () => {
    expect(cleanReviewBody("   \n ")).toBeNull();
    expect(cleanReviewBody("x".repeat(REVIEW_MAX + 1))).toBeNull();
    expect(cleanReviewBody("x".repeat(REVIEW_MAX))).toHaveLength(REVIEW_MAX);
    expect(cleanReviewBody(undefined)).toBeNull();
  });
});

describe("isReportReason", () => {
  it("knows the reasons, and nothing inherited", () => {
    expect(isReportReason("spoilers")).toBe(true);
    expect(isReportReason("toString")).toBe(false);
    expect(isReportReason("Spoilers")).toBe(false);
  });
});
