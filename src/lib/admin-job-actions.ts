"use server";

import { triggerJob } from "@/lib/scheduled-jobs";

export async function triggerJobAction(jobName: string): Promise<{ ok: boolean; message: string }> {
  return triggerJob(jobName);
}
