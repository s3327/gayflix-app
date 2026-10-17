import { notFound, redirect } from "next/navigation";
import { findTitleType, getTitle } from "@/lib/catalog";

/**
 * Checks the id before the loading screen (loading.tsx) streams, so an
 * unknown title is a real 404 and a series a real redirect.
 */
export default async function WatchLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const type = await findTitleType(id);
  if (!type) notFound();
  // A series has no single video: play its first episode instead.
  if (type === "series") {
    const first = (await getTitle(id))?.episodes[0];
    redirect(first ? `/episode/${first.id}` : `/series/${id}`);
  }
  return children;
}
