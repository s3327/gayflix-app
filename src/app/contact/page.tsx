import type { Metadata } from "next";
import LegalPage, { ContactEmail, LegalLink, LegalSection } from "@/components/LegalPage";
import { SITE_NAME } from "@/lib/page-metadata";

export const metadata: Metadata = { title: `Contact · ${SITE_NAME}` };

/** How to reach the people behind Gayflix. The address comes from src/lib/legal.ts. */
export default function ContactPage() {
  return (
    <LegalPage title="Contact" path="/contact">
      <p className="text-base text-ink-primary">
        Write to us at <ContactEmail />. We read everything and answer within a few days.
      </p>

      <LegalSection title="A title won't play">
        <p>
          Use Report an issue under the player. It tells us exactly which title and server, so we
          can fix it fastest.
        </p>
      </LegalSection>

      <LegalSection title="Your account or your data">
        <p>
          Write from the email on your account. Most changes you can make yourself in Account; the{" "}
          <LegalLink href="/privacy">Privacy Policy</LegalLink> says how to get a copy of your data
          or have it deleted.
        </p>
      </LegalSection>

      <LegalSection title="Copyright">
        <p>
          If you own a work on Gayflix and want it taken down, follow the steps on our{" "}
          <LegalLink href="/copyright">Copyright page</LegalLink>, so we have what we need to act
          quickly.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
