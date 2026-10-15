import dns from "node:dns/promises";
import net from "node:net";

/**
 * Checks whether an IPv4 address is in a private, loopback, link-local, or reserved range.
 */
export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed IPv4 is treated as unsafe
  }

  const [a, b] = parts;

  // 0.0.0.0/8
  if (a === 0) return true;
  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;
  // 10.0.0.0/8 (Private)
  if (a === 10) return true;
  // 172.16.0.0/12 (Private: 172.16.0.0 – 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16 (Private)
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16 (Link-local / Cloud metadata: 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 100.64.0.0/10 (Carrier-grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 (Documentation/TEST-NET)
  if (a === 192 && b === 0 && parts[2] === 2) return true;
  if (a === 198 && b === 51 && parts[2] === 100) return true;
  if (a === 203 && b === 0 && parts[2] === 113) return true;
  // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
  if (a >= 224) return true;

  return false;
}

/**
 * Checks whether an IPv6 address is in a loopback, unique local, link-local, or IPv4-mapped private range.
 */
export function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  // Loopback ::1
  if (normalized === "::1" || normalized === "0000:0000:0000:0000:0000:0000:0000:0001") return true;
  // Unspecified ::
  if (normalized === "::" || normalized === "0000:0000:0000:0000:0000:0000:0000:0000") return true;

  // Unique local addresses (fc00::/7 -> fc.. or fd..)
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;

  // Link-local addresses (fe80::/10 -> fe8, fe9, fea, feb)
  if (/^fe[89ab]/.test(normalized)) return true;

  // IPv4-mapped IPv6 (::ffff:x.x.x.x)
  if (normalized.startsWith("::ffff:")) {
    const ipv4Part = normalized.slice(7);
    if (net.isIPv4(ipv4Part)) {
      return isPrivateIPv4(ipv4Part);
    }
    return true;
  }

  return false;
}

/**
 * Validates whether an IP string is private or loopback.
 */
export function isPrivateIP(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true;
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
  "instance-data",
]);

/**
 * Synchronous URL validation used at settings save time.
 * Enforces HTTPS protocol, valid hostname, and rejects localhost/private IPs.
 */
export function isPublicHttpsUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    if (url.protocol !== "https:") return false;

    const hostname = url.hostname.toLowerCase();
    if (!hostname) return false;

    // Reject blocked hostnames and suffixes
    if (BLOCKED_HOSTNAMES.has(hostname)) return false;
    if (
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal")
    ) {
      return false;
    }

    // Strip brackets for IPv6 literals (e.g. "[::1]" -> "::1")
    const cleanHost = hostname.replace(/^\[|\]$/g, "");

    // If hostname is an IP literal, ensure it is not private
    if (net.isIP(cleanHost)) {
      return !isPrivateIP(cleanHost);
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Asynchronous DNS lookup check used at dispatch time.
 * Resolves hostname to IPs and asserts that none point to private / loopback addresses.
 */
export async function assertPublicHost(hostname: string): Promise<void> {
  const lower = hostname.toLowerCase();
  const cleanHost = lower.replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(lower) || lower.endsWith(".localhost") || lower.endsWith(".local") || lower.endsWith(".internal")) {
    throw new Error(`SSRF blocked: Disallowed hostname '${hostname}'`);
  }

  if (net.isIP(cleanHost)) {
    if (isPrivateIP(cleanHost)) {
      throw new Error(`SSRF blocked: Private IP address '${hostname}'`);
    }
    return;
  }

  // Resolve hostname
  const records = await dns.lookup(lower, { all: true });
  for (const record of records) {
    if (isPrivateIP(record.address)) {
      throw new Error(`SSRF blocked: Hostname '${hostname}' resolved to private IP '${record.address}'`);
    }
  }
}
