/**
 * The site's public origin, for absolute URLs (sitemap, robots.txt,
 * Open Graph metadata). Read at build time, so set SITE_URL before the
 * build. On Vercel the production domain is picked up automatically.
 */
export function siteUrl(env: Record<string, string | undefined> = process.env): URL {
  const configured = env.SITE_URL?.trim();
  if (configured) return new URL(configured);
  if (env.VERCEL_PROJECT_PRODUCTION_URL) {
    return new URL(`https://${env.VERCEL_PROJECT_PRODUCTION_URL}`);
  }
  return new URL("http://localhost:3000");
}
