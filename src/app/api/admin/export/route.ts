import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { escapeLike, normalizeQuery } from "@/lib/catalog";

function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (val instanceof Date) return val.toISOString();
  if (Array.isArray(val)) return `"${val.join(", ").replace(/"/g, '""')}"`;
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvRow(cols: unknown[]): string {
  return cols.map(escapeCsv).join(",");
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") ?? "movies";
    const q = normalizeQuery(searchParams.get("q") ?? "");
    const status = searchParams.get("status");

    let csvContent = "";
    const filename = `gayflix-${type}-${new Date().toISOString().slice(0, 10)}.csv`;

    if (type === "movies" || type === "series") {
      const mediaType = type === "movies" ? "movie" : "series";
      const rows = await db.media.findMany({
        where: {
          type: mediaType,
          trashedAt: null,
          ...(status && (status === "draft" || status === "published") ? { status } : {}),
          ...(q ? { title: { contains: escapeLike(q), mode: "insensitive" } } : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          title: true,
          year: true,
          status: true,
          duration: true,
          genres: true,
          tags: true,
          rating: true,
          viewCount: true,
          director: true,
          creator: true,
          publishedAt: true,
          createdAt: true,
        },
      });

      const headers = [
        "id",
        "title",
        "type",
        "year",
        "status",
        "duration",
        "genres",
        "tags",
        "rating",
        "viewCount",
        mediaType === "movie" ? "director" : "creator",
        "publishedAt",
        "createdAt",
      ];

      const lines = [
        toCsvRow(headers),
        ...rows.map((r) =>
          toCsvRow([
            r.id,
            r.title,
            mediaType,
            r.year,
            r.status,
            r.duration,
            r.genres,
            r.tags,
            r.rating,
            r.viewCount,
            mediaType === "movie" ? r.director : r.creator,
            r.publishedAt,
            r.createdAt,
          ])
        ),
      ];
      csvContent = lines.join("\r\n");
    } else if (type === "episodes") {
      const seriesId = searchParams.get("seriesId");
      const rows = await db.episode.findMany({
        where: {
          media: { trashedAt: null },
          ...(seriesId ? { mediaId: seriesId } : {}),
          ...(q ? { title: { contains: escapeLike(q), mode: "insensitive" } } : {}),
        },
        orderBy: [{ media: { title: "asc" } }, { seasonNumber: "asc" }, { episodeNumber: "asc" }],
        include: { media: { select: { title: true } } },
      });

      const headers = [
        "Episode ID",
        "Series Title",
        "Season",
        "Episode",
        "Episode Title",
        "Duration",
        "Air Date",
      ];
      const lines = [
        toCsvRow(headers),
        ...rows.map((r) =>
          toCsvRow([
            r.id,
            r.media.title,
            r.seasonNumber,
            r.episodeNumber,
            r.title,
            r.duration,
            r.airDate,
          ])
        ),
      ];
      csvContent = lines.join("\r\n");
    } else if (type === "reports") {
      const showResolved = searchParams.get("status") === "resolved";
      const rows = await db.report.findMany({
        where: {
          resolvedAt: showResolved ? { not: null } : null,
        },
        orderBy: { createdAt: "desc" },
        include: { user: { select: { email: true } } },
      });

      const headers = [
        "Report ID",
        "Media ID",
        "Media Title",
        "Reason",
        "Details",
        "Sender Email",
        "Created At",
        "Resolved At",
        "Resolved By",
        "Notes",
      ];
      const lines = [
        toCsvRow(headers),
        ...rows.map((r) =>
          toCsvRow([
            r.id,
            r.mediaId,
            r.mediaTitle,
            r.reason,
            r.details,
            r.user?.email ?? (r.userId ? "Deleted account" : "Guest"),
            r.createdAt,
            r.resolvedAt,
            r.resolvedBy,
            r.notes,
          ])
        ),
      ];
      csvContent = lines.join("\r\n");
    } else if (type === "activity") {
      const logs = await db.activityLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 5000,
      });
      const headers = ["ID", "Timestamp", "Actor Email", "Actor Role", "Action", "Entity Type", "Entity ID", "Summary"];
      const lines = [
        toCsvRow(headers),
        ...logs.map((l) =>
          toCsvRow([
            l.id,
            l.createdAt,
            l.actorEmail,
            l.actorRole ?? "",
            l.action,
            l.entityType,
            l.entityId ?? "",
            l.summary,
          ])
        ),
      ];
      csvContent = lines.join("\r\n");
    } else if (type === "catalog-json") {
      const allMedia = await db.media.findMany({
        include: {
          episodes: true,
          videoSources: true,
        },
        orderBy: [{ type: "asc" }, { createdAt: "desc" }],
      });
      const jsonStr = JSON.stringify(
        {
          version: "1.0",
          exportedAt: new Date().toISOString(),
          mediaCount: allMedia.length,
          items: allMedia,
        },
        null,
        2
      );
      const jsonFilename = `gayflix-catalog-backup-${new Date().toISOString().slice(0, 10)}.json`;
      return new NextResponse(jsonStr, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${jsonFilename}"`,
        },
      });
    } else {
      return NextResponse.json({ error: "Unsupported export type" }, { status: 400 });
    }

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

