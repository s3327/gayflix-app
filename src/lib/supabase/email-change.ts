import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/lib/supabase/config";

export type EmailChangeStep =
  | { accepted: true }
  | { changed: string }
  | { error: { code?: string; status?: number } };

/**
 * Checks one code of an email change. With secure email change on,
 * Supabase Auth emails a code to the current address and another to the
 * new one, and each is checked against its own address (checked on the
 * local stack: a code given with the other address is refused). The
 * first code accepted answers without a session (`accepted`); the second
 * one changes the email (`changed`, with the account's id). Either order
 * works, an accepted code can't be used again, and a wrong one doesn't
 * use it up.
 *
 * The change's answer is a brand-new session (password-only, so aal1),
 * which must not replace the user's own: it would show up as an extra
 * device, and an account with two-factor would fall back to its code
 * step. So this uses a throwaway client that keeps no session and
 * touches no cookies, and ends that new session at once. The caller then
 * refreshes the user's own session to carry the new email.
 */
export async function verifyEmailChangeCode(email: string, code: string): Promise<EmailChangeStep> {
  const { url, publishableKey } = supabaseConfig();
  const client = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.verifyOtp({ email, token: code, type: "email_change" });
  if (error) return { error };
  if (!data.session) return { accepted: true };
  await client.auth.signOut({ scope: "local" });
  return { changed: data.session.user.id };
}
