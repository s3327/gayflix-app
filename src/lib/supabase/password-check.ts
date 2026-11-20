import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/lib/supabase/config";

/**
 * Whether `password` is the account's password, for actions that ask for
 * it again (turning two-factor off). Signs in with a throwaway client
 * that keeps no session and touches no cookies, then ends the session
 * that sign-in made, so the user's own session is left as it was.
 * "error" when Supabase couldn't say (unreachable, rate-limited).
 */
export async function checkPassword(email: string, password: string): Promise<"ok" | "wrong" | "error"> {
  const { url, publishableKey } = supabaseConfig();
  const client = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) return error.code === "invalid_credentials" ? "wrong" : "error";
  if (data.session) await client.auth.signOut({ scope: "local" });
  return "ok";
}
