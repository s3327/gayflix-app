import { NextResponse } from "next/server";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { database } from "@/lib/database";
import { countOf } from "@/lib/sql-helpers";
import { getVerifiedSession } from "@/lib/session";
import { adminAccess } from "@/lib/admin-access";
import { canManageCatalog, canManageSettings, canManageUsers } from "@/lib/admin-roles";
import { escapeLike, normalizeQuery } from "@/lib/catalog";
import { toCsvRow } from "@/lib/csv";
import { accountEmails } from "@/lib/user-admin-store";

export async function GET(request: Request) {
  try {
    const session = await getVerifiedSession();
    if (!session || adminAccess(session) !== "ok") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") ?? "movies";
    const q = normalizeQuery(searchParams.get("q") ?? "");
    const status = searchParams.get("status");

    // Enforce role-based access control per export type
    if (type === "movies" || type === "series" || type === "episodes") {
      if (!canManageCatalog(session.user.role)) {
        return NextResponse.json(
          { error: "Forbidden: You do not have permission to export catalog data." },
          { status: 403 }
        );
      }
    } else if (type === "reports") {
      if (!canManageUsers(session.user.role)) {
        return NextResponse.json(
          { error: "Forbidden: You do not have permission to export reports." },
          { status: 403 }
        );
      }
    } else if (type === "activity") {
      if (!canManageSettings(session.user.role)) {
        return NextResponse.json(
          { error: "Forbidden: You do not have permission to export activity logs." },
          { status: 403 }
        );
      }
    } else if (type === "catalog-json") {
      if (!canManageSettings(session.user.role) && !canManageCatalog(session.user.role)) {
        return NextResponse.json(
          { error: "Forbidden: You do not have permission to export the catalog backup." },
          { status: 403 }
        );
      }
    }

    let csvContent = "";
    let isTruncated = false;
    const filename = `gayflix-${type}-${new Date().toISOString().slice(0, 10)}.csv`;

    if (type === "movies" || type === "series") {
      const mediaType = type === "movies" ? "movie" : "series";
      let query = database
        .selectFrom("media")
        .select([
          "id",
          "title",
          "year",
          "status",
          "duration",
          "genres",
          "tags",
          "rating",
          "viewCount",
          "director",
          "creator",
          "publishedAt",
          "createdAt",
        ])
        .where("type", "=", mediaType)
        .where("trashedAt", "is", null);

      if (status && (status === "draft" || status === "published")) {
        query = query.where("status", "=", status);
      }
      if (q) {
        query = query.where("title", "ilike", `%${escapeLike(q)}%`);
      }

      const rows = await query
        .orderBy("createdAt", "desc")
        .orderBy("id", "desc")
        .execute();

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
      let query = database
        .selectFrom("episode")
        .innerJoin("media", "media.id", "episode.mediaId")
        .select([
          "episode.id as id",
          "media.title as seriesTitle",
          "episode.seasonNumber as seasonNumber",
          "episode.episodeNumber as episodeNumber",
          "episode.title as title",
          "episode.duration as duration",
          "episode.airDate as airDate",
        ])
        .where("media.trashedAt", "is", null);

      if (seriesId) {
        query = query.where("episode.mediaId", "=", seriesId);
      }
      if (q) {
        query = query.where("episode.title", "ilike", `%${escapeLike(q)}%`);
      }

      const rows = await query
        .orderBy("media.title", "asc")
        .orderBy("episode.seasonNumber", "asc")
        .orderBy("episode.episodeNumber", "asc")
        .execute();

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
            r.seriesTitle,
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
      let query = database.selectFrom("report").selectAll();

      if (showResolved) {
        query = query.where("resolvedAt", "is not", null);
      } else {
        query = query.where("resolvedAt", "is", null);
      }

      const rows = await query.orderBy("createdAt", "desc").execute();
      const emails = await accountEmails(rows.map((r) => r.userId));

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
            (r.userId && emails.get(r.userId)) || (r.userId ? "Deleted account" : "Guest"),
            r.createdAt,
            r.resolvedAt,
            r.resolvedBy,
            r.notes,
          ])
        ),
      ];
      csvContent = lines.join("\r\n");
    } else if (type === "activity") {
      const [logs, countRow] = await Promise.all([
        database
          .selectFrom("activity_log")
          .selectAll()
          .orderBy("createdAt", "desc")
          .limit(5000)
          .execute(),
        database
          .selectFrom("activity_log")
          .select((eb) => eb.fn.countAll().as("count"))
          .executeTakeFirst(),
      ]);
      const totalCount = countRow ? countOf(countRow) : 0;
      isTruncated = totalCount > 5000;

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
      // Note: Trashed items are intentionally included (with trashedAt timestamp preserved)
      // for complete catalog backup and disaster recovery.
      const mediaList = await database
        .selectFrom("media")
        .selectAll()
        .orderBy("type", "asc")
        .orderBy("createdAt", "desc")
        .execute();

      const [episodes, videoSources] = await Promise.all([
        database
          .selectFrom("episode")
          .selectAll()
          .orderBy("seasonNumber", "asc")
          .orderBy("episodeNumber", "asc")
          .execute(),
        database
          .selectFrom("video_source")
          .selectAll()
          .orderBy("position", "asc")
          .execute(),
      ]);

      const episodesByMediaId = new Map<string, typeof episodes>();
      for (const ep of episodes) {
        const list = episodesByMediaId.get(ep.mediaId) ?? [];
        list.push(ep);
        episodesByMediaId.set(ep.mediaId, list);
      }

      const videoSourcesByMediaId = new Map<string, typeof videoSources>();
      for (const vs of videoSources) {
        if (!vs.mediaId) continue;
        const list = videoSourcesByMediaId.get(vs.mediaId) ?? [];
        list.push(vs);
        videoSourcesByMediaId.set(vs.mediaId, list);
      }

      const allMedia = mediaList.map((m) => ({
        ...m,
        episodes: episodesByMediaId.get(m.id) ?? [],
        videoSources: videoSourcesByMediaId.get(m.id) ?? [],
      }));

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

    const resHeaders: Record<string, string> = {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    };
    if (isTruncated) {
      resHeaders["X-Export-Truncated"] = "true";
    }

    return new NextResponse(csvContent, {
      status: 200,
      headers: resHeaders,
    });
  } catch (err) {
    if (isRedirectError(err)) throw err;
    console.error("Export route error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
