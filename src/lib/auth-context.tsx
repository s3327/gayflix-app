"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { authClient } from "@/lib/auth-client";

type AuthUser = { id: string; name: string; email: string; role?: string | null };

type AuthContextValue = {
  isLoggedIn: boolean;
  /** True until the first session check finishes (always on the server render). */
  isPending: boolean;
  user: AuthUser | null;
  /** True from logout() until the next sign-in, so pages can tell "logged out on purpose" from "session ended". */
  isLoggingOut: boolean;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * The signed-in user, for client components. Backed by the real session
 * (an httpOnly cookie checked against the database through
 * /api/auth/get-session), so nothing here can be forged from the
 * browser. Signing in happens on the auth pages through `authClient`;
 * the session updates here automatically when it does.
 *
 * Server components and route handlers use getSession() from
 * src/lib/session.ts instead.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data, isPending } = authClient.useSession();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Signing in again (a new user appearing) ends the "logged out on
  // purpose" state. Adjusted during render rather than in an effect
  // (React's recommended pattern for state that follows other state).
  const userId = data?.user?.id;
  const [lastUserId, setLastUserId] = useState(userId);
  if (userId !== lastUserId) {
    setLastUserId(userId);
    if (userId) setIsLoggingOut(false);
  }

  const logout = useCallback(async () => {
    setIsLoggingOut(true);
    await authClient.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoggedIn: Boolean(data?.user),
      isPending,
      user: data?.user ?? null,
      isLoggingOut,
      logout,
    }),
    [data, isPending, isLoggingOut, logout]
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
