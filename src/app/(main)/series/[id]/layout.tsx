import { notFound, redirect } from "next/navigation";
import { findTitleType } from "@/lib/catalog";

/**
 * Checks the id before the loading screen (loading.tsx) streams, so an
 * unknown title is a real 404 and a movie id a real redirect.
 */
export default async function SeriesLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const type = await findTitleType(id);
  if (!type) notFound();
  // A movie id under /series (an old or hand-typed link) goes to its page.
  if (type !== "series") redirect(`/movie/${id}`);
  return children;
}
