import type { Metadata } from "next";
import LibraryPage from "@/components/admin/LibraryPage";
import type { SearchParams } from "@/lib/search-params";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = {
  title: "Series",
};

export default async function LibrarySeriesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  return <LibraryPage type="series" searchParams={await searchParams} />;
}
