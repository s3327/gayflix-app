/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      // Deterministic placeholder photos for mock data (mock-titles.ts,
      // mock-continue-watching.ts). Remove once real uploaded/imported
      // artwork replaces these.
      { protocol: "https", hostname: "picsum.photos" },
      // add real poster/thumbnail CDN domains here once you have them, e.g.:
      // { protocol: 'https', hostname: 'your-cdn.example.com' },
    ],
  },
};

export default nextConfig;
