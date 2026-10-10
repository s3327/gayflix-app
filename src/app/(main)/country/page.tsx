import CatalogFilterPage from "@/components/CatalogFilterPage";
import { publishedMediaItems } from "@/lib/mock-media";
import { type SearchParams } from "@/lib/search-params";

export default async function CountryPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await searchParamsPromise;
  return (
    <CatalogFilterPage
      title="Country"
      paramName="country"
      basePath="/country"
      items={publishedMediaItems}
      getFieldValue={(item) => item.country ?? "Unknown"}
      emptyMessage="No titles found for this country yet."
      searchParams={searchParams}
    />
  );
}
