import { getSubtitleFile } from "@/lib/catalog";

/**
 * A movie's or an episode's subtitles, as WebVTT, for the player's
 * <track>s (src/components/SourcePlayer.tsx). Served from this site so
 * they load whatever host the video plays from: a <track> from another
 * site would need that site to allow it. Only a published title's.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const content = await getSubtitleFile(id);
  if (content === null) return new Response("Not found", { status: 404 });
  return new Response(content, {
    headers: {
      "Content-Type": "text/vtt; charset=utf-8",
      // A new upload gets a new id, so a file never changes; an hour
      // lets one that's deleted or unpublished go soon after.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
