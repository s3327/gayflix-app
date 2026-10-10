import CatalogFilterPage from "@/components/CatalogFilterPage";
import { publishedMediaItems } from "@/lib/mock-media";
import { type SearchParams } from "@/lib/search-params";

export default async function YearPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await searchParamsPromise;
  return (
    <CatalogFilterPage
      title="Year"
      paramName="year"
      basePath="/year"
      items={publishedMediaItems}
      getFieldValue={(item) => String(item.year)}
      chipSort="numeric-desc"
      emptyMessage="No titles found for this year yet."
      searchParams={searchParams}
    />
  );
}
