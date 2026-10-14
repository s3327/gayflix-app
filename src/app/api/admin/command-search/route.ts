import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { normalizeQuery, escapeLike } from "@/lib/catalog";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const q = normalizeQuery(searchParams.get("q") ?? "");

    if (!q || q.length < 2) {
      return NextResponse.json({ titles: [], episodes: [], users: [] });
    }

    const like = { contains: escapeLike(q), mode: "insensitive" as const };

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
      db.user.findMany({
        where: {
          OR: [{ name: like }, { email: like }],
        },
        take: 4,
        select: { id: true, name: true, email: true, role: true },
      }),
    ]);

    return NextResponse.json({ titles, episodes, users });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

