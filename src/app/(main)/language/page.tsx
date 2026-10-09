import CatalogFilterPage from "@/components/CatalogFilterPage";
import { publishedMediaItems } from "@/lib/mock-media";

export default function LanguagePage({
  searchParams,
}: {
  searchParams: { [key: string]: string | undefined };
}) {
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
