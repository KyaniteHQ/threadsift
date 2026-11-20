import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { BACKUP_TABLES, backupTable } from "./backup-tables.ts";
import type { Database } from "./database.ts";
import { restoreFilesPrefix } from "./file-keys.ts";
import { listedKeys } from "./file-pages.ts";
import type { FileStore } from "./file-store.ts";
import type { JobPorts } from "./job-outcome.ts";
import { COPY_RESTORE_PHASES } from "./kinds.ts";
import {
  CountsSchema,
  KEPT_HIGHLIGHTS,
  MISSING_FILES,
  RESTORED_FILES,
  type RestoreStatus,
} from "./restore-contract.ts";
import { cancelling, resumable, undoFailed } from "./restore-hold.ts";
import { type RestoreRow, restoreRuns } from "./schema.ts";

const CopyPhaseSchema = z.enum(COPY_RESTORE_PHASES);

const PART_NAME = /\/part-(?<part>[1-9][0-9]{0,9})$/u;

export const EMPTY_LIBRARY = sql.join(
  Object.keys(BACKUP_TABLES)
    .filter((table) => backupTable(table).mustBeEmpty === true)
    .map((table) => sql`not exists (select 1 from ${sql.identifier(table)})`),
  sql` and `,
);

export async function libraryIsEmpty(db: Database): Promise<boolean> {
  const [found] = await db.select({ empty: sql<number>`${EMPTY_LIBRARY}` }).from(sql`(select 1)`);

  return found?.empty === 1;
}

async function newestRestore(db: Database): Promise<RestoreRow | null> {
  const [newest] = await db.select().from(restoreRuns).orderBy(desc(restoreRuns.id)).limit(1);

  return newest ?? null;
}

export async function isNewestRestore(db: Database, id: number): Promise<boolean> {
  return (await newestRestore(db))?.id === id;
}

export async function restoreById(db: Database, id: number): Promise<RestoreRow | null> {
  const [run] = await db.select().from(restoreRuns).where(eq(restoreRuns.id, id));

  return run ?? null;
}

export async function receivedParts(
  files: Pick<FileStore, "list">,
  id: number,
): Promise<readonly number[]> {
  const keys = await listedKeys(files, restoreFilesPrefix(id));

  return keys.flatMap((key) => {
    const part = PART_NAME.exec(key)?.groups?.["part"];

    return part === undefined ? [] : [Number(part)];
  });
}

export async function holdsEveryPart(
  files: Pick<FileStore, "list">,
  { id, parts }: Readonly<Pick<RestoreRow, "id" | "parts">>,
): Promise<boolean> {
  const received = new Set(await receivedParts(files, id));

  return Array.from({ length: parts }, (_, at) => at + 1).every((part) => received.has(part));
}

function countsOf(run: Readonly<RestoreRow>) {
  const { [RESTORED_FILES]: files = 0, ...restored } = CountsSchema.parse(JSON.parse(run.restored));

  const {
    [MISSING_FILES]: missingFiles = 0,
    [KEPT_HIGHLIGHTS]: keptHighlights = 0,
    ...dropped
  } = CountsSchema.parse(JSON.parse(run.dropped));

  return { restored, dropped, files, missingFiles, keptHighlights };
}

type StatusPorts = Pick<JobPorts, "db" | "files">;

async function uploadingStatus(
  { files }: Pick<StatusPorts, "files">,
  run: Readonly<RestoreRow>,
  libraryEmpty: boolean,
): Promise<RestoreStatus> {
  const { id } = run;

  return {
    state: "uploading",
    libraryEmpty,
    id,
    bytes: run.bytes,
    parts: run.parts,
    partBytes: run.partBytes,
    received: (await receivedParts(files, id)).toSorted((left, right) => left - right),
  };
}

async function failedStatus(
  { files }: Pick<StatusPorts, "files">,
  run: Readonly<RestoreRow>,
  libraryEmpty: boolean,
): Promise<RestoreStatus> {
  const { id } = run;

  if (run.failure === null) throw new Error(`Restore ${String(id)} failed with no reason`);

  return {
    state: "failed",
    libraryEmpty,
    id,
    failure: run.failure,
    resumable: resumable(run) && (await holdsEveryPart(files, run)),
    cancelFailed: undoFailed(run),
  };
}

export async function restoreStatus(ports: StatusPorts): Promise<RestoreStatus> {
  const libraryEmpty = await libraryIsEmpty(ports.db);
  const run = await newestRestore(ports.db);

  if (run === null) return { state: "none", libraryEmpty };

  const { id } = run;

  switch (run.state) {
    case "uploading":
      return uploadingStatus(ports, run, libraryEmpty);
    case "running": {
      if (cancelling(run)) return { state: "cancelling", libraryEmpty, id };

      const phase = CopyPhaseSchema.parse(run.phase);

      return { state: "running", libraryEmpty, id, phase, ...countsOf(run) };
    }

    case "done": {
      if (run.finishedAt === null)
        throw new Error(`Restore ${String(id)} is done with no end time`);

      return { state: "done", libraryEmpty, id, finishedAt: run.finishedAt, ...countsOf(run) };
    }

    case "failed":
      return failedStatus(ports, run, libraryEmpty);

    case "cancelled":
      return { state: "cancelled", libraryEmpty, id };

    default:
      return run.state satisfies never;
  }
}
