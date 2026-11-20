import { type SQL, eq, notExists, sql } from "drizzle-orm";

import { catalogKey } from "../contract/catalog-key.ts";
import type { Database } from "../kernel/database.ts";
import { guardedResults } from "../kernel/guards.ts";
import type { JobPorts } from "../kernel/job-outcome.ts";
import { OpenedJobsSchema, enqueueRows } from "../kernel/job-rows.ts";
import { loggedMerge } from "../kernel/log-writes.ts";
import { proposals } from "../kernel/schema.ts";
import { retired } from "./catalog.ts";
import { MERGE } from "./merge-kinds.ts";
import type { MergeKindSpec, MergeRow, Side } from "./merge-unit.ts";
import { mergePinWrites } from "./pins.ts";
import { atRevision, unitAdvanced, unitApplied } from "./proposal-lifecycle.ts";

type Outcome = "ran" | "lost";

function unitGuard(id: number, row: Readonly<MergeRow>): SQL {
  const { table, from, into } = MERGE[row.kind];
  const names = sql`${proposals.id} = ${id} and ${from} = ${row.from.id} and ${into} = ${row.into.id} and exists (select 1 from ${table} where ${table.id} = ${row.from.id} and ${table.key} = ${row.from.key}) and exists (select 1 from ${table} where ${table.id} = ${row.into.id} and ${table.key} = ${row.into.key})`;

  return sql`exists (select 1 from ${proposals} where ${names} and ${proposals.state} = 'accepting' and ${atRevision(row.revision)})`;
}

function unlinked(db: Database, spec: Readonly<MergeKindSpec>, id: number): SQL {
  const absent = [spec.itemLink.entry, ...spec.alsoLinked].map((entry) =>
    notExists(
      db
        .select({ one: sql`1` })
        .from(entry.table)
        .where(eq(entry, id)),
    ),
  );

  return sql.join(absent, sql` and `);
}

function recomputed({ id, name }: Readonly<Side>): Side {
  return { id, key: catalogKey(name), name };
}

export async function applyUnit(
  ports: JobPorts,
  id: number,
  row: Readonly<MergeRow>,
): Promise<Outcome> {
  const { db } = ports;
  const spec = MERGE[row.kind];
  const from = recomputed(row.from);
  const into = recomputed(row.into);
  const gone = unlinked(db, spec, from.id);
  const plan = await spec.plan({ db, from, into, cursor: row.cursor, gone });

  const head = [
    unitApplied(db, id, plan.moving),
    ...mergePinWrites(db, row.kind, { from, into }),
    ...plan.moves,
    unitAdvanced(db, id, plan.cursor, row.revision + 1),
    ...plan.before,
    ...loggedMerge(db, {
      action: spec.log,
      proposalId: id,
      mergedFrom: from.name,
      mergedInto: into.name,
      when: gone,
    }),
  ];

  const writes = [...head, ...plan.wakes, ...retired(db, spec.table, from.id, gone)];
  const results = await guardedResults(db, unitGuard(id, row), writes);

  if (results === null) return "lost";

  await enqueueRows(
    ports,
    results
      .slice(head.length, head.length + plan.wakes.length)
      .flatMap((opened) => OpenedJobsSchema.parse(opened)),
  );

  return "ran";
}
