import Link from "next/link";
import Image from "next/image";

/**
 * Placeholder legal copy — linked from the sign-up checkbox and (once
 * wired) Footer's Legal column. Structure/headings are realistic so the
 * page reads as a real ToS, but the actual clauses are filler text, not
 * reviewed legal language — swap before this ever goes live.
 */
export default function TermsPage() {
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

      <h1 className="mt-8 font-display text-3xl font-bold">
        Terms of Service
      </h1>
      <p className="mt-2 text-sm text-ink-muted">Last updated: January 2026</p>

      <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed text-ink-secondary">
        <p>
          Welcome to Gayflix. By creating an account or using our streaming
          service, you agree to these Terms of Service. Please read them
          carefully before signing up.
        </p>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink-primary">
            1. Your Account
          </h2>
          <p className="mt-2">
            You&apos;re responsible for keeping your login credentials
            secure and for all activity that happens under your account.
            You must be at least 18 years old, or the age of majority in
            your region, to create an account.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink-primary">
            2. Subscription &amp; Billing
          </h2>
          <p className="mt-2">
            Access to Gayflix content requires an active subscription.
            Subscriptions renew automatically until cancelled, and pricing
            is shown before you confirm any purchase.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink-primary">
            3. Content &amp; Usage
          </h2>
          <p className="mt-2">
            Titles on Gayflix are licensed for personal, non-commercial
            streaming only. Downloading, redistributing, or publicly
            broadcasting our content without permission is prohibited.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink-primary">
            4. Community Guidelines
          </h2>
          <p className="mt-2">
            Gayflix is built for and by the LGBTQ+ community. Harassment,
            hate speech, and impersonation are not tolerated and may result
            in account suspension.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink-primary">
            5. Changes to These Terms
          </h2>
          <p className="mt-2">
            We may update these terms from time to time. Continued use of
            Gayflix after changes take effect means you accept the revised
            terms.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-ink-primary">
            6. Contact
          </h2>
          <p className="mt-2">
            Questions about these terms? Reach out through the Contact page
            linked in our footer.
          </p>
        </section>
      </div>

      <p className="mt-10 text-sm text-ink-secondary">
        See also our{" "}
        <Link
          href="/privacy"
          className="font-medium text-ink-brand transition-colors hover:text-brand-pink-light"
        >
          Privacy Policy
        </Link>
        .
      </p>
    </main>
  );
}
