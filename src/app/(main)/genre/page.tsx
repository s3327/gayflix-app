import CatalogFilterPage from "@/components/CatalogFilterPage";
import { publishedMediaItems } from "@/lib/mock-media";
import { type SearchParams } from "@/lib/search-params";

export default async function GenrePage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await searchParamsPromise;
  return (
    <CatalogFilterPage
      title="Genre"
      paramName="genre"
      basePath="/genre"
      items={publishedMediaItems}
      getFieldValue={(item) => item.genre}
      emptyMessage="No titles found for this genre yet."
      searchParams={searchParams}
    />
  );
}
