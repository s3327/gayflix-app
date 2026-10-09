"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { usePersistedState } from "@/lib/use-persisted-state";

const STORAGE_KEY = "gayflix:auth";

type AuthContextValue = {
  isLoggedIn: boolean;
  login: () => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * No real backend/session yet — this is a plain localStorage-backed
 * boolean, same "UI only" status as everything else in this scaffold.
 * `login()` is called by /login, /signup, and /verify-email once their
 * (fake) flow completes; `logout()` is called from Header's account
 * menu. Lives at the root layout, not (main)'s, since /login/etc. are
 * outside the (main) route group but still need to call login().
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = usePersistedState<boolean>(STORAGE_KEY, false);

  const login = useCallback(() => setIsLoggedIn(true), [setIsLoggedIn]);
  const logout = useCallback(() => setIsLoggedIn(false), [setIsLoggedIn]);

  const value = useMemo<AuthContextValue>(
    () => ({ isLoggedIn, login, logout }),
    [isLoggedIn, login, logout]
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
