import { type SQL, and, asc, eq, sql } from "drizzle-orm";

import { guardedResults } from "./guards.ts";
import type { JobPorts } from "./job-outcome.ts";
import { OpenedJobsSchema, enqueueRows } from "./job-rows.ts";
import { recordingFailure, releasedAfterFailure } from "./merge-failure.ts";
import { MERGES, readRow } from "./merge-kinds.ts";
import type { MergeRow, MergeUnit } from "./merge-unit.ts";
import {
  atRevision,
  proposalClaimed,
  handedBack,
  unitAdvanced,
  unitApplied,
} from "./proposal-lifecycle.ts";
import { proposals } from "./schema.ts";
import { leaseHolds, releaseTopicLease } from "./topic-lease.ts";

const UNITS_PER_ACCEPT = 50;

export type MergeAcceptance =
  | "done"
  | "accepting"
  | "unknown"
  | "not-open"
  | "merge-busy"
  | "topic-busy";

function unitGuard(id: number, row: Readonly<MergeRow>): SQL {
  const { catalog } = MERGES[row.kind];
  const names = sql`${proposals.id} = ${id} and ${catalog.proposalFrom} = ${row.from.id} and ${catalog.proposalInto} = ${row.into.id} and exists (select 1 from ${catalog.table} where ${catalog.table.id} = ${row.from.id} and ${catalog.table.key} = ${row.from.key}) and exists (select 1 from ${catalog.table} where ${catalog.table.id} = ${row.into.id} and ${catalog.table.key} = ${row.into.key})`;

  return sql`exists (select 1 from ${proposals} where ${names} and ${proposals.state} = 'accepting' and ${atRevision(row.revision)})`;
}

type Outcome = "ran" | "lost" | "busy";

async function applyUnit(
  ports: JobPorts,
  id: number,
  row: Readonly<MergeRow>,
  unit: Readonly<MergeUnit>,
): Promise<Outcome> {
  const { db } = ports;

  const head = [
    unitApplied(db, id, unit.moving),
    ...unit.pin,
    ...unit.moves,
    unitAdvanced(db, id, unit.cursor, row.revision + 1),
    ...unit.leases.map((lease) => releaseTopicLease(db, lease)),
  ];

  const writes = [...head, ...unit.closing.writes];

  try {
    const holds = sql`${and(unitGuard(id, row), ...unit.leases.map((lease) => leaseHolds(lease)))}`;
    const results = await guardedResults(db, holds, writes);

    if (results === null) {
      await releasedAfterFailure(db, id, unit.leases);

      return "lost";
    }

    await enqueueRows(
      ports,
      unit.closing.wakes.flatMap((at) => OpenedJobsSchema.parse(results[head.length + at])),
    );

    return "ran";
  } catch (error) {
    await releasedAfterFailure(db, id, unit.leases);

    throw error;
  }
}

function runUnit(ports: JobPorts, id: number, row: Readonly<MergeRow>): Promise<Outcome> {
  return recordingFailure(ports.db, { id, revision: row.revision }, async () => {
    const unit = await MERGES[row.kind].plan(ports.db, id, row);

    return unit === "busy" || unit === "lost" ? unit : applyUnit(ports, id, row, unit);
  });
}

async function continueMerge(
  ports: JobPorts,
  id: number,
  budget: number,
): Promise<"done" | "accepting"> {
  const row = await readRow(ports.db, id);

  if (row?.state !== "accepting") return "done";

  if (budget === 0) return "accepting";

  if ((await runUnit(ports, id, row)) === "busy") return "accepting";

  return continueMerge(ports, id, budget - 1);
}

async function firstUnit(
  ports: JobPorts,
  id: number,
  row: Readonly<MergeRow>,
): Promise<Outcome | "handed-back"> {
  const outcome = await runUnit(ports, id, row);

  return outcome === "busy" && (await handedBack(ports.db, id)).length > 0
    ? "handed-back"
    : outcome;
}

async function startUnit(
  ports: JobPorts,
  id: number,
  row: Readonly<MergeRow>,
): Promise<MergeAcceptance> {
  const outcome = await firstUnit(ports, id, row);

  if (outcome === "handed-back") return "topic-busy";

  const after = await readRow(ports.db, id);

  if (outcome !== "lost") {
    return after === undefined ? "done" : continueMerge(ports, id, UNITS_PER_ACCEPT - 1);
  }

  return after?.state === "accepting" ? startUnit(ports, id, after) : "unknown";
}

export async function acceptMerge(ports: JobPorts, id: number): Promise<MergeAcceptance> {
  const { db } = ports;
  const [claim] = await proposalClaimed(db, id);

  if (claim !== undefined) {
    const row = await readRow(db, id);

    return row === undefined ? "done" : startUnit(ports, id, row);
  }

  const row = await readRow(db, id);

  if (row === undefined) return "unknown";

  return row.state === "open" ? "merge-busy" : "not-open";
}

export async function continueMerges(ports: JobPorts): Promise<void> {
  const rows = await ports.db
    .select({ id: proposals.id })
    .from(proposals)
    .where(eq(proposals.state, "accepting"))
    .orderBy(asc(proposals.id));

  await rows.reduce(async (earlier, { id }) => {
    await earlier;
    await continueMerge(ports, id, UNITS_PER_ACCEPT);
  }, Promise.resolve());
}
