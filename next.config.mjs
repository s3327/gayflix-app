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
  images: {
    remotePatterns: [
      // Deterministic placeholder photos for mock data (mock-titles.ts,
      // mock-media.ts, ...). Remove once real uploaded/imported artwork
      // replaces these.
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
      // add real poster/thumbnail CDN domains here once you have them, e.g.:
      // { protocol: 'https', hostname: 'your-cdn.example.com' },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
