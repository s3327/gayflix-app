"use server";

import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isUnsubscribeToken } from "@/lib/unsubscribe";

/*
 * Server functions for a member's email choices (notification_setting):
 * the switch in Account → Setting, and the unsubscribe link in the
 * new-episode emails, which works without signing in. Each checks its
 * input itself.
 */

async function saveNewEpisodes(userId: string, newEpisodes: boolean) {
  await db.notificationSetting.upsert({
    where: { userId },
    create: { userId, newEpisodes },
    update: { newEpisodes },
  });
}

/** Account → Setting: new-episode emails on or off. */
export async function setNewEpisodeEmails(on: unknown): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("Not signed in");
  if (typeof on !== "boolean") throw new Error("Invalid setting");
  await saveNewEpisodes(session.user.id, on);
}

/** The unsubscribe link's button: turns new-episode emails off for that account. */
export async function unsubscribeFromNewEpisodes(userId: unknown, token: unknown): Promise<boolean> {
  if (!isUnsubscribeToken(userId, token)) return false;
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return false;
  await saveNewEpisodes(user.id, false);
  return true;
}
