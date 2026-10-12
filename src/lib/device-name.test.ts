import { describe, expect, it } from "vitest";
import { deviceName, isMobileDevice } from "@/lib/device-name";

const AGENTS = {
  chromeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15",
  firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  chromeIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1",
  samsungAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36",
  operaMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 OPR/124.0.0.0",
  chromeOs:
    "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
};

describe("deviceName", () => {
  it("names the browser and the system", () => {
    expect(deviceName(AGENTS.chromeWindows)).toBe("Chrome on Windows");
    expect(deviceName(AGENTS.safariMac)).toBe("Safari on macOS");
    expect(deviceName(AGENTS.firefoxLinux)).toBe("Firefox on Linux");
    expect(deviceName(AGENTS.chromeOs)).toBe("Chrome on ChromeOS");
  });

  it("tells Chromium-based browsers apart from Chrome", () => {
    expect(deviceName(AGENTS.edgeWindows)).toBe("Edge on Windows");
    expect(deviceName(AGENTS.operaMac)).toBe("Opera on macOS");
    expect(deviceName(AGENTS.samsungAndroid)).toBe("Samsung Internet on Android");
  });

  it("names phones rather than the Mac their agents mention", () => {
    expect(deviceName(AGENTS.safariIphone)).toBe("Safari on iPhone");
    expect(deviceName(AGENTS.chromeIphone)).toBe("Chrome on iPhone");
  });

  it("falls back when the agent is missing or unknown", () => {
    expect(deviceName(null)).toBe("Unknown device");
    expect(deviceName("")).toBe("Unknown device");
    expect(deviceName("curl/8.9.1")).toBe("Unknown device");
    expect(deviceName("SomeApp/1.0 (Windows NT 10.0)")).toBe("Windows");
  });
});

describe("isMobileDevice", () => {
  it("is true for phones and tablets only", () => {
    expect(isMobileDevice(AGENTS.safariIphone)).toBe(true);
    expect(isMobileDevice(AGENTS.samsungAndroid)).toBe(true);
    expect(isMobileDevice(AGENTS.chromeWindows)).toBe(false);
    expect(isMobileDevice(undefined)).toBe(false);
  });
});
