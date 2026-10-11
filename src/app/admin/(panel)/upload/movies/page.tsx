import AddTitlePage from "@/components/admin/AddTitlePage";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { requireAdmin } from "@/lib/session";

export default async function UploadMoviesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const query = await searchParams;
  return <AddTitlePage type="movie" tmdbId={firstParam(query.tmdb)} />;
}
