/**
 * Connection settings for node-postgres (the app's Prisma adapter in
 * src/lib/db.ts, and scripts/make-admin.mjs).
 *
 * Production runs on Supabase. Its pooler takes TLS, but its certificate
 * is signed by Supabase's own root CA, which Node doesn't trust out of
 * the box. So a Supabase connection needs DATABASE_CA_CERT (the PEM from
 * Supabase → Database → Settings → SSL Configuration): it's encrypted and
 * the server is verified against that certificate. Without it, nothing
 * connects, rather than connecting unverified. The one exception, for
 * trying things on your own computer: DATABASE_TLS_INSECURE=1 encrypts
 * without verifying, and is refused on Vercel (production and previews).
 *
 * Any `sslmode` in the URL is dropped, because node-postgres would let it
 * override these settings (and reads `require` as "verify against Node's
 * own CAs", which fails for Supabase).
 *
 * Any other host (a local Postgres, CI's) is used exactly as given.
 */

const SUPABASE_HOST = /\.supabase\.(com|co)$/i;
const SSL_PARAMS = ["sslmode", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat", "pgbouncer"];

/**
 * @param {string | undefined} connectionString
 * @param {string | undefined} caCert PEM text; literal "\n"s are allowed.
 * @param {Record<string, string | undefined>} env
 * @returns {{ connectionString: string | undefined, ssl?: { ca?: string, rejectUnauthorized: boolean } }}
 */
export function postgresConfig(
  connectionString = process.env.DATABASE_URL,
  caCert = process.env.DATABASE_CA_CERT,
  env = process.env
) {
  if (!connectionString) return { connectionString };
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    return { connectionString };
  }
  if (!SUPABASE_HOST.test(url.hostname)) return { connectionString };

  for (const name of SSL_PARAMS) url.searchParams.delete(name);
  const ca = caCert?.trim() ? caCert.trim().replace(/\\n/g, "\n") : undefined;
  if (ca) return { connectionString: url.toString(), ssl: { ca, rejectUnauthorized: true } };

  if (env.DATABASE_TLS_INSECURE === "1" && !env.VERCEL_ENV) {
    return { connectionString: url.toString(), ssl: { rejectUnauthorized: false } };
  }
  throw new Error(
    "DATABASE_CA_CERT is required for a Supabase database: paste the certificate from " +
      "Supabase → Project Settings → Database → SSL Configuration (docs/DEPLOYMENT.md, Part 3)."
  );
}
