import { and, eq, exists, or, sql } from "drizzle-orm";

import { finalKeyOf } from "./file-keys.ts";
import type { JobPorts } from "./job-outcome.ts";
import type { Database } from "./ports.ts";
import { ATTEMPT_KEY, fileCleaning, items, jobs } from "./schema.ts";

const CLEANUP_PAGE_KEYS = 100;

async function protectedKeys(db: Database, keys: readonly string[]): Promise<ReadonlySet<string>> {
  const named = exists(
    db
      .select({ one: sql`1` })
      .from(items)
      .where(sql`${items.postTextKey} = listed.value`),
  );

  const claimed = exists(
    db
      .select({ one: sql`1` })
      .from(jobs)
      .where(and(eq(jobs.state, "running"), sql`${ATTEMPT_KEY} = listed.value`)),
  );

  const rows = await db
    .select({ key: sql<string>`listed.value` })
    .from(sql`json_each(${JSON.stringify(keys)}) as listed`)
    .where(or(named, claimed));

  return new Set(rows.map(({ key }) => key));
}

export async function cleanFiles({ db, files }: Readonly<Pick<JobPorts, "db" | "files">>) {
  const [saved] = await db.select().from(fileCleaning).where(eq(fileCleaning.id, 1));
  const page = await files.list("items/", saved?.cursor ?? null, CLEANUP_PAGE_KEYS);
  const keys = page.files.map(({ key }) => key);
  const kept = await protectedKeys(db, [...new Set(keys.map((key) => finalKeyOf(key)))]);
  const stray = keys.filter((key) => !kept.has(finalKeyOf(key)));

  if (stray.length > 0) await files.delete(stray);

  await db
    .insert(fileCleaning)
    .values({ id: 1, cursor: page.cursor })
    .onConflictDoUpdate({ target: fileCleaning.id, set: { cursor: page.cursor } });
}
