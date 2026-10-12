import type { Metadata } from "next";
import CatalogFilterPage from "@/components/CatalogFilterPage";
import { type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Country" };

export default async function CountryPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await searchParamsPromise;
  return (
    <CatalogFilterPage
      title="Country"
      field="country"
      basePath="/country"
      emptyMessage="No titles found for this country yet."
      searchParams={searchParams}
    />
  );
}
