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

export default async function MoviePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const title = await getTitle(id);
  if (!title) notFound();
  // A series id under /movie (an old or hand-typed link) goes to its page.
  if (title.type !== "movie") redirect(titleHref(title));

  // Placeholder recommendations: the newest other titles. Related-title
  // matching (genre, director, cast) comes later.
  const recommended = await listRecommendations(title.id);
  return <TitleDetail title={title} recommended={recommended} />;
}
