"use client";

import { useRouter } from "next/navigation";
import TwoFactorEnrollment from "@/components/TwoFactorEnrollment";

/**
 * Where an admin without two-factor turns it on before the panel opens.
 * The steps are TwoFactorEnrollment's, shared with members' Setting page.
 */
export default function SetupTwoFactor() {
  const router = useRouter();

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-base px-4 py-10">
      <div className="w-full max-w-md rounded-card border border-border-subtle bg-bg-surface p-8">
        <h1 className="font-display text-2xl font-bold">Set up two-factor sign-in</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          Admin accounts sign in with a password and a code from an authenticator app (such as
          1Password, Google Authenticator or Authy).
        </p>
        <TwoFactorEnrollment onEnabled={() => router.push("/admin/dashboard")} />
      </div>
    </main>
  );
}
