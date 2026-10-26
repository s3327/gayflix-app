import { describe, expect, it } from "vitest";
import {
  codeEmail,
  emailChangedEmail,
  escapeHtml,
  existingAccountEmail,
  newEpisodesEmail,
  newSignInEmail,
  resetPasswordEmail,
} from "@/lib/email-templates";

const ORIGIN = "https://gayflix.example";

describe("codeEmail", () => {
  it("says what the code is for, in both versions", () => {
    const email = codeEmail("email-verification", "426463", 10, ORIGIN);
    expect(email.subject).toBe("Your Gayflix verification code");
    expect(email.text).toContain("confirm your email and finish signing up");
    expect(email.text).toContain("Your Gayflix code is 426463");
    expect(email.text).toContain("expires in 10 minutes");
    expect(email.html).toContain("Confirm your email");
    expect(email.html).toContain("426463");
    expect(codeEmail("change-email", "111111", 10, ORIGIN).text).toContain("make this your Gayflix email");
  });

  it("has the code as the only six-digit number, which is how people and tests find it", () => {
    for (const purpose of ["email-verification", "forget-password", "change-email"] as const) {
      expect(codeEmail(purpose, "426463", 10, ORIGIN).text.match(/\b\d{6}\b/g)).toEqual(["426463"]);
    }
  });

  it("shows the logo from the site", () => {
    expect(codeEmail("email-verification", "426463", 10, ORIGIN).html).toContain(
      `src="${ORIGIN}/brand/gayflix-logo-full.png"`
    );
  });
});

describe("resetPasswordEmail", () => {
  it("puts the link on a button and in the text", () => {
    const url = "https://gayflix.example/reset-password/abc?callbackURL=%2Freset-password&x=1";
    const email = resetPasswordEmail(url, ORIGIN);
    expect(email.subject).toBe("Reset your Gayflix password");
    expect(/(https?:\/\/\S+)/.exec(email.text)?.[1]).toBe(url);
    expect(email.html).toContain(`href="${escapeHtml(url)}"`);
    expect(email.html).toContain(">Reset password</a>");
  });
});

describe("existingAccountEmail", () => {
  it("links to log in and to reset the password", () => {
    const email = existingAccountEmail(ORIGIN);
    expect(email.text).toContain("already has an account");
    expect(email.text).toContain(`${ORIGIN}/login`);
    expect(email.text).toContain(`${ORIGIN}/forgot-password`);
    expect(email.html).toContain(`href="${ORIGIN}/login"`);
  });
});

describe("emailChangedEmail", () => {
  it("names the new address, escaped in the HTML", () => {
    const email = emailChangedEmail("<b>new</b>@example.com", ORIGIN);
    expect(email.text).toContain("changed to <b>new</b>@example.com");
    expect(email.html).toContain("&lt;b&gt;new&lt;/b&gt;@example.com");
    expect(email.html).not.toContain("<b>new</b>");
  });
});

describe("escapeHtml", () => {
  it("escapes markup and quotes", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});

describe("newEpisodesEmail", () => {
  const unsubscribe = `${ORIGIN}/unsubscribe?u=u1&t=sig`;

  it("names one series in the subject, and lists its episodes", () => {
    const email = newEpisodesEmail(
      [{ title: "The Brownstone", url: `${ORIGIN}/series/the-brownstone`, episodes: ["S2 E1 Homecoming", "S2 E2 Rent"] }],
      unsubscribe,
      ORIGIN
    );
    expect(email.subject).toBe("New on Gayflix: The Brownstone");
    expect(email.text).toContain("The Brownstone: S2 E1 Homecoming, S2 E2 Rent");
    expect(email.text).toContain(unsubscribe);
    expect(email.html).toContain(`href="${ORIGIN}/series/the-brownstone"`);
  });

  it("counts series, and episodes past ten", () => {
    const episodes = Array.from({ length: 12 }, (_, i) => `S1 E${i + 1}`);
    const email = newEpisodesEmail(
      [
        { title: "A", url: `${ORIGIN}/series/a`, episodes },
        { title: "<B>", url: `${ORIGIN}/series/b`, episodes: ["S1 E1"] },
      ],
      unsubscribe,
      ORIGIN
    );
    expect(email.subject).toBe("New episodes of 2 series you favorited");
    expect(email.text).toContain("S1 E10, and 2 more");
    expect(email.html).not.toContain("<B>");
  });
});

describe("newSignInEmail", () => {
  it("names the device and the time, and links to Setting", () => {
    const email = newSignInEmail("Firefox on Linux", new Date("2026-10-26T14:05:00Z"), ORIGIN);
    expect(email.subject).toBe("New sign-in to your Gayflix account");
    expect(email.text).toContain("on Firefox on Linux, on October 26, 2026 at 2:05 PM UTC.");
    expect(email.text).toContain(`${ORIGIN}/account/setting`);
    expect(email.html).toContain(`href="${ORIGIN}/account/setting"`);
  });

  it("escapes the device name in the HTML", () => {
    expect(newSignInEmail("<script>", new Date(), ORIGIN).html).not.toContain("<script>");
  });
});
