import type { Metadata } from "next";
import LegalPage, { ContactEmail, LegalLink, LegalSection } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";
import { SITE_NAME } from "@/lib/page-metadata";

export const metadata: Metadata = { title: `Privacy Policy · ${SITE_NAME}` };

/**
 * What the site keeps, written from the code: accounts (src/lib/auth.ts),
 * favorites, lists and history (src/lib/library-actions.ts), views
 * (src/lib/view-actions.ts), reports (src/lib/report-actions.ts) and
 * crash reports (src/lib/error-reporting.ts). Change this page when any
 * of those change. Names and contact come from src/lib/legal.ts.
 */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" path="/privacy" updated>
      <p>
        Gayflix is run by {LEGAL.operator}. Being seen watching LGBTQ+ stories can be personal, so
        we keep as little about you as the site needs, never sell it, and show no ads. This page
        lists everything we keep and why.
      </p>

      <LegalSection title="Without an account">
        <p>
          You can browse and watch without signing up. Your watch history then stays in this
          browser only (its local storage), and moves into your account if you later log in.
        </p>
        <p>
          When you press Play, we count a view so Trending works. A view is stored as a one-way
          code made from your IP address and the day, which can&apos;t be turned back into the
          address, and views older than a week are deleted. Reports you send about a broken title
          are limited per day the same way.
        </p>
      </LegalSection>

      <LegalSection title="With an account">
        <ul className="list-disc pl-5">
          <li>
            <strong className="font-semibold text-ink-primary">Your name and email</strong>, to sign
            you in and to send codes and account notices.
          </li>
          <li>
            <strong className="font-semibold text-ink-primary">Your password</strong>, stored only
            as a scrambled hash we can&apos;t read. If you sign in with Google, we get your name and
            email from Google, and no password.
          </li>
          <li>
            <strong className="font-semibold text-ink-primary">Sign-in sessions</strong>: one per
            device, kept for up to 30 days. We don&apos;t store your IP address or browser details
            with them.
          </li>
          <li>
            <strong className="font-semibold text-ink-primary">Favorites, lists and history</strong>{" "}
            (your last 200 titles), so they follow you to every device.
          </li>
          <li>
            <strong className="font-semibold text-ink-primary">Two-step sign-in</strong>, if you turn
            it on: its secret and backup codes.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Who can see it">
        <p>
          Only you, except a list you choose to share: anyone with its link sees its name and
          titles, never your name or email. Lists are private until you share them.
        </p>
        <p>
          The people who run Gayflix can see accounts to keep the site safe, for example to stop
          spam or answer a report. They can&apos;t see your password.
        </p>
      </LegalSection>

      <LegalSection id="cookies" title="Cookies and storage">
        <p>
          When you log in we set one cookie that keeps you signed in. It can only be read by our
          server, and it ends when you log out. Your browser&apos;s local storage holds a
          guest&apos;s watch history and small preferences. We use no advertising or tracking
          cookies.
        </p>
        <p>
          A title&apos;s video plays from its host, inside our player. That host may set its own
          cookies under its own privacy policy.
        </p>
      </LegalSection>

      <LegalSection title="Services we use">
        <ul className="list-disc pl-5">
          <li>Hosting and a database, where the site and your account data live.</li>
          <li>An email service, which sends our codes and notices.</li>
          <li>Google, only if you choose to sign in with it.</li>
          <li>
            A crash reporting service, which gets a description of an error. It never gets IP
            addresses, cookies, form fields or what you searched for.
          </li>
        </ul>
        <p>They handle data only to provide their service to us.</p>
      </LegalSection>

      <LegalSection title="Your choices">
        <p>
          You can change your name, email and password in Account, sign other devices out and
          delete your account in Account, then Setting. Deleting your account erases it with your
          favorites, lists and history straight away.
        </p>
        <p>
          You can also ask us for a copy of what we hold about you, or to correct or delete it, at{" "}
          <ContactEmail />. We answer within 30 days.
        </p>
      </LegalSection>

      <LegalSection title="Children">
        <p>Gayflix is for adults. We don&apos;t knowingly keep accounts for anyone under 18.</p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          When this policy changes, the date at the top changes too, and members get an email about
          anything that matters. See also our <LegalLink href="/terms">Terms of Service</LegalLink>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
