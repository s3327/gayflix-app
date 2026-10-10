import { notFound, redirect } from "next/navigation";
import TitleDetail from "@/components/TitleDetail";
import { getTitle, listRecommendations } from "@/lib/catalog";
import { titleHref } from "@/lib/title-href";

export default async function SeriesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const title = await getTitle(id);
  if (!title) notFound();
  // A movie id under /series (an old or hand-typed link) goes to its page.
  if (title.type !== "series") redirect(titleHref(title));

  // Same placeholder recommendations as /movie/[id].
  const recommended = await listRecommendations(title.id);
  return <TitleDetail title={title} recommended={recommended} />;
}
