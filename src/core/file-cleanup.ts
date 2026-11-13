import { and, eq, exists, or, sql } from "drizzle-orm";

import { logFailure } from "./failure-log.ts";
import { ITEM_FILES_ROOT, finalKeyOf, isSweptKey } from "./file-keys.ts";
import type { JobPorts } from "./job-outcome.ts";
import { ATTEMPT_FILES } from "./job-rows.ts";
import type { Database } from "./ports.ts";
import { fileCleaning, items, jobs, media } from "./schema.ts";

const CLEANUP_PAGE_KEYS = 100;

function named(db: Database) {
  return or(
    exists(
      db
        .select({ one: sql`1` })
        .from(items)
        .where(sql`${items.postTextKey} = listed.value`),
    ),
    exists(
      db
        .select({ one: sql`1` })
        .from(media)
        .where(sql`${media.fileKey} = listed.value`),
    ),
  );
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
  const rows = await listed(db, keys).where(named(db));

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

  const rows = await listed(db, keys).where(or(named(db), claimed));

  return new Set(rows.map(({ key }) => key));
}

export async function cleanFiles({ db, files }: Readonly<Pick<JobPorts, "db" | "files">>) {
  const [saved] = await db.select().from(fileCleaning).where(eq(fileCleaning.id, 1));
  const page = await files.list(ITEM_FILES_ROOT, saved?.cursor ?? null, CLEANUP_PAGE_KEYS);
  const keys = page.files.map(({ key }) => key);
  const owned = keys.filter((key) => isSweptKey(finalKeyOf(key)));
  const kept = await protectedKeys(db, [...new Set(owned.map((key) => finalKeyOf(key)))]);
  const stray = owned.filter((key) => !kept.has(finalKeyOf(key)));

  if (stray.length > 0) await files.delete(stray);

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
