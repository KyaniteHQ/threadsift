import { CheckCursorSchema, entering } from "../../../core/contract/restore-contract.ts";
import { logFailure } from "../../../core/kernel/failure-log.ts";
import type { JobOutcome, JobPorts } from "../../../core/kernel/job-outcome.ts";
import type { RestoreRow } from "../../../core/kernel/schema.ts";
import { appliedMigration } from "../../export/core/export-format.ts";
import type { ZipSource } from "../../export/core/zip-read.ts";
import { type Env, advance, rowsMatch } from "./restore-check-scan.ts";
import { checkedTables, readManifest } from "./restore-check.ts";
import { type RefusalDetail, RestoreRefused, restoreRefusalOf } from "./restore-refusal.ts";
import { type Release, readRestoreDirectory } from "./restore-source.ts";
import { endedUnit, steppedUnit } from "./restore-unit.ts";

async function readRelease(
  { db }: Pick<JobPorts, "db">,
  source: Readonly<ZipSource>,
): Promise<Release> {
  const directory = await readRestoreDirectory(source);
  const manifest = await readManifest(source, directory);
  const running = await appliedMigration(db);

  if (manifest.migration === null || running === null || manifest.migration !== running) {
    throw new RestoreRefused(
      "other-release",
      "The export migration does not match the running migration",
    );
  }

  return { directory, manifest };
}

async function environment(ports: Pick<JobPorts, "db">, source: Readonly<ZipSource>): Promise<Env> {
  const { directory, manifest } = await readRelease(ports, source);

  checkedTables(manifest, directory);

  return { source, directory, manifest };
}

function refusedUnit(
  db: JobPorts["db"],
  run: Readonly<RestoreRow>,
  { code, message }: Readonly<RefusalDetail>,
  cause: unknown,
): JobOutcome {
  logFailure("restore-check-refused", { restoreId: run.id, failure: code, message }, cause);

  return endedUnit(db, run, { state: "failed", failure: code, updatedAt: Date.now() });
}

type VerifiedRelease =
  | { readonly kind: "current"; readonly release: Release }
  | { readonly kind: "refused"; readonly outcome: JobOutcome };

export async function verifiedRelease(
  ports: Pick<JobPorts, "db">,
  run: Readonly<RestoreRow>,
  source: Readonly<ZipSource>,
): Promise<VerifiedRelease> {
  try {
    return { kind: "current", release: await readRelease(ports, source) };
  } catch (error) {
    const refusal = restoreRefusalOf(error);

    if (refusal?.code !== "other-release") throw error;

    return { kind: "refused", outcome: refusedUnit(ports.db, run, refusal, error) };
  }
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
    const refusal = restoreRefusalOf(error);

    if (refusal === null) throw error;

    return refusedUnit(db, run, refusal, error);
  }
}
