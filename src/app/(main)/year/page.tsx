import CatalogFilterPage from "@/components/CatalogFilterPage";
import { publishedMediaItems } from "@/lib/mock-media";

export default function YearPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | undefined };
}) {
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
