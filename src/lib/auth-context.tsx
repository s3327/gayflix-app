"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { signOut } from "@/lib/auth-actions";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { isActionRedirect } from "@/lib/auth-redirects";

/** The signed-in user as the root layout passes it down (from getSession()). */
export type AuthUser = {
  id: string;
  email: string;
  role: string;
  name: string | null;
  /** Not in the session token; read on the pages that show it. */
  createdAt?: Date | string;
};

type AuthContextValue = {
  isLoggedIn: boolean;
  /** Always false: the user comes with the page, so there's nothing to wait for. */
  isPending: boolean;
  user: AuthUser | null;
  /** True from logout() (or a successful deleteAccount()) until the next sign-in, so pages can tell "logged out on purpose" from "session ended". */
  isLoggingOut: boolean;
  /**
   * Signs out on the server, which then sends the browser to /home.
   * Resolves with "" once signed out, or the error message.
   */
  logout: () => Promise<string>;
  /**
   * Deletes the account and ends the session, like logout(). Resolves
   * with an error message, or "" once the account is gone.
   */
  deleteAccount: (password?: string) => Promise<string>;
  /** Re-reads the session from the server, after changing the user's name or email. */
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * The signed-in user, for client components. The root layout reads the
 * session on the server (getSession() in src/lib/session.ts) and passes
 * the user in; the browser never asks Supabase or the site for it, and
 * nothing here decides access. A server render (router.refresh(), or
 * the next full page load) brings a changed session.
 *
 * Server components and route handlers use getSession() from
 * src/lib/session.ts instead.
 */
export function AuthProvider({
  user: serverUser,
  children,
}: {
  user: AuthUser | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  // Set once logout() or deleteAccount() succeeds, so the page shows a
  // guest straight away instead of waiting for the server render.
  const [signedOut, setSignedOut] = useState(false);

  // Signing in again (a new user appearing) ends the "logged out on
  // purpose" state. Adjusted during render rather than in an effect
  // (React's recommended pattern for state that follows other state).
  const userId = serverUser?.id;
  const [lastUserId, setLastUserId] = useState(userId);
  if (userId !== lastUserId) {
    setLastUserId(userId);
    if (userId) {
      setIsLoggingOut(false);
      setSignedOut(false);
    }
  }

  const logout = useCallback(async () => {
    setIsLoggingOut(true);
    try {
      // Returns only if signing out failed: on success it redirects.
      const { error } = await signOut("/home");
      setIsLoggingOut(false);
      return error;
    } catch (thrown) {
      if (!isActionRedirect(thrown)) {
        setIsLoggingOut(false);
        throw thrown;
      }
      setSignedOut(true);
      return "";
    }
  }, []);

  const deleteAccount = useCallback(
    async (password?: string) => {
      setIsLoggingOut(true);
      const { error } = await authClient.deleteUser(password ? { password } : {});
      if (error) {
        setIsLoggingOut(false);
      } else {
        setSignedOut(true);
        router.refresh();
      }
      return authErrorMessage(error);
    },
    [router]
  );

  const refresh = useCallback(async () => {
    router.refresh();
  }, [router]);

  const user = signedOut ? null : serverUser;
  const value = useMemo<AuthContextValue>(
    () => ({
      isLoggedIn: Boolean(user),
      isPending: false,
      user,
      isLoggingOut,
      logout,
      deleteAccount,
      refresh,
    }),
    [user, isLoggingOut, logout, deleteAccount, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
