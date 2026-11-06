import { appliedMigrations, applyMigrations, cloudflare, type Stage } from "./cloudflare.ts";
import type { CopyRecord } from "./copy.ts";
import type { MigrationHashes } from "./stage.ts";

export function checkMigrations(record: CopyRecord | null, hashes: MigrationHashes): void {
  for (const [file, hash] of Object.entries(record?.migrations ?? {})) {
    if (hashes[file] !== hash)
      throw new Error(
        `Live migration mismatch: ${file}; restore its recorded SQL before deploying`,
      );
  }
}

export async function migrateAndRecord(
  stage: Readonly<Stage>,
  id: string,
  hashes: MigrationHashes,
  saveRecord: (record: CopyRecord) => Promise<void>,
): Promise<void> {
  const [migration] = await Promise.allSettled([
    cloudflare(stage, applyMigrations(stage.target.name)),
  ]);

  try {
    const applied = await appliedMigrations(stage, { name: stage.target.name, id });

    const migrations = Object.fromEntries(
      applied.map((file) => {
        const hash = hashes[file];

        if (hash === undefined)
          throw new Error(`Live applied migration is absent from this build: ${file}`);

        return [file, hash];
      }),
    );

    await saveRecord({ databaseId: id, migrations });
  } catch (error) {
    if (migration.status === "fulfilled") throw error;
    process.stderr.write(`Recording applied migrations also failed: ${String(error)}\n`);
  }

  if (migration.status === "rejected") throw migration.reason;
}
