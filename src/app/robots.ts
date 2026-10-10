import type { MetadataRoute } from "next";

/**
 * Keeps crawlers out of per-user pages and auth flows. The admin panel
 * lives on its own subdomain and is marked noindex there (proxy header +
 * admin layout metadata), so it isn't listed here.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/account", "/list/", "/login", "/signup", "/verify-email", "/forgot-password", "/api/"],
    },
  };
}
