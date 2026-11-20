import { unstable_rethrow } from "next/navigation";
import { signInWithGoogle } from "@/lib/auth-actions";

/*
 * For the forms that call the auth server actions that redirect on
 * success (signIn, signOut and signInWithGoogle in
 * src/lib/auth-actions.ts). A server action's redirect rejects its
 * promise in the browser, and Next follows it on its own.
 */

/** Whether `thrown` is a server action's redirect, rather than a real failure. */
export function isActionRedirect(thrown: unknown): boolean {
  try {
    unstable_rethrow(thrown);
    return false;
  } catch {
    return true;
  }
}

/**
 * Starts Google sign-in: the browser leaves for Google and comes back to
 * `next`. Resolves with "" once it's on its way, or with the reason it
 * couldn't start.
 */
export async function startGoogleSignIn(next: string): Promise<string> {
  try {
    return (await signInWithGoogle(next)).error;
  } catch (thrown) {
    if (isActionRedirect(thrown)) return "";
    throw thrown;
  }
}
