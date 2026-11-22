import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/lib/supabase/config";

/**
 * A Supabase client with the secret (service-role) key, for Auth's admin
 * API: creating, banning and deleting users, resetting their two-factor.
 * It bypasses every access rule, so it's server-only (importing it from
 * a client component fails the build) and keeps no session of its own.
 */
export function supabaseAdmin() {
  const { url } = supabaseConfig();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("SUPABASE_SECRET_KEY isn't set (see .env.example).");
  }
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
