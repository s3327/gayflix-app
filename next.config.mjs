import { imageHosts } from "./src/lib/image-hosts.mjs";

// The Content-Security-Policy is set per request (it carries a nonce) by
// src/proxy.ts — see src/lib/csp.ts. These are the static headers.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  // Browsers ignore this over plain http, so it's safe for local
  // `next start`; on the real (https) domain it pins https for 2 years,
  // subdomains included.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Crash reports (src/lib/error-reporting.ts). Built in as "" when
  // unset, rather than left to be looked up in the browser, so the code
  // that checks it can drop Sentry from the site entirely.
  env: {
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "",
  },
  compiler: {
    // Sentry's switches for leaving out its debug logging and its
    // performance tracing, neither of which the site uses (about 25 KB
    // compressed).
    define: {
      __SENTRY_DEBUG__: false,
      __SENTRY_TRACING__: false,
    },
  },
  images: {
    // The sample catalog's placeholder photos, the Blob store uploads go
    // to, and the hosts in IMAGE_HOSTS (see src/lib/image-hosts.mjs).
    remotePatterns: imageHosts().map((hostname) => ({ protocol: "https", hostname })),
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
