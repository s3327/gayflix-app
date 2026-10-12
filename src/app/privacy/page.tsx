import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { SITE_NAME } from "@/lib/page-metadata";

export const metadata: Metadata = { title: `Privacy Policy · ${SITE_NAME}` };

/**
 * Placeholder legal copy — same status as /terms: realistic structure,
 * filler content, linked from the sign-up checkbox and (once wired)
 * Footer's Legal column.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-8">
      <Link href="/" className="inline-flex items-center gap-2">
        <Image
          src="/brand/gayflix-icon.png"
          alt="Gayflix"
          width={500}
          height={500}
          className="h-8 w-8"
        />
      </Link>

      <h1 className="mt-8 font-display text-3xl font-bold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-ink-muted">Last updated: January 2026</p>

      <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed text-ink-secondary">
        <p>
          This Privacy Policy explains what information Gayflix collects,
          how we use it, and the choices you have. We know privacy matters
          especially for our community, and we take that seriously.
        </p>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink-primary">
            1. Information We Collect
          </h2>
          <p className="mt-2">
            When you create an account, we collect your name, email
            address, and password (stored securely, never in plain text).
            If you sign up with Google, we receive your name and email
            from your Google account instead. We also collect basic usage
            data, like what you watch and how you interact with the app,
            to improve recommendations.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink-primary">
            2. How We Use Your Information
          </h2>
          <p className="mt-2">
            We use your information to run your account, process
            subscription billing, personalize recommendations, and
            communicate important updates. We do not sell your personal
            data to third parties.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink-primary">
            3. Sharing With Third Parties
          </h2>
          <p className="mt-2">
            We share limited data with service providers who help us run
            Gayflix (like payment processors and cloud hosting), and only
            to the extent needed for them to do their job.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink-primary">
            4. Your Choices
          </h2>
          <p className="mt-2">
            You can review, update, or delete your account information at
            any time from your account settings, or by contacting us
            directly.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink-primary">
            5. Data Security
          </h2>
          <p className="mt-2">
            We use industry-standard safeguards to protect your data, but
            no method of transmission or storage is 100% secure.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink-primary">
            6. Changes to This Policy
          </h2>
          <p className="mt-2">
            We may update this policy occasionally. We&apos;ll let you know
            of any significant changes.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink-primary">
            7. Contact
          </h2>
          <p className="mt-2">
            Questions about this policy? Reach out through the Contact page
            linked in our footer.
          </p>
        </section>
      </div>

      <p className="mt-10 text-sm text-ink-secondary">
        See also our{" "}
        <Link
          href="/terms"
          className="font-medium text-ink-brand transition-colors hover:text-brand-pink-light"
        >
          Terms of Service
        </Link>
        .
      </p>
    </main>
  );
}
