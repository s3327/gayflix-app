import AddTitlePage from "@/components/admin/AddTitlePage";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { requireAdmin } from "@/lib/session";

export default async function UploadSeriesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const query = await searchParams;
  return <AddTitlePage type="series" tmdbId={firstParam(query.tmdb)} />;
}
