import CatalogFilterPage from "@/components/CatalogFilterPage";
import { publishedMediaItems } from "@/lib/mock-media";

export default function GenrePage({
  searchParams,
}: {
  searchParams: { [key: string]: string | undefined };
}) {
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
