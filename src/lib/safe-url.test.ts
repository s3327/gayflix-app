import { describe, expect, it } from "vitest";
import { isPublicHttpsUrl, isPrivateIPv4, isPrivateIPv6, assertPublicHost } from "./safe-url";

describe("safe-url SSRF prevention", () => {
  it("rejects non-https URLs", () => {
    expect(isPublicHttpsUrl("http://example.com/webhook")).toBe(false);
    expect(isPublicHttpsUrl("ftp://example.com/webhook")).toBe(false);
    expect(isPublicHttpsUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects localhost and loopback", () => {
    expect(isPublicHttpsUrl("https://localhost/webhook")).toBe(false);
    expect(isPublicHttpsUrl("https://foo.localhost/webhook")).toBe(false);
    expect(isPublicHttpsUrl("https://127.0.0.1/webhook")).toBe(false);
    expect(isPublicHttpsUrl("https://127.0.0.5:8443/webhook")).toBe(false);
    expect(isPublicHttpsUrl("https://[::1]/webhook")).toBe(false);
  });

  it("rejects cloud metadata and internal domains", () => {
    expect(isPublicHttpsUrl("https://metadata.google.internal/computeMetadata/v1/")).toBe(false);
    expect(isPublicHttpsUrl("https://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isPublicHttpsUrl("https://server.internal/webhook")).toBe(false);
    expect(isPublicHttpsUrl("https://service.local/webhook")).toBe(false);
  });

  it("rejects RFC1918 private IPv4 literals", () => {
    expect(isPrivateIPv4("10.0.0.1")).toBe(true);
    expect(isPrivateIPv4("172.16.0.1")).toBe(true);
    expect(isPrivateIPv4("172.31.255.255")).toBe(true);
    expect(isPrivateIPv4("192.168.1.1")).toBe(true);
    expect(isPrivateIPv4("169.254.1.1")).toBe(true);
    expect(isPrivateIPv4("127.0.0.1")).toBe(true);

    expect(isPrivateIPv4("8.8.8.8")).toBe(false);
    expect(isPrivateIPv4("1.1.1.1")).toBe(false);
    expect(isPrivateIPv4("172.32.0.1")).toBe(false);
  });

  it("rejects unique local / link-local IPv6", () => {
    expect(isPrivateIPv6("::1")).toBe(true);
    expect(isPrivateIPv6("fe80::1")).toBe(true);
    expect(isPrivateIPv6("fc00::1")).toBe(true);
    expect(isPrivateIPv6("fd00::1")).toBe(true);
    expect(isPrivateIPv6("::ffff:192.168.1.1")).toBe(true);
    expect(isPrivateIPv6("2606:4700:4700::1111")).toBe(false);
  });

  it("accepts valid public https endpoints", () => {
    expect(isPublicHttpsUrl("https://discord.com/api/webhooks/123/xyz")).toBe(true);
    expect(isPublicHttpsUrl("https://hooks.slack.com/services/T00/B00/X00")).toBe(true);
    expect(isPublicHttpsUrl("https://example.com:8443/webhook")).toBe(true);
  });

  it("assertPublicHost throws on localhost", async () => {
    await expect(assertPublicHost("localhost")).rejects.toThrow("SSRF blocked");
    await expect(assertPublicHost("127.0.0.1")).rejects.toThrow("SSRF blocked");
    await expect(assertPublicHost("169.254.169.254")).rejects.toThrow("SSRF blocked");
  });
});
