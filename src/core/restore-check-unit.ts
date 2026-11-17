import { appliedMigration } from "./export-manifest.ts";
import type { JobOutcome, JobPorts } from "./job-outcome.ts";
import { type Env, advance, rowsMatch } from "./restore-check-scan.ts";
import { checkedTables, readManifest, refused } from "./restore-check.ts";
import { CheckCursorSchema, START_CURSOR } from "./restore-contract.ts";
import { failedUnit, steppedUnit } from "./restore-unit.ts";
import type { RestoreRow } from "./schema.ts";
import { readDirectory } from "./zip-directory.ts";
import { ZipRefused, type ZipSource } from "./zip-read.ts";

async function environment(
  { db }: Pick<JobPorts, "db">,
  source: Readonly<ZipSource>,
): Promise<Env> {
  const directory = await readDirectory(source);
  const manifest = await readManifest(source, directory);
  const running = await appliedMigration(db);

  if (manifest.migration === null || running === null || manifest.migration !== running) {
    throw refused("other-release", "The export migration does not match the running migration");
  }

  checkedTables(manifest, directory);

  return { source, directory, manifest };
}

export async function checkUnit(
  ports: JobPorts,
  run: Readonly<RestoreRow>,
  source: Readonly<ZipSource>,
): Promise<JobOutcome> {
  const { db } = ports;

  try {
    const env = await environment(ports, source);
    const next = await advance(env, CheckCursorSchema.parse(JSON.parse(run.cursor)));

    if (next.entry < env.directory.entries.length) {
      return steppedUnit(db, run, { cursor: JSON.stringify(next) });
    }

    rowsMatch(env, next.rows);

    return steppedUnit(db, run, { phase: "tables", cursor: JSON.stringify(START_CURSOR) });
  } catch (error) {
    if (!(error instanceof ZipRefused)) throw error;

    return failedUnit(db, run, error.code);
  }
}
