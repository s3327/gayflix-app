/**
 * Interim protection for the admin panel until real admin accounts exist:
 * HTTP Basic Auth against one shared credential pair from the
 * environment. It is checked in src/proxy.ts for every /admin request and
 * again in the admin root layout. Any future admin API route or server
 * action must call checkAdminAccess itself too: the proxy only covers
 * /admin paths, not /api.
 *
 * - Both ADMIN_BASIC_AUTH_USER and ADMIN_BASIC_AUTH_PASSWORD set:
 *   a matching `Authorization: Basic …` header is required.
 * - Either unset in development: allowed, so localhost:3000/admin keeps
 *   working with no setup.
 * - Either unset in production: the panel is disabled (fail closed),
 *   never silently public.
 */

export type AdminAccess = "allowed" | "unauthorized" | "disabled";

type AdminEnv = {
  NODE_ENV?: string;
  ADMIN_BASIC_AUTH_USER?: string;
  ADMIN_BASIC_AUTH_PASSWORD?: string;
};

export const ADMIN_AUTH_REALM = "Gayflix Admin";

/** Compares in time that depends only on the lengths, not on where the first difference is. */
function safeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

function decodeBasicCredentials(
  authorization: string
): { user: string; password: string } | null {
  const match = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(authorization);
  if (!match) return null;
  let decoded: string;
  try {
    const binary = atob(match[1]);
    decoded = new TextDecoder().decode(
      Uint8Array.from(binary, (char) => char.charCodeAt(0))
    );
  } catch {
    return null;
  }
  const separator = decoded.indexOf(":");
  if (separator === -1) return null;
  return { user: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
}

export function checkAdminAccess(
  authorization: string | null | undefined,
  env: AdminEnv = process.env
): AdminAccess {
  const expectedUser = env.ADMIN_BASIC_AUTH_USER;
  const expectedPassword = env.ADMIN_BASIC_AUTH_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    return env.NODE_ENV === "production" ? "disabled" : "allowed";
  }

  const credentials = authorization ? decodeBasicCredentials(authorization) : null;
  if (!credentials) return "unauthorized";

  // Both comparisons always run, so timing doesn't reveal which one failed.
  const userMatches = safeEqual(credentials.user, expectedUser);
  const passwordMatches = safeEqual(credentials.password, expectedPassword);
  return userMatches && passwordMatches ? "allowed" : "unauthorized";
}
