import type { Metadata } from "next";
import TitleEditPage from "@/components/admin/TitleEditPage";
import { getTitleForEdit } from "@/lib/catalog";
import { firstParam, type SearchParams } from "@/lib/search-params";
import { requireAdmin } from "@/lib/session";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const title = await getTitleForEdit(id);
  return { title: title?.title ?? "Movie" };
}

export default async function EditMoviePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return (
    <TitleEditPage
      type="movie"
      id={id}
      added={firstParam(query.added) === "1"}
      imported={firstParam(query.imported) === "1"}
    />
  );
}
