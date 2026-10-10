import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "@/lib/email";

const EMAIL = { to: "a@example.com", subject: "Code", text: "Your code is 123456" };

describe("sendEmail", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sends through Resend when RESEND_API_KEY is set", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    await sendEmail(EMAIL, { RESEND_API_KEY: "re_test", EMAIL_FROM: "Gayflix <hi@gayflix.example>" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      from: "Gayflix <hi@gayflix.example>",
      to: ["a@example.com"],
      text: EMAIL.text,
    });
  });

  it("fails loudly when the provider rejects the message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 422 }));
    await expect(sendEmail(EMAIL, { RESEND_API_KEY: "re_test" })).rejects.toThrow("422");
  });

  it("appends to the outbox file when EMAIL_OUTBOX_FILE is set", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "outbox-")), "outbox.jsonl");
    await sendEmail(EMAIL, { EMAIL_OUTBOX_FILE: file });
    await sendEmail({ ...EMAIL, to: "b@example.com" }, { EMAIL_OUTBOX_FILE: file });
    const lines = readFileSync(file, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    expect(lines.map((line) => line.to)).toEqual(["a@example.com", "b@example.com"]);
  });

  it("prints to the console outside production", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await sendEmail(EMAIL, { NODE_ENV: "development" });
    expect(info.mock.calls[0][0]).toContain("123456");
  });

  it("refuses to pretend in production without a provider", async () => {
    await expect(sendEmail(EMAIL, { NODE_ENV: "production" })).rejects.toThrow("No email provider");
  });
});
