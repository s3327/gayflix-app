// Pure helpers for scripts/migrate.mjs (no database access, so they're
// unit-tested in scripts/migrate-core.test.ts).

/** "20261010162852_accounts.sql" -> { version, name }, or null if it isn't a migration file. */
export function parseMigrationFile(fileName) {
  const match = /^(\d{14})_(.+)\.sql$/.exec(fileName);
  return match ? { version: match[1], name: match[2] } : null;
}

/**
 * The files not yet applied, sorted by version. `appliedNames` (version ->
 * name, optional) lets it catch a file that was renamed after it ran.
 *
 * @param {{ version: string, name: string }[]} files
 * @param {Set<string>} applied
 * @param {Map<string, string>} [appliedNames]
 */
export function pendingMigrations(files, applied, appliedNames = new Map()) {
  for (const file of files) {
    const was = appliedNames.get(file.version);
    if (applied.has(file.version) && was && was !== file.name) {
      throw new Error(`Migration ${file.version} was renamed (applied as "${was}", file is now "${file.name}")`);
    }
  }
  return files
    .filter((file) => !applied.has(file.version))
    .sort((a, b) => (a.version < b.version ? -1 : a.version > b.version ? 1 : 0));
}

/** Prisma folder names ("<14 digits>_<name>") -> the versions to record as applied. */
export function adoptPrismaHistory(prismaFinished) {
  return prismaFinished.map((folder) => folder.split("_")[0]);
}
