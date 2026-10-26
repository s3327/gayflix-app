import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Layers } from "lucide-react";
import MediaCoverThumb from "@/components/MediaCoverThumb";
import Pagination from "@/components/Pagination";
import { listCommunityLists } from "@/lib/community";
import { listingMetadata } from "@/lib/page-metadata";
import { pageParam, type SearchParams } from "@/lib/search-params";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  return listingMetadata(
    "Community Lists",
    "/lists",
    "Lists of LGBTQ+ films and series picked by Gayflix members.",
    pageParam((await searchParams).page)
  );
}

/**
 * /lists, Community Lists (A9): the lists members chose to show here,
 * most recently changed first, each under its owner's nickname. Only
 * published titles count and show.
 */
export default async function CommunityListsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const requestedPage = pageParam((await searchParams).page);
  const { lists, page, totalPages } = await listCommunityLists(requestedPage);
  if (page !== requestedPage) notFound();

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8 sm:py-14">
      <h1 className="font-display text-3xl font-bold">Community Lists</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink-secondary">
        Picked by members. Share one of your lists and turn on &ldquo;Show in Community
        Lists&rdquo; to add it here.
      </p>

      {lists.length > 0 ? (
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((list) => (
            <li key={list.id}>
              <Link
                href={`/list/${list.id}`}
                className="group block rounded-card border border-border-subtle bg-bg-surface p-4 transition-colors hover:border-brand-pink"
              >
                <div className="grid grid-cols-4 gap-2" aria-hidden>
                  {list.covers.map((cover) => (
                    <MediaCoverThumb key={cover.id} entry={cover} sizes="100px" />
                  ))}
                </div>
                <p className="mt-3 truncate font-display text-base font-semibold text-ink-primary">
                  {list.name}
                </p>
                <p className="mt-0.5 truncate text-xs text-ink-secondary">
                  by {list.nickname} · {list.count} {list.count === 1 ? "title" : "titles"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-10 flex flex-col items-center gap-3 py-10 text-center">
          <Layers className="h-8 w-8 text-ink-muted" strokeWidth={1.5} aria-hidden />
          <p className="text-sm text-ink-secondary">No Community Lists yet. Yours could be the first.</p>
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        makeHref={(p) => (p === 1 ? "/lists" : `/lists?page=${p}`)}
      />
    </main>
  );
}
