import LibraryPage from "@/components/admin/LibraryPage";
import type { SearchParams } from "@/lib/search-params";
import { requireAdmin } from "@/lib/session";

export default async function LibraryMoviesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  return <LibraryPage type="movie" searchParams={await searchParams} />;
}
