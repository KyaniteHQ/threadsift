import { type SQL, eq, notExists, sql } from "drizzle-orm";

import { catalogKey } from "../../../core/contract/catalog-key.ts";
import type { Database } from "../../../core/kernel/database.ts";
import type { JobPorts } from "../../../core/kernel/job-outcome.ts";
import { enqueueRows, openedRows } from "../../../core/kernel/job-rows.ts";
import { loggedMerge } from "../../../core/kernel/log-writes.ts";
import { heldBatch } from "../../../core/kernel/restore-hold.ts";
import { proposals } from "../../../core/kernel/schema.ts";
import { retired } from "./catalog.ts";
import { MERGE } from "./merge-kinds.ts";
import type { MergeKindSpec, MergeRow, Side } from "./merge-unit.ts";
import { mergePinWrites } from "./pins.ts";
import { atRevision, unitAdvanced, unitApplied } from "./proposal-lifecycle.ts";

function unitGuard(id: number, row: Readonly<MergeRow>): SQL {
  const { table, subject, from, into } = MERGE[row.kind];
  const names = sql`${proposals.id} = ${id} and ${from} = ${row.from.id} and ${into} = ${row.into.id} and exists (select 1 from ${table} where ${table.id} = ${row.from.id} and ${table.key} = ${row.from.key}) and exists (select 1 from ${table} where ${table.id} = ${row.into.id} and ${table.key} = ${row.into.key})`;

  return sql`exists (select 1 from ${proposals} join ${subject} on ${subject.proposalId} = ${proposals.id} where ${names} and ${proposals.state} = 'accepting' and ${atRevision(row.revision)})`;
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
): Promise<void> {
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

  const written = await heldBatch(
    db,
    [...head, ...plan.wakes, ...retired(db, spec.table, from.id, gone)],
    unitGuard(id, row),
  );

  if (written !== null) {
    await enqueueRows(ports, openedRows(written, head.length, plan.wakes.length));
  }
}
