import type { Metadata } from "next";
import LegalPage, { ContactEmail, LegalSection } from "@/components/LegalPage";
import { SITE_NAME } from "@/lib/page-metadata";

export const metadata: Metadata = { title: `Copyright · ${SITE_NAME}` };

/**
 * How a rights holder has a title taken down, and how the publisher can
 * answer. The address comes from src/lib/legal.ts.
 */
export default function CopyrightPage() {
  return (
    <LegalPage title="Copyright and takedowns" path="/copyright" updated>
      <p>
        We respect the work of the people who make these films and series. If you own the rights
        to a work on Gayflix and didn&apos;t allow it to be there, tell us and we&apos;ll take it
        down.
      </p>

      <LegalSection title="Send a takedown notice">
        <p>
          Email <ContactEmail /> with the subject &quot;Copyright notice&quot; and include:
        </p>
        <ol className="list-decimal pl-5">
          <li>the work you own, and the Gayflix page or pages it appears on (their links);</li>
          <li>your name, postal address, phone number and email;</li>
          <li>
            a statement that you believe in good faith the use isn&apos;t allowed by you, your agent
            or the law;
          </li>
          <li>
            a statement that your notice is accurate and that you own the rights or may act for the
            owner;
          </li>
          <li>your signature (typing your full name is enough).</li>
        </ol>
      </LegalSection>

      <LegalSection title="What happens next">
        <p>
          We reply to confirm we have your notice, and take the title, or the episode, off Gayflix
          as soon as we&apos;ve checked it, usually within two working days. Repeated infringement
          by a member ends their account.
        </p>
      </LegalSection>

      <LegalSection title="If your title was taken down by mistake">
        <p>
          Write to the same address with the link that was removed, why you believe the notice was
          a mistake, and your contact details. We pass your reply to the person who sent the
          notice, and may put the title back if they don&apos;t take further action.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
