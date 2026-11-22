import { NextResponse } from "next/server";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { jsonObjectFrom } from "kysely/helpers/postgres";
import { database } from "@/lib/database";
import { requireAdmin } from "@/lib/session";
import { canManageUsers } from "@/lib/admin-roles";
import { searchUsers } from "@/lib/user-admin-store";
import { normalizeQuery, escapeLike } from "@/lib/catalog";

export async function GET(request: Request) {
  try {
    const session = await requireAdmin();
    const { searchParams } = new URL(request.url);
    const q = normalizeQuery(searchParams.get("q") ?? "");

    if (!q || q.length < 2) {
      return NextResponse.json({ titles: [], episodes: [], users: [] });
    }

    const allowUsers = canManageUsers(session.user.role);

    const [titles, episodes, users] = await Promise.all([
      database
        .selectFrom("media")
        .select(["id", "title", "type", "year", "status"])
        .where("title", "ilike", `%${escapeLike(q)}%`)
        .where("trashedAt", "is", null)
        .limit(6)
        .execute(),
      database
        .selectFrom("episode")
        .innerJoin("media", "media.id", "episode.mediaId")
        .select([
          "episode.id",
          "episode.title",
          "episode.seasonNumber",
          "episode.episodeNumber",
          (eb) =>
            jsonObjectFrom(
              eb.selectFrom("media as m").select("m.title").whereRef("m.id", "=", "episode.mediaId")
            ).as("media"),
        ])
        .where("episode.title", "ilike", `%${escapeLike(q)}%`)
        .where("media.trashedAt", "is", null)
        .limit(4)
        .execute(),
      allowUsers
        ? searchUsers({ search: q, filter: "all", limit: 4 }).then(({ items }) =>
            items.map(({ id, name, email, role }) => ({ id, name: name ?? email, email, role }))
          )
        : Promise.resolve([]),
    ]);

    return NextResponse.json({ titles, episodes, users });
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
