import { CheckCursorSchema, entering } from "../../../core/contract/restore-contract.ts";
import type { JobOutcome, JobPorts } from "../../../core/kernel/job-outcome.ts";
import type { RestoreRow } from "../../../core/kernel/schema.ts";
import { appliedMigration } from "../../export/core/export-format.ts";
import type { ZipSource } from "../../export/core/zip-read.ts";
import { type Env, advance, rowsMatch } from "./restore-check-scan.ts";
import { checkedTables, readManifest } from "./restore-check.ts";
import { RestoreRefused, restoreRefusalOf } from "./restore-refusal.ts";
import { readRestoreDirectory } from "./restore-source.ts";
import { endedUnit, steppedUnit } from "./restore-unit.ts";

async function environment(
  { db }: Pick<JobPorts, "db">,
  source: Readonly<ZipSource>,
): Promise<Env> {
  const directory = await readRestoreDirectory(source);
  const manifest = await readManifest(source, directory);
  const running = await appliedMigration(db);

  if (manifest.migration === null || running === null || manifest.migration !== running) {
    throw new RestoreRefused(
      "other-release",
      "The export migration does not match the running migration",
    );
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

    return steppedUnit(db, run, entering("tables"));
  } catch (error) {
    const failure = restoreRefusalOf(error);

    if (failure === null) throw error;

    return endedUnit(db, run, { state: "failed", failure, updatedAt: Date.now() });
  }
}
