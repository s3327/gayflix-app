import { notFound, redirect } from "next/navigation";
import { findTitleType } from "@/lib/catalog";

/**
 * Checks the id before the loading screen (loading.tsx) streams, so an
 * unknown title is a real 404 and a series id a real redirect.
 */
export default async function MovieLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const type = await findTitleType(id);
  if (!type) notFound();
  // A series id under /movie (an old or hand-typed link) goes to its page.
  if (type !== "movie") redirect(`/series/${id}`);
  return children;
}
