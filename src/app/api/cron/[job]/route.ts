import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import {
  runTrashPurgeJob,
  runPublishDueJob,
  runNewEpisodeEmailsJob,
  runOrphanImageCleanupJob,
} from "@/lib/scheduled-jobs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ job: string }> }
) {
  const authHeader = request.headers.get("authorization");
  if (!isAuthorizedCron(authHeader, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { job } = await params;

  try {
    if (job === "purge-trash" || job === "purge_trash") {
      const result = await runTrashPurgeJob("cron");
      return NextResponse.json({ ok: true, job, result });
    }

    if (job === "publish-due" || job === "publish_due") {
      const result = await runPublishDueJob("cron");
      // Then the emails, which include the episodes of what it just
      // published. In the same call: Vercel limits a project's cron jobs.
      const emails = await runNewEpisodeEmailsJob("cron");
      return NextResponse.json({ ok: true, job, result, emails });
    }

    if (job === "new-episode-emails" || job === "new_episode_emails") {
      const result = await runNewEpisodeEmailsJob("cron");
      return NextResponse.json({ ok: true, job, result });
    }

    if (job === "clean-orphans" || job === "clean_orphans") {
      const result = await runOrphanImageCleanupJob("cron");
      return NextResponse.json({ ok: true, job, result });
    }

    return NextResponse.json({ error: `Unknown job: ${job}` }, { status: 404 });
  } catch (error) {
    console.error(`[cron] job '${job}' failed:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
