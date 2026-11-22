import type { Kysely } from "kysely";
import { database } from "@/lib/database";
import type { DB } from "./db-types";
import { isMediaId } from "@/lib/library-types";

/*
 * What a video source or a subtitle file belongs to: a movie or an
 * episode. Shared by the admin panel's server functions
 * (src/lib/admin-video-actions.ts, src/lib/admin-subtitle-actions.ts),
 * which check the arguments they're sent with these. Server code only.
 */

export type Owner = { mediaId: string } | { episodeId: string };

export const GONE = "This movie or episode is in the trash or was deleted.";

/** The owner named by a page's bound arguments: "movie" or "episode", and its id. */
export function ownerOf(kindArg: unknown, idArg: unknown): Owner {
  if (!isMediaId(idArg)) throw new Error("Invalid id");
  if (kindArg === "movie") return { mediaId: idArg };
  if (kindArg === "episode") return { episodeId: idArg };
  throw new Error("Invalid owner");
}

/** Whether a movie, or an episode's series, exists and isn't in the trash. */
export async function canChange(owner: Owner, executor: Kysely<DB> = database): Promise<boolean> {
  if ("mediaId" in owner) {
    const movie = await executor
      .selectFrom("media")
      .select(["type", "trashedAt"])
      .where("id", "=", owner.mediaId)
      .executeTakeFirst();
    return movie?.type === "movie" && !movie.trashedAt;
  }
  const episode = await executor
    .selectFrom("episode")
    .innerJoin("media", "media.id", "episode.mediaId")
    .select("media.trashedAt")
    .where("episode.id", "=", owner.episodeId)
    .executeTakeFirst();
  return episode !== undefined && !episode.trashedAt;
}
