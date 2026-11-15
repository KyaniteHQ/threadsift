import { desc, eq, sql } from "drizzle-orm";

import { FILE_LIST_LIMIT, restoreFilesPrefix } from "./file-keys.ts";
import type { JobPorts } from "./job-outcome.ts";
import type { Database, FileStore } from "./ports.ts";
import { CountsSchema, type RestoreStatus } from "./restore-contract.ts";
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

export async function restoreRunning(db: Database): Promise<boolean> {
  const [found] = await db
    .select({ one: sql<number>`1` })
    .from(restoreRuns)
    .where(eq(restoreRuns.state, "running"))
    .limit(1);

  return found !== undefined;
}

async function newestRestore(db: Database): Promise<RestoreRow | null> {
  const [newest] = await db.select().from(restoreRuns).orderBy(desc(restoreRuns.id)).limit(1);

  return newest ?? null;
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

function countsOf(run: Readonly<RestoreRow>) {
  return {
    restored: CountsSchema.parse(JSON.parse(run.restored)),
    dropped: CountsSchema.parse(JSON.parse(run.dropped)),
  };
}

export async function restoreStatus({
  db,
  files,
}: Pick<JobPorts, "db" | "files">): Promise<RestoreStatus> {
  const libraryEmpty = await libraryIsEmpty(db);
  const run = await newestRestore(db);

  if (run === null) return { state: "none", libraryEmpty };

  const { id } = run;

  switch (run.state) {
    case "uploading":
      return {
        state: "uploading",
        libraryEmpty,
        id,
        bytes: run.bytes,
        parts: run.parts,
        partBytes: run.partBytes,
        received: (await receivedParts(files, id)).toSorted((left, right) => left - right),
      };
    case "running": {
      if (run.phase === "upload") throw new Error(`Restore ${String(id)} runs in its upload phase`);

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
    case "failed": {
      if (run.failure === null) throw new Error(`Restore ${String(id)} failed with no reason`);

      return { state: "failed", libraryEmpty, id, failure: run.failure };
    }

    default:
      return run.state satisfies never;
  }
}
