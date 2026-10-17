import type { Metadata } from "next";
import LegalPage, { LegalLink, LegalSection } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";
import { SITE_NAME } from "@/lib/page-metadata";

export const metadata: Metadata = { title: `About · ${SITE_NAME}` };

/** Who runs Gayflix and what it's for. The operator comes from src/lib/legal.ts. */
export default function AboutPage() {
  return (
    <LegalPage title="About Gayflix" path="/about">
      <p className="text-base text-ink-primary">
        Gayflix is a free home for LGBTQ+ films and series: stories, films and series for our
        community, picked by us, for us.
      </p>

      <LegalSection title="What you'll find">
        <p>
          A growing catalog of movies and series by and about queer people, from around the world
          and in many languages. Browse by genre, country, year or language, keep favorites and
          lists, and pick up where you left off on any device.
        </p>
      </LegalSection>

      <LegalSection title="Free, with no ads">
        <p>
          Watching is free and needs no account. An account is free too, and only keeps your
          favorites, lists and history. We don&apos;t sell data or show ads; our{" "}
          <LegalLink href="/privacy">Privacy Policy</LegalLink> lists everything we keep.
        </p>
      </LegalSection>

      <LegalSection title="Who runs it">
        <p>
          Gayflix is run by {LEGAL.operator}. Something not working, a title you&apos;d like to see,
          or a question? <LegalLink href="/contact">Get in touch</LegalLink>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
