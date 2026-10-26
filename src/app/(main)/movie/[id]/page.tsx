import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import TitleDetail from "@/components/TitleDetail";
import { getTitle, listRecommendations } from "@/lib/catalog";
import { listTitleReviews } from "@/lib/community";
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

  // The other titles most like this one.
  const [recommended, reviews] = await Promise.all([
    listRecommendations(title.id),
    listTitleReviews(title.id),
  ]);
  return <TitleDetail title={title} recommended={recommended} reviews={reviews} />;
}
