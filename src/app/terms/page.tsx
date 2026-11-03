import type { Metadata } from "next";
import LegalPage, { ContactEmail, LegalLink, LegalSection } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";


export const metadata: Metadata = {
  title: "Terms of Service",
  alternates: { canonical: "/terms" },
};

/**
 * The Terms the sign-up checkbox agrees to. Written for the site as it
 * works: free, with optional accounts, and video played from other
 * hosts. Names, country and contact come from src/lib/legal.ts.
 */
export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" path="/terms" updated>
      <p>
        These terms are an agreement between you and {LEGAL.operator} (&quot;we&quot;), who run
        Gayflix. By using Gayflix or creating an account, you agree to them. If you don&apos;t
        agree, please don&apos;t use the site.
      </p>

      <LegalSection title="1. What Gayflix is">
        <p>
          Gayflix is a free catalog of LGBTQ+ films and series. You can browse and watch without an
          account. An account lets you keep favorites, lists and your watch history on every
          device. There are no subscriptions or payments.
        </p>
        <p>
          Videos play from the hosts the titles are published on, inside our player. Those hosts
          run their own services under their own terms, and we don&apos;t control what they show or
          how long a video stays available.
        </p>
      </LegalSection>

      <LegalSection title="2. Your account">
        <p>
          You must be at least 18, or the age of majority where you live if that&apos;s higher, to
          create an account. Give a real email address you can read, and keep your password to
          yourself: you&apos;re responsible for what happens under your account.
        </p>
        <p>
          You can delete your account at any time from Account, then Setting. Your favorites,
          lists and history are deleted with it.
        </p>
      </LegalSection>

      <LegalSection title="3. Using Gayflix">
        <p>Please don&apos;t:</p>
        <ul className="list-disc pl-5">
          <li>download, copy or rebroadcast videos, except where the host allows it;</li>
          <li>use Gayflix to harass, threaten or out anyone, or post hateful list names;</li>
          <li>send false reports, or try to overload, break into or scrape the site;</li>
          <li>sign in as someone else or share an account you don&apos;t own.</li>
        </ul>
        <p>
          We may suspend or close an account that breaks these rules, and we&apos;ll tell you why
          by email when we can.
        </p>
      </LegalSection>

      <LegalSection title="4. Shared lists">
        <p>
          Lists are private until you share one. A shared list&apos;s name and titles can be seen by
          anyone with its link, so choose names you&apos;re happy for others to read. You can stop
          sharing at any time, and the link then stops working.
        </p>
      </LegalSection>

      <LegalSection title="5. Copyright">
        <p>
          Titles, posters and descriptions belong to their owners. If you own a work that appears
          on Gayflix without your permission, our <LegalLink href="/copyright">Copyright page</LegalLink>{" "}
          says how to have it taken down.
        </p>
      </LegalSection>

      <LegalSection title="6. No guarantees">
        <p>
          Gayflix is offered as it is, for free. We work to keep it running and accurate, but we
          can&apos;t promise that every title will play, stay available or be described correctly.
          As far as the law allows, we aren&apos;t liable for losses that come from using the site
          or from not being able to use it. Nothing in these terms limits rights the law gives you
          that can&apos;t be signed away.
        </p>
      </LegalSection>

      <LegalSection title="7. Changes">
        <p>
          We may change these terms as Gayflix changes. The date at the top shows the latest
          version. When a change matters to members, we&apos;ll email them before it takes effect.
          Using Gayflix after that means you accept the new terms.
        </p>
      </LegalSection>

      <LegalSection title="8. Law">
        <p>
          These terms follow the law of {LEGAL.country}, and disputes are settled by its courts,
          unless the law where you live gives you the right to bring them there.
        </p>
      </LegalSection>

      <LegalSection title="9. Contact">
        <p>
          Questions about these terms: <ContactEmail />. Our{" "}
          <LegalLink href="/privacy">Privacy Policy</LegalLink> explains what we keep about you.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
