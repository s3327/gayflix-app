import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import { backfillDefaultVideoSources } from "../src/lib/video-backfill";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL is not set in environment.");
    console.log("To run the backfill against your database, ensure DATABASE_URL is configured or run the job in Admin Panel -> Background Jobs.");
    return;
  }

  const isDryRun = process.argv.includes("--dry-run");
  console.log(`Starting default video embed backfill (dryRun=${isDryRun})...`);

  const result = await backfillDefaultVideoSources({ dryRun: isDryRun });

  console.log("\n--- Backfill Summary ---");
  console.log(`Movies Processed:   ${result.moviesProcessed}`);
  console.log(`Movies Updated:     ${result.moviesUpdated}`);
  console.log(`Episodes Processed: ${result.episodesProcessed}`);
  console.log(`Episodes Updated:   ${result.episodesUpdated}`);
  console.log(`Mode:               ${isDryRun ? "DRY RUN (no DB writes)" : "APPLIED"}`);
  console.log("------------------------\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  });
