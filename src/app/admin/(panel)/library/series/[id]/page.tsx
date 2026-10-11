import TitleEditPage from "@/components/admin/TitleEditPage";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { requireAdmin } from "@/lib/session";

export default async function EditSeriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <TitleEditPage type="series" id={id} added={firstParam(query.added) === "1"} />;
}
