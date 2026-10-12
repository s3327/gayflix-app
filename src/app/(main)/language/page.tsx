import type { Metadata } from "next";
import CatalogFilterPage from "@/components/CatalogFilterPage";
import { type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Language" };

export default async function LanguagePage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const searchParams = await searchParamsPromise;
  return (
    <CatalogFilterPage
      title="Language"
      field="language"
      basePath="/language"
      emptyMessage="No titles found for this language yet."
      searchParams={searchParams}
    />
  );
}
