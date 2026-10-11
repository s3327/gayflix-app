import { describe, expect, it } from "vitest";
import { sniffImageType } from "@/lib/image-upload";

function bytes(...parts: (string | number[])[]) {
  return new Uint8Array(parts.flatMap((part) => (typeof part === "string" ? [...part].map((c) => c.charCodeAt(0)) : part)));
}

/** An "ftyp" box with these brands: the main one, then the others. */
function ftyp(main: string, ...others: string[]) {
  const size = 16 + others.length * 4;
  return bytes([0, 0, 0, size], "ftyp", main, [0, 0, 0, 0], ...others, [0, 0, 0, 8], "meta");
}

describe("sniffImageType", () => {
  it("reads the type from the file's first bytes", () => {
    expect(sniffImageType(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageType(bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffImageType(bytes("RIFF", [1, 2, 3, 4], "WEBPVP8 "))).toBe("image/webp");
    expect(sniffImageType(ftyp("avif", "mif1", "miaf"))).toBe("image/avif");
    expect(sniffImageType(ftyp("mif1", "miaf", "avif"))).toBe("image/avif");
    expect(sniffImageType(ftyp("avis"))).toBe("image/avif");
  });

  it("refuses anything else, whatever the file is called", () => {
    expect(sniffImageType(bytes('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeUndefined();
    expect(sniffImageType(bytes("GIF89a"))).toBeUndefined();
    expect(sniffImageType(bytes("%PDF-1.7"))).toBeUndefined();
    expect(sniffImageType(bytes("RIFF", [1, 2, 3, 4], "WAVE"))).toBeUndefined();
    // HEIC: an ftyp box without an AVIF brand, even past the box's end.
    expect(sniffImageType(bytes([0, 0, 0, 16], "ftyp", "heic", [0, 0, 0, 0], "avif"))).toBeUndefined();
    expect(sniffImageType(new Uint8Array())).toBeUndefined();
    expect(sniffImageType(bytes([0xff, 0xd8]))).toBeUndefined();
  });
});
