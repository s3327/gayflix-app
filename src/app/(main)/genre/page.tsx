import type { Metadata } from "next";
import CatalogFilterPage from "@/components/CatalogFilterPage";
import { type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Genre" };

export default async function GenrePage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await searchParamsPromise;
  return (
    <CatalogFilterPage
      title="Genre"
      field="genre"
      basePath="/genre"
      emptyMessage="No titles found for this genre yet."
      searchParams={searchParams}
    />
  );
}
