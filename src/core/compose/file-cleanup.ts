import { and, eq, exists, or, sql } from "drizzle-orm";

import { ITEM_FILES_ROOT, finalKeyOf, isSweptKey } from "../contract/file-keys.ts";
import type { Database } from "../kernel/database.ts";
import { logFailure } from "../kernel/failure-log.ts";
import type { FileStore } from "../kernel/file-store.ts";
import type { JobPorts } from "../kernel/job-outcome.ts";
import { ATTEMPT_FILES } from "../kernel/job-rows.ts";
import { restoreHoldsLibrary } from "../kernel/restore-hold.ts";
import { fileCleaning, jobs } from "../kernel/schema.ts";
import { NAMED_FILES } from "../restore/named-files.ts";

const CLEANUP_PAGE_KEYS = 100;

function named() {
  return sql`exists (select 1 from ${NAMED_FILES} as named where named.key = listed.value)`;
}

function listed(db: Database, keys: readonly string[]) {
  return db
    .select({ key: sql<string>`listed.value` })
    .from(sql`json_each(${JSON.stringify(keys)}) as listed`);
}

export async function namedKeys(
  db: Database,
  keys: readonly string[],
): Promise<ReadonlySet<string>> {
  const rows = await listed(db, keys).where(named());

  return new Set(rows.map(({ key }) => key));
}

async function protectedKeys(db: Database, keys: readonly string[]): Promise<ReadonlySet<string>> {
  const claimed = exists(
    db
      .select({ one: sql`1` })
      .from(jobs)
      .where(
        and(
          eq(jobs.state, "running"),
          or(
            sql`${ATTEMPT_FILES.postText} = listed.value`,
            sql`substr(listed.value, 1, length(${ATTEMPT_FILES.imagePrefix})) = ${ATTEMPT_FILES.imagePrefix}`,
          ),
        ),
      ),
  );

  const rows = await listed(db, keys).where(or(named(), claimed));

  return new Set(rows.map(({ key }) => key));
}

async function deleteUnclaimed(
  db: Database,
  files: FileStore,
  stray: readonly string[],
): Promise<void> {
  if (await restoreHoldsLibrary(db)) return;

  const held = await namedKeys(
    db,
    stray.map((key) => finalKeyOf(key)),
  );

  const doomed = stray.filter((key) => !held.has(finalKeyOf(key)));

  if (doomed.length > 0) await files.delete(doomed);
}

export async function cleanFiles({ db, files }: Readonly<Pick<JobPorts, "db" | "files">>) {
  const [saved] = await db.select().from(fileCleaning).where(eq(fileCleaning.id, 1));
  const page = await files.list(ITEM_FILES_ROOT, saved?.cursor ?? null, CLEANUP_PAGE_KEYS);
  const keys = page.keys;
  const owned = keys.filter((key) => isSweptKey(finalKeyOf(key)));
  const kept = await protectedKeys(db, [...new Set(owned.map((key) => finalKeyOf(key)))]);
  const stray = owned.filter((key) => !kept.has(finalKeyOf(key)));

  if (stray.length > 0) await deleteUnclaimed(db, files, stray);

  await db
    .insert(fileCleaning)
    .values({ id: 1, cursor: page.cursor })
    .onConflictDoUpdate({ target: fileCleaning.id, set: { cursor: page.cursor } });
}

export async function deleteQuietly(
  ports: JobPorts,
  keys: readonly string[],
  doomed: (keys: readonly string[]) => Promise<readonly string[]> = (all) => Promise.resolve(all),
): Promise<void> {
  if (keys.length === 0) return;

  try {
    await ports.files.delete(await doomed(keys));
  } catch (error) {
    logFailure("file-not-deleted", { keys: keys.length }, error);
  }
}

export async function unnamed(
  ports: JobPorts,
  keys: readonly string[],
): Promise<readonly string[]> {
  const held = await namedKeys(ports.db, keys);

  return keys.filter((key) => !held.has(key));
}
