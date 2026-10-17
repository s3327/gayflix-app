import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import TitleDetail from "@/components/TitleDetail";
import { getTitle, listRecommendations } from "@/lib/catalog";
import { titleMetadata } from "@/lib/page-metadata";
import { titleHref } from "@/lib/title-href";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const title = await getTitle((await params).id);
  return title ? titleMetadata(title) : {};
}

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

  // The other titles most like this one.
  const recommended = await listRecommendations(title.id);
  return <TitleDetail title={title} recommended={recommended} />;
}
