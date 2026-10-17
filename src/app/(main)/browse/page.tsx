import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import BrowseFilters from "@/components/BrowseFilters";
import MediaCard from "@/components/MediaCard";
import MediaGrid from "@/components/MediaGrid";
import Pagination from "@/components/Pagination";
import {
  browseHref,
  browseLabel,
  hasFilters,
  parseBrowse,
  yearRange,
} from "@/lib/browse";
import { listFilterValues, listTitles } from "@/lib/catalog";
import { listingMetadata } from "@/lib/page-metadata";
import { pageParam, type SearchParams } from "@/lib/search-params";

/*
 * Every published title, narrowed by any mix of type, genre, year or
 * decade, country and language, and sorted. Everything is in the address
 * (src/lib/browse.ts); the old /genre, /country, /year and /language
 * pages redirect here with their query (next.config.mjs).
 */

/**
 * The page's data, read once for both the tab title and the page (keyed
 * by the query as text, since each gets its own copy of the params).
 */
const loadQuery = cache(async (paramsJson: string) => {
  const params = JSON.parse(paramsJson) as SearchParams;
  const [genres, years, countries, languages] = await Promise.all([
    listFilterValues("genre"),
    listFilterValues("year"),
    listFilterValues("country"),
    listFilterValues("language"),
  ]);
  const options = { genres, years: years.map(Number), countries, languages };
  const { query, ignored } = parseBrowse(params, options);
  const requestedPage = pageParam(params.page);
  const result = await listTitles({
    type: query.type || undefined,
    genre: query.genre || undefined,
    year: yearRange(query.year) ?? undefined,
    country: query.country || undefined,
    language: query.language || undefined,
    sort: query.sort,
    page: requestedPage,
  });
  return { options, query, ignored, requestedPage, ...result };
});

async function load(searchParams: Promise<SearchParams>) {
  return loadQuery(JSON.stringify(await searchParams));
}

function countText(total: number) {
  return `${total} ${total === 1 ? "title" : "titles"}`;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const { query, page, total } = await load(searchParams);
  const label = browseLabel(query);
  const name = label ? `${label} · ${countText(total)}` : "Browse";
  const description = label
    ? `${label}: ${countText(total)} on Gayflix.`
    : "Browse every LGBTQ+ film and series on Gayflix by genre, year, country and language.";
  // The canonical address carries the filters and sort, in Browse's own order.
  return listingMetadata(name, browseHref(query), description, page);
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { options, query, ignored, requestedPage, items, page, totalPages, total } = await load(
    searchParams
  );
  // An address past the last page isn't a page.
  if (requestedPage !== page) notFound();
  const label = browseLabel(query);

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8 sm:py-14">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="font-display text-3xl font-bold">{label || "Browse"}</h1>
        <p className="text-sm text-ink-muted">{countText(total)}</p>
      </div>

      <div className="mt-6">
        <BrowseFilters options={options} query={query} />
      </div>

      {(ignored.length > 0 || hasFilters(query)) && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {ignored.map(({ facet, value }) => (
            <p key={facet} className="text-ink-secondary">
              There&apos;s no {facet} called &ldquo;{value}&rdquo;, so it&apos;s left
              out.
            </p>
          ))}
          {hasFilters(query) && (
            <Link
              href={browseHref({ sort: query.sort })}
              className="font-semibold text-ink-brand hover:underline"
            >
              Clear filters
            </Link>
          )}
        </div>
      )}

      {items.length > 0 ? (
        <div className="mt-8">
          <MediaGrid>
            {items.map((item) => (
              <MediaCard key={item.id} item={item} />
            ))}
          </MediaGrid>
        </div>
      ) : (
        <p className="mt-8 text-sm text-ink-muted">
          {hasFilters(query) ? "No titles match these filters." : "No titles yet."}
        </p>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        makeHref={(p) => browseHref(query, p)}
      />
    </main>
  );
}
