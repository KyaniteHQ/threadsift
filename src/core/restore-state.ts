import { desc, eq, sql } from "drizzle-orm";

import { FILE_LIST_LIMIT, restoreFilesPrefix } from "./file-keys.ts";
import type { JobPorts } from "./job-outcome.ts";
import type { Database, FileStore } from "./ports.ts";
import {
  CountsSchema,
  KEPT_HIGHLIGHTS,
  MISSING_FILES,
  RESTORED_FILES,
  type RestoreStatus,
} from "./restore-contract.ts";
import { type RestoreRow, restoreRuns } from "./schema.ts";

const PART_NAME = /\/part-(?<part>[1-9][0-9]{0,9})$/u;

const LIBRARY_TABLES = ["items", "topics", "tags", "log_entries", "proposals", "pins", "imports"];

export const EMPTY_LIBRARY = sql.join(
  LIBRARY_TABLES.map((table) => sql`not exists (select 1 from ${sql.identifier(table)})`),
  sql` and `,
);

export async function libraryIsEmpty(db: Database): Promise<boolean> {
  const [found] = await db.select({ empty: sql<number>`${EMPTY_LIBRARY}` }).from(sql`(select 1)`);

  return found?.empty === 1;
}

export const NEWEST_RESTORE = sql`${restoreRuns.id} = (select max(${restoreRuns.id}) from ${restoreRuns})`;

export const RESUMABLE_RESTORE = sql`${restoreRuns.state} = 'failed' and ${restoreRuns.failure} = 'gave-up' and ${restoreRuns.phase} <> 'undoing'`;

const HOLDS_LIBRARY = sql`(${restoreRuns.state} = 'running' or (${restoreRuns.state} = 'failed' and ${restoreRuns.failure} = 'gave-up')) and ${NEWEST_RESTORE}`;

export async function restoreHoldsLibrary(db: Database): Promise<boolean> {
  const [found] = await db
    .select({ one: sql<number>`1` })
    .from(restoreRuns)
    .where(HOLDS_LIBRARY)
    .limit(1);

  return found !== undefined;
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
  cursor: string | null = null,
): Promise<readonly number[]> {
  const page = await files.list(restoreFilesPrefix(id), cursor, FILE_LIST_LIMIT);

  const here = page.files.flatMap(({ key }) => {
    const part = PART_NAME.exec(key)?.groups?.["part"];

    return part === undefined ? [] : [Number(part)];
  });

  return page.cursor === null ? here : [...here, ...(await receivedParts(files, id, page.cursor))];
}

export async function holdsEveryPart(
  files: Pick<FileStore, "list">,
  { id, parts }: Readonly<Pick<RestoreRow, "id" | "parts">>,
): Promise<boolean> {
  const received = new Set(await receivedParts(files, id));

  return Array.from({ length: parts }, (_, at) => at + 1).every((part) => received.has(part));
}

export function resumable(run: Readonly<Pick<RestoreRow, "state" | "phase" | "failure">>): boolean {
  return run.state === "failed" && run.failure === "gave-up" && run.phase !== "undoing";
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
    cancelFailed: run.phase === "undoing",
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
      if (run.phase === "upload") throw new Error(`Restore ${String(id)} runs in its upload phase`);

      if (run.phase === "undoing") return { state: "cancelling", libraryEmpty, id };

      return { state: "running", libraryEmpty, id, phase: run.phase, ...countsOf(run) };
    }

    case "done":
      return {
        state: "done",
        libraryEmpty,
        id,
        finishedAt: run.finishedAt ?? run.updatedAt,
        ...countsOf(run),
      };
    case "failed":
      return failedStatus(ports, run, libraryEmpty);

    case "cancelled":
      return { state: "cancelled", libraryEmpty, id };

    default:
      return run.state satisfies never;
  }
}
