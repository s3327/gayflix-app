import type { Metadata } from "next";
import CatalogFilterPage from "@/components/CatalogFilterPage";
import { type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Year" };

export default async function YearPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await searchParamsPromise;
  return (
    <CatalogFilterPage
      title="Year"
      field="year"
      basePath="/year"
      emptyMessage="No titles found for this year yet."
      searchParams={searchParams}
    />
  );
}
