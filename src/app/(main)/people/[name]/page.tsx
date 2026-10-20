import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import MediaCard from "@/components/MediaCard";
import MediaGrid from "@/components/MediaGrid";
import { personHref, personName } from "@/lib/browse-href";
import { getPerson } from "@/lib/catalog";
import type { Media } from "@/lib/media";
import { listingMetadata } from "@/lib/page-metadata";

/** Metadata and the page ask once. */
const load = cache(async (segment: string) => {
  const name = personName(segment);
  return name ? getPerson(name) : null;
});

function count(n: number) {
  return `${n} ${n === 1 ? "title" : "titles"}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ name: string }>;
}): Promise<Metadata> {
  const person = await load((await params).name);
  if (!person) return {};
  const total = new Set([...person.directed, ...person.created, ...person.appearsIn].map((m) => m.id)).size;
  return listingMetadata(
    person.name,
    personHref(person.name),
    `${person.name} on Gayflix: ${count(total)} to watch, LGBTQ+ films and series.`
  );
}

/**
 * A person's page, linked from the director, creator and cast on title,
 * watch and episode pages: what they directed, created and are in, newest
 * first. A name the catalog doesn't have, on any published title, is a
 * 404.
 */
export default async function PersonPage({ params }: { params: Promise<{ name: string }> }) {
  const person = await load((await params).name);
  if (!person) notFound();

  const sections: [string, Media[]][] = [
    ["Directed", person.directed],
    ["Created", person.created],
    ["Cast", person.appearsIn],
  ];
  const roles = sections.filter(([, media]) => media.length > 0);

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8 sm:py-14">
      <h1 className="font-display text-3xl font-bold">{person.name}</h1>
      <p className="mt-1 text-sm text-ink-secondary">
        {roles.map(([role, media]) => `${role === "Cast" ? "In the cast of" : role} ${count(media.length)}`).join(" · ")}
      </p>

      {roles.map(([role, media]) => (
        <section key={role} aria-labelledby={`role-${role}`} className="mt-10">
          <h2 id={`role-${role}`} className="font-display text-xl font-semibold">
            {role}
          </h2>
          <div className="mt-4">
            <MediaGrid>
              {media.map((item) => (
                <MediaCard key={item.id} item={item} />
              ))}
            </MediaGrid>
          </div>
        </section>
      ))}
    </main>
  );
}
