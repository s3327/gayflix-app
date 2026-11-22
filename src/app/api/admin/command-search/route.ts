import { NextResponse } from "next/server";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { db } from "@/lib/db";
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

    const like = { contains: escapeLike(q), mode: "insensitive" as const };
    const allowUsers = canManageUsers(session.user.role);

    const [titles, episodes, users] = await Promise.all([
      db.media.findMany({
        where: { title: like, trashedAt: null },
        take: 6,
        select: { id: true, title: true, type: true, year: true, status: true },
      }),
      db.episode.findMany({
        where: {
          title: like,
          media: { trashedAt: null },
        },
        take: 4,
        select: {
          id: true,
          title: true,
          seasonNumber: true,
          episodeNumber: true,
          media: { select: { title: true } },
        },
      }),
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

