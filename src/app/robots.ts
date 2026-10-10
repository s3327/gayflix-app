import type { MetadataRoute } from "next";

/**
 * Keeps crawlers out of the admin panel, per-user pages and auth flows.
 * Admin pages are also marked noindex (proxy header + admin layout
 * metadata), since robots.txt alone is only a request.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/account", "/list/", "/login", "/signup", "/verify-email", "/forgot-password", "/api/"],
    },
  };
}
