import { notFound, permanentRedirect } from "next/navigation";
import { episodeExists, resolveEpisodeRedirect } from "@/lib/catalog";

/**
 * Checks the id before the loading screen (loading.tsx) streams, so an
 * unknown episode is a real 404 and a renamed one a real redirect.
 */
export default async function EpisodeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await episodeExists(id))) {
    const renamed = await resolveEpisodeRedirect(id);
    if (renamed) permanentRedirect(`/episode/${renamed}`);
    notFound();
  }
  return children;
}
