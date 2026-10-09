import CatalogFilterPage from "@/components/CatalogFilterPage";
import { publishedMediaItems } from "@/lib/mock-media";

export default function CountryPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | undefined };
}) {
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
