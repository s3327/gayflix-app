import { backfillDefaultVideoSources } from "../src/lib/video-backfill";

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  console.log(`Starting default video embed backfill (dryRun=${isDryRun})...`);

  const result = await backfillDefaultVideoSources({ dryRun: isDryRun });

  console.log("\n--- Backfill Summary ---");
  console.log(`Movies Processed:  ${result.moviesProcessed}`);
  console.log(`Movies Updated:    ${result.moviesUpdated}`);
  console.log(`Episodes Processed:${result.episodesProcessed}`);
  console.log(`Episodes Updated:  ${result.episodesUpdated}`);
  console.log(`Mode:              ${isDryRun ? "DRY RUN (no DB writes)" : "APPLIED"}`);
  console.log("------------------------\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  });
