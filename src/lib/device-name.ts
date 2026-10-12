/*
 * A readable name for a signed-in device on /account/setting, such as
 * "Chrome on Windows", from the browser's user agent. Only names, never
 * versions or addresses: it's there so people recognize their devices.
 */

// Order matters: Edge, Opera and Samsung Internet also say "Chrome", and
// Chrome also says "Safari".
const BROWSERS: [RegExp, string][] = [
  [/\bEdg(e|A|iOS)?\//, "Edge"],
  [/\bOPR\/|\bOpera\b/, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\bFirefox\/|\bFxiOS\//, "Firefox"],
  [/\bChrome\/|\bCriOS\//, "Chrome"],
  [/\bVersion\/[\d.]+.*\bSafari\//, "Safari"],
];

// iPhone and iPad before Mac (their agents say "like Mac OS X"), Android
// before Linux.
const SYSTEMS: [RegExp, string][] = [
  [/\biPhone\b/, "iPhone"],
  [/\biPad\b/, "iPad"],
  [/\bAndroid\b/, "Android"],
  [/\bWindows\b/, "Windows"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bLinux\b/, "Linux"],
];

function match(userAgent: string, patterns: [RegExp, string][]): string | undefined {
  return patterns.find(([pattern]) => pattern.test(userAgent))?.[1];
}

export function deviceName(userAgent: string | null | undefined): string {
  const browser = userAgent ? match(userAgent, BROWSERS) : undefined;
  const system = userAgent ? match(userAgent, SYSTEMS) : undefined;
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? "Unknown device";
}

/** Phones and tablets, for the device's icon. */
export function isMobileDevice(userAgent: string | null | undefined): boolean {
  return Boolean(userAgent && /\b(iPhone|iPad|Android|Mobile)\b/.test(userAgent));
}
