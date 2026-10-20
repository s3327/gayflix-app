import { describe, expect, it } from "vitest";
import {
  decodeSubtitleFile,
  isSubtitleLanguage,
  languageName,
  toWebVtt,
} from "@/lib/subtitles";

const SRT = `1
00:00:01,000 --> 00:00:04,250
Hello.

2
00:00:05,500 --> 00:00:07,000
Two lines,
of text.
`;

describe("toWebVtt", () => {
  it("turns SubRip into WebVTT", () => {
    expect(toWebVtt(SRT)).toBe(
      "WEBVTT\n\n00:00:01.000 --> 00:00:04.250\nHello.\n\n00:00:05.500 --> 00:00:07.000\nTwo lines,\nof text.\n"
    );
  });

  it("takes Windows line endings and a byte-order mark", () => {
    expect(toWebVtt(`﻿${SRT.replace(/\n/g, "\r\n")}`)).toBe(toWebVtt(SRT));
  });

  it("keeps cues without a number, and SubRip's position after the time", () => {
    expect(toWebVtt("00:00:01,000 --> 00:00:02,000 X1:10 X2:20\nHi\n")).toBe(
      "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi\n"
    );
  });

  it("keeps WebVTT as it is, with its line endings made plain", () => {
    const vtt = "WEBVTT\r\n\r\nNOTE made by hand\r\n\r\n00:01.000 --> 00:02.000 line:0\r\n<i>Hi</i>\r\n";
    expect(toWebVtt(vtt)).toBe("WEBVTT\n\nNOTE made by hand\n\n00:01.000 --> 00:02.000 line:0\n<i>Hi</i>\n");
  });

  it("leaves out a cue with no text", () => {
    expect(toWebVtt("1\n00:00:01,000 --> 00:00:02,000\n\n\n2\n00:00:03,000 --> 00:00:04,000\nB\n")).toBe(
      "WEBVTT\n\n00:00:03.000 --> 00:00:04.000\nB\n"
    );
  });

  it("refuses anything with no cues", () => {
    expect(toWebVtt("")).toBeNull();
    expect(toWebVtt("WEBVTT\n\n")).toBeNull();
    expect(toWebVtt("just some text\nwithout times\n")).toBeNull();
    expect(toWebVtt("<html><body>Not found</body></html>")).toBeNull();
  });
});

describe("decodeSubtitleFile", () => {
  it("reads UTF-8", () => {
    expect(decodeSubtitleFile(new TextEncoder().encode("Ça va? 日本語"))).toBe("Ça va? 日本語");
  });

  it("falls back to Windows-1252, as older SubRip files are", () => {
    // "Café" with é as the single byte 0xE9.
    expect(decodeSubtitleFile(new Uint8Array([0x43, 0x61, 0x66, 0xe9]))).toBe("Café");
  });

  it("refuses binary files", () => {
    expect(decodeSubtitleFile(new Uint8Array([0x00, 0x01, 0x02, 0x41]))).toBeNull();
  });
});

describe("languages", () => {
  it("names a language in English", () => {
    expect(languageName("en")).toBe("English");
    expect(languageName("pt-BR")).toBe("Brazilian Portuguese");
    expect(languageName("zh-Hant")).toBe("Traditional Chinese");
  });

  it("only takes the languages offered", () => {
    expect(isSubtitleLanguage("es")).toBe(true);
    expect(isSubtitleLanguage("xx")).toBe(false);
    expect(isSubtitleLanguage("EN")).toBe(false);
    expect(isSubtitleLanguage(1)).toBe(false);
  });
});
