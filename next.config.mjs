const isDev = process.env.NODE_ENV !== "production";

// Content Security Policy. 'unsafe-inline' for scripts is required by
// Next.js's inline bootstrap scripts unless every page moves to
// nonce-based rendering; everything else is locked to this origin.
// Dev additionally needs eval (React Refresh) and websockets (HMR).
//
// When a real video player arrives, add its embed origin to frame-src
// (e.g. "frame-src https://player.example.com"), or the embed won't load.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Posters go through next/image (/_next/image on this origin), so no
  // third-party image host needs to be listed here.
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "media-src 'self' blob:",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
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
