import { describe, expect, it } from "vitest";
import { videoHostAllowed, videoHosts, videoHostSources, videoUrlAllowed } from "@/lib/video-hosts";
import { detectKind, embedSrc, parseVideoSource, type VideoSourceValues } from "@/lib/video-source";

const HOSTS = ["player.example.com", "*.b-cdn.net"];

function source(overrides: Partial<VideoSourceValues> = {}): VideoSourceValues {
  return { label: "Server 1", kind: "auto", url: "https://player.example.com/embed/abc", ...overrides };
}

describe("videoHosts", () => {
  it("reads hostnames and *. entries from VIDEO_HOSTS", () => {
    expect(
      videoHosts({ VIDEO_HOSTS: " Player.Example.com , *.b-cdn.net,https://cdn.example.org/videos,,not a host" })
    ).toEqual(["player.example.com", "*.b-cdn.net", "cdn.example.org"]);
    expect(videoHosts({})).toEqual([]);
  });

  it("allows a *. entry's subdomains, not the host itself", () => {
    expect(videoHostAllowed("vz-123.b-cdn.net", HOSTS)).toBe(true);
    expect(videoHostAllowed("b-cdn.net", HOSTS)).toBe(false);
    expect(videoHostAllowed("evilb-cdn.net", HOSTS)).toBe(false);
    expect(videoHostAllowed("player.example.com", HOSTS)).toBe(true);
    expect(videoHostAllowed("sub.player.example.com", HOSTS)).toBe(false);
  });

  it("checks stored links again", () => {
    expect(videoUrlAllowed("https://player.example.com/embed/abc", HOSTS)).toBe(true);
    expect(videoUrlAllowed("http://player.example.com/embed/abc", HOSTS)).toBe(false);
    expect(videoUrlAllowed("https://player.example.com:8443/embed/abc", HOSTS)).toBe(false);
    expect(videoUrlAllowed("https://other.example.com/embed/abc", HOSTS)).toBe(false);
    expect(videoUrlAllowed("not a link", HOSTS)).toBe(false);
  });

  it("turns hosts into Content-Security-Policy sources", () => {
    expect(videoHostSources(HOSTS)).toEqual(["https://player.example.com", "https://*.b-cdn.net"]);
  });
});

describe("parseVideoSource", () => {
  it("takes an embed link", () => {
    expect(parseVideoSource(source(), HOSTS)).toEqual({
      ok: true,
      data: { label: "Server 1", kind: "embed", url: "https://player.example.com/embed/abc" },
    });
  });

  it("works out the type from the link", () => {
    const hls = parseVideoSource(source({ url: "https://vz-1.b-cdn.net/abc/playlist.m3u8" }), HOSTS);
    expect(hls.ok && hls.data.kind).toBe("hls");
    const file = parseVideoSource(source({ url: "https://vz-1.b-cdn.net/abc/movie.MP4?token=x" }), HOSTS);
    expect(file.ok && file.data.kind).toBe("file");
  });

  it("keeps the type an admin chose", () => {
    const parsed = parseVideoSource(source({ kind: "hls", url: "https://vz-1.b-cdn.net/abc/stream" }), HOSTS);
    expect(parsed.ok && parsed.data.kind).toBe("hls");
  });

  it("takes the link out of a provider's embed code", () => {
    const code =
      '<iframe width="560" height="315" src="https://player.example.com/embed/abc?autoplay=0&amp;t=1" allowfullscreen></iframe>';
    expect(parseVideoSource(source({ url: code }), HOSTS)).toEqual({
      ok: true,
      data: { label: "Server 1", kind: "embed", url: "https://player.example.com/embed/abc?autoplay=0&t=1" },
    });
  });

  it("refuses embed code for a stream or a file", () => {
    const code = '<iframe src="https://player.example.com/embed/abc"></iframe>';
    const parsed = parseVideoSource(source({ kind: "file", url: code }), HOSTS);
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.errors.url).toMatch(/embed code/);
  });

  it("refuses links it can't play", () => {
    const problem = (url: string, hosts = HOSTS) => {
      const parsed = parseVideoSource(source({ url }), hosts);
      return parsed.ok ? null : parsed.errors.url;
    };
    expect(problem("")).toMatch(/Paste/);
    expect(problem("player.example.com/embed/abc")).toMatch(/full link/);
    expect(problem("http://player.example.com/embed/abc")).toMatch(/https/);
    expect(problem("https://other.example.com/embed/abc")).toMatch(/player\.example\.com, \*\.b-cdn\.net/);
    expect(problem("https://player.example.com/embed/abc", [])).toMatch(/No video hosts/);
    expect(problem("<div>no iframe here</div>")).toMatch(/no <iframe> link/);
    expect(problem(`https://player.example.com/${"a".repeat(2000)}`)).toMatch(/too long/);
  });

  it("needs a short name and a known type", () => {
    const parsed = parseVideoSource(source({ label: " ", kind: "torrent" }), HOSTS);
    expect(parsed).toEqual({
      ok: false,
      errors: { label: "Give it a name, like Server 1.", kind: "Choose a type." },
    });
    const long = parseVideoSource(source({ label: "x".repeat(41) }), HOSTS);
    expect(!long.ok && long.errors.label).toMatch(/40 characters/);
  });
});

describe("embedSrc", () => {
  it("reads quoted, single-quoted and bare src attributes", () => {
    expect(embedSrc('<iframe src="https://a.example.com/1"></iframe>')).toBe("https://a.example.com/1");
    expect(embedSrc("<IFRAME SRC='https://a.example.com/2'>")).toBe("https://a.example.com/2");
    expect(embedSrc("<iframe allowfullscreen src=https://a.example.com/3>")).toBe("https://a.example.com/3");
  });

  it("adds https to a link without a scheme", () => {
    expect(embedSrc('<iframe src="//a.example.com/4"></iframe>')).toBe("https://a.example.com/4");
  });

  it("ignores a data-src or other attributes ending in src", () => {
    expect(embedSrc('<iframe data-src="https://a.example.com/5"></iframe>')).toBeNull();
    expect(embedSrc("<video src='https://a.example.com/6'>")).toBeNull();
  });
});

describe("detectKind", () => {
  it("goes by the path, not the query", () => {
    expect(detectKind(new URL("https://a.example.com/x/index.m3u8?sig=1"))).toBe("hls");
    expect(detectKind(new URL("https://a.example.com/x/movie.webm"))).toBe("file");
    expect(detectKind(new URL("https://a.example.com/embed/x?file=movie.mp4"))).toBe("embed");
  });
});
