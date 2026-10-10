import CatalogFilterPage from "@/components/CatalogFilterPage";
import { publishedMediaItems } from "@/lib/mock-media";
import { type SearchParams } from "@/lib/search-params";

export default async function LanguagePage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await searchParamsPromise;
  return (
    <CatalogFilterPage
      title="Language"
      paramName="language"
      basePath="/language"
      items={publishedMediaItems}
      getFieldValue={(item) => item.language ?? "Unknown"}
      emptyMessage="No titles found for this language yet."
      searchParams={searchParams}
    />
  );
}
