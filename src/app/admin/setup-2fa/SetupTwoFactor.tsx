"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import TwoFactorEnrollment from "@/components/TwoFactorEnrollment";

/**
 * Where an admin turns on two-factor sign-in.
 * The steps are TwoFactorEnrollment's, shared with members' Setting page.
 */
export default function SetupTwoFactor() {
  const router = useRouter();

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-base px-4 py-10">
      <div className="w-full max-w-md rounded-card border border-border-subtle bg-bg-surface p-8">
        <h1 className="font-display text-2xl font-bold">Set up two-factor sign-in</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          Admin accounts can sign in with a password and an optional code from an authenticator app (such as
          1Password, Google Authenticator or Authy).
        </p>
        <TwoFactorEnrollment onEnabled={() => router.push("/admin/dashboard")} />
        <div className="mt-6 text-center">
          <Link
            href="/admin/dashboard"
            className="text-xs font-medium text-ink-muted transition-colors hover:text-ink-primary"
          >
            Skip for now →
          </Link>
        </div>
      </div>
    </main>
  );
}
