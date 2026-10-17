"use server";

import { rollbackTitleRevision } from "@/lib/title-revisions";

export async function rollbackRevisionAction(revisionId: unknown): Promise<{ ok: boolean; message?: string }> {
  return rollbackTitleRevision(revisionId);
}
