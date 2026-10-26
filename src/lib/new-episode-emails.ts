import { listNewEpisodes } from "@/lib/catalog";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { newEpisodesEmail } from "@/lib/email-templates";
import { siteUrl } from "@/lib/site-url";
import { unsubscribeUrl } from "@/lib/unsubscribe";

/*
 * New-episode emails (A16): after the nightly publish job, each member
 * with a series in Favorites that got episodes since the last run gets
 * one email listing them. Members who turned these off (Account →
 * Setting, or the email's unsubscribe link: notification_setting), and
 * accounts that are banned or never confirmed their email, get none.
 * Run by runNewEpisodeEmailsJob in src/lib/scheduled-jobs.ts. Server only.
 */

/** "S2 E3 Homecoming". */
export function episodeLabel(episode: { seasonNumber: number; episodeNumber: number; title: string }): string {
  return `S${episode.seasonNumber} E${episode.episodeNumber} ${episode.title}`.trim();
}

/** Sends the emails for episodes added after `since`, up to `until`. Returns how many went out. */
export async function sendNewEpisodeEmails(since: Date, until: Date): Promise<{ emails: number; episodes: number }> {
  const series = await listNewEpisodes(since, until);
  if (series.length === 0) return { emails: 0, episodes: 0 };

  const now = new Date();
  const favorites = await db.favorite.findMany({
    where: {
      mediaId: { in: series.map((each) => each.seriesId) },
      user: {
        emailVerified: true,
        OR: [{ banned: null }, { banned: false }, { banExpires: { lt: now } }],
        NOT: { notificationSetting: { newEpisodes: false } },
      },
    },
    select: { mediaId: true, user: { select: { id: true, email: true } } },
  });

  const byUser = new Map<string, { email: string; seriesIds: Set<string> }>();
  for (const { mediaId, user } of favorites) {
    const entry = byUser.get(user.id) ?? { email: user.email, seriesIds: new Set<string>() };
    entry.seriesIds.add(mediaId);
    byUser.set(user.id, entry);
  }

  const origin = siteUrl().origin;
  let emails = 0;
  for (const [userId, { email, seriesIds }] of byUser) {
    const theirs = series
      .filter((each) => seriesIds.has(each.seriesId))
      .map((each) => ({
        title: each.seriesTitle,
        url: `${origin}/series/${each.seriesId}`,
        episodes: each.episodes.map(episodeLabel),
      }));
    const unsubscribe = unsubscribeUrl(origin, userId);
    const oneClick = unsubscribe.replace("/unsubscribe?", "/api/unsubscribe?");
    try {
      await sendEmail({
        to: email,
        ...newEpisodesEmail(theirs, unsubscribe, origin),
        headers: { "List-Unsubscribe": `<${oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      });
      emails++;
    } catch (error) {
      // One failed address doesn't stop the rest.
      console.error("[new-episode email] failed:", error);
    }
  }
  return { emails, episodes: series.reduce((sum, each) => sum + each.episodes.length, 0) };
}
