/**
 * Connection settings for node-postgres (the app's Prisma adapter in
 * src/lib/db.ts, and scripts/make-admin.mjs).
 *
 * Production runs on Supabase. Its pooler takes TLS, but its certificate
 * is signed by Supabase's own root CA, which Node doesn't trust out of
 * the box. So for a Supabase host:
 * - with DATABASE_CA_CERT set (the PEM from Supabase → Database →
 *   Settings → SSL Configuration), the connection is encrypted and the
 *   server is verified against it;
 * - without it, the connection is still encrypted, but not verified.
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
 * @returns {{ connectionString: string | undefined, ssl?: { ca?: string, rejectUnauthorized: boolean } }}
 */
export function postgresConfig(
  connectionString = process.env.DATABASE_URL,
  caCert = process.env.DATABASE_CA_CERT
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
  const ca = caCert?.trim() ? caCert.replace(/\\n/g, "\n") : undefined;
  return {
    connectionString: url.toString(),
    ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
  };
}
